require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { Wallet, Contract, JsonRpcProvider } = require("ethers");

const { collectOnchainMetrics, computeDeterministicScore, buildEvidenceHash } = require("./scoreEngine");
const { encryptJson } = require("./privacy");
const { uploadJSON } = require("./ipfs");

const CreditScoreArtifact = require("../artifacts/contracts/CreditScore.sol/CreditScore.json");

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "1mb" }));

function getCreditScoreContract() {
  const provider = new JsonRpcProvider(process.env.ARC_RPC_URL, 5042002);
  const signer = new Wallet(process.env.PRIVATE_KEY, provider);

  return new Contract(
    process.env.VITE_CREDIT_SCORE,
    CreditScoreArtifact.abi,
    signer
  );
}

app.get("/health", (_, res) => {
  res.json({ ok: true, chainId: 5042002 });
});

app.get("/score/:wallet", async (req, res) => {
  try {
    const metrics = await collectOnchainMetrics(req.params.wallet, req.query);
    const score = computeDeterministicScore(metrics);

    res.json({ wallet: req.params.wallet, score, metrics });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/score/:wallet/push", async (req, res) => {
  try {
    const wallet = req.params.wallet;
    const metrics = await collectOnchainMetrics(wallet, req.body || {});
    const score = computeDeterministicScore(metrics);
    const evidenceHash = buildEvidenceHash(wallet, metrics);

    const evidence = await uploadJSON({ wallet, metrics, score, evidenceHash });

    const contract = getCreditScoreContract();
    const tx = await contract.updateFromMetrics(wallet, metrics, evidence.uri, evidenceHash);
    const receipt = await tx.wait();

    res.json({
      wallet,
      score,
      metrics,
      evidence,
      txHash: receipt.hash,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/metadata/encrypt-upload", async (req, res) => {
  try {
    const { payload } = req.body;
    if (!payload) throw new Error("payload é obrigatório");

    const encrypted = encryptJson(payload, process.env.METADATA_ENCRYPTION_SECRET);
    const upload = await uploadJSON(encrypted);

    res.json({
      encrypted,
      ipfs: upload,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

const port = Number(process.env.BACKEND_PORT || 8787);
app.listen(port, () => {
  console.log(`Backend rodando em http://localhost:${port}`);
});
