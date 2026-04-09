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

// Contract addresses — MUST be updated after deployment
const CONTRACT_ADDRESSES = {
  usdc: '',
  creditFactory: '',
  creditToken: '',
  marketplace: '',
  repaymentManager: '',
  creditScore: ''
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
