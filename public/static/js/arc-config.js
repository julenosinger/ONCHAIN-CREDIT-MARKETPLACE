// === Arc Network Configuration ===
const ARC_CONFIG = {
  chainId: 5042002,
  chainIdHex: '0x4CEF52',
  name: 'Arc Testnet',
  rpcUrl: 'https://rpc.testnet.arc.network',
  rpcUrls: [
    'https://rpc.testnet.arc.network',
    'https://rpc.blockdaemon.testnet.arc.network',
    'https://rpc.drpc.testnet.arc.network'
  ],
  explorer: 'https://testnet.arcscan.app',
  faucet: 'https://faucet.circle.com',
  currency: {
    name: 'USDC',
    symbol: 'USDC',
    decimals: 18
  }
};

// Contract addresses — Deployed on Arc Testnet (2026-04-09)
const CONTRACT_ADDRESSES = {
  usdc: '0x3600000000000000000000000000000000000000',
  creditFactory: '0x425BFa41161C787BAF08C6615c2d92044a813DD4',
  creditToken: '0xa112cc3B4c4B1518fF07bbF2F6E84C404c699165',
  marketplace: '0x71A8bC79E6a64f2dc39F0479be9CdE9885a91C1f',
  repaymentManager: '0x2bc1F0E41F1F2F8708a7dF2E138634cf0F101022',
  creditScore: '0x172787626C50490E983008d798A45D9461C97a04'
};

// Contract ABIs will be loaded dynamically
const CONTRACT_ABIS = {};

async function loadABIs() {
  const names = ['CreditFactory', 'CreditToken', 'Marketplace', 'RepaymentManager', 'CreditScore'];
  for (const name of names) {
    try {
      const resp = await fetch(`/static/abi/${name}.json`);
      const data = await resp.json();
      CONTRACT_ABIS[name] = data.abi;
    } catch (e) {
      console.warn(`Failed to load ABI for ${name}:`, e);
    }
  }
}

// ERC20 minimal ABI for USDC
const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function name() view returns (string)'
];

window.ARC_CONFIG = ARC_CONFIG;
window.CONTRACT_ADDRESSES = CONTRACT_ADDRESSES;
window.CONTRACT_ABIS = CONTRACT_ABIS;
window.ERC20_ABI = ERC20_ABI;
window.loadABIs = loadABIs;
