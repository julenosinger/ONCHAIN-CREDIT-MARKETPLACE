const { JsonRpcProvider, isAddress, keccak256, toUtf8Bytes } = require("ethers");
const { z } = require("zod");

const envSchema = z.object({
  ARC_RPC_URL: z.string().min(1),
  SCORING_LOOKBACK_BLOCKS: z.string().default("5000"),
  DEFI_PROTOCOL_ADDRESSES: z.string().optional(),
});

function getProvider() {
  const env = envSchema.parse(process.env);
  return new JsonRpcProvider(env.ARC_RPC_URL, 5042002);
}

function getDeFiSet() {
  const addresses = (process.env.DEFI_PROTOCOL_ADDRESSES || "")
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean)
    .map((a) => a.toLowerCase())
    .filter((a) => isAddress(a));

  return new Set(addresses);
}

function computeDeterministicScore(metrics) {
  const base = 300;
  const txComponent = Math.min(metrics.txFrequency * 4, 220);
  const defiComponent = Math.min(metrics.defiInteractionCount * 6, 180);
  const repaymentComponent = Math.min(metrics.successfulRepayments * 35, 280);

  const defaultPenalty = Math.min(metrics.defaults * 120, 420);
  const gasPenalty = metrics.avgGasUsed > 350000 ? Math.min(Math.floor((metrics.avgGasUsed - 350000) / 1000), 80) : 0;

  const raw = base + txComponent + defiComponent + repaymentComponent;
  const finalScore = Math.max(raw - defaultPenalty - gasPenalty, 0);

  return Math.min(finalScore, 1000);
}

async function collectOnchainMetrics(wallet, options = {}) {
  if (!isAddress(wallet)) throw new Error("wallet inválida");

  const provider = getProvider();
  const defiSet = getDeFiSet();
  const latest = await provider.getBlockNumber();
  const lookback = Number(options.lookbackBlocks || process.env.SCORING_LOOKBACK_BLOCKS || 5000);
  const fromBlock = Math.max(latest - lookback, 1);

  let txCount = 0;
  let gasSum = 0n;
  let defiInteractions = 0;

  for (let i = fromBlock; i <= latest; i++) {
    const block = await provider.getBlock(i, true);
    if (!block?.transactions?.length) continue;

    for (const tx of block.transactions) {
      const from = tx.from?.toLowerCase();
      const to = tx.to?.toLowerCase();
      const walletLower = wallet.toLowerCase();

      if (from === walletLower || to === walletLower) {
        txCount += 1;
        const receipt = await provider.getTransactionReceipt(tx.hash);
        gasSum += receipt.gasUsed;

        if (to && defiSet.has(to)) {
          defiInteractions += 1;
        }
      }
    }
  }

  const startBlock = await provider.getBlock(fromBlock);
  const endBlock = await provider.getBlock(latest);
  const seconds = Number(endBlock.timestamp - startBlock.timestamp) || 1;
  const txPerDayX100 = Math.floor((txCount * 86400 * 100) / seconds);

  const avgGasUsed = txCount > 0 ? Number(gasSum / BigInt(txCount)) : 0;

  return {
    txFrequency: txPerDayX100,
    defiInteractionCount: defiInteractions,
    successfulRepayments: Number(options.successfulRepayments || 0),
    defaults: Number(options.defaults || 0),
    avgGasUsed,
    measuredAt: Math.floor(Date.now() / 1000),
  };
}

function buildEvidenceHash(wallet, metrics) {
  return keccak256(toUtf8Bytes(JSON.stringify({ wallet: wallet.toLowerCase(), metrics })));
}

module.exports = {
  collectOnchainMetrics,
  computeDeterministicScore,
  buildEvidenceHash,
};
