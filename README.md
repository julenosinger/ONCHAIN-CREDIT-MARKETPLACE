# Onchain Credit Marketplace

## Tokenized Credit & Yield Platform on Arc Network

A production-grade decentralized application for tokenizing credit positions (future receivables, loans) and selling them to investors who earn yield in USDC. Built entirely on **Arc Network (Chain ID: 5042002)**.

## URLs

- **Live Application**: https://onchain-credit-marketplace.pages.dev/
- **Arc Explorer**: https://testnet.arcscan.app
- **Arc Faucet**: https://faucet.circle.com
- **GitHub**: https://github.com/julenosinger/ONCHAIN-CREDIT-MARKETPLACE

## Deployed Contract Addresses (Arc Testnet)

| Contract | Address |
|----------|---------|
| USDC (Native) | `0x3600000000000000000000000000000000000000` |
| CreditToken | [`0xa112cc3B4c4B1518fF07bbF2F6E84C404c699165`](https://testnet.arcscan.app/address/0xa112cc3B4c4B1518fF07bbF2F6E84C404c699165) |
| CreditScore | [`0x172787626C50490E983008d798A45D9461C97a04`](https://testnet.arcscan.app/address/0x172787626C50490E983008d798A45D9461C97a04) |
| CreditFactory | [`0x425BFa41161C787BAF08C6615c2d92044a813DD4`](https://testnet.arcscan.app/address/0x425BFa41161C787BAF08C6615c2d92044a813DD4) |
| RepaymentManager | [`0x2bc1F0E41F1F2F8708a7dF2E138634cf0F101022`](https://testnet.arcscan.app/address/0x2bc1F0E41F1F2F8708a7dF2E138634cf0F101022) |
| Marketplace | [`0x71A8bC79E6a64f2dc39F0479be9CdE9885a91C1f`](https://testnet.arcscan.app/address/0x71A8bC79E6a64f2dc39F0479be9CdE9885a91C1f) |

## Features

### Completed

- **Credit Origination**: Borrowers create structured credit positions with principal, repayment amount, interest rate, due dates, and payment schedules
- **ERC-721 Tokenization**: Each credit position is minted as a unique NFT (Arc Credit Position - aCREDIT)
- **Marketplace**: Full primary issuance + secondary market trading with filtering by yield, duration, risk score
- **Repayment System**: Smart contract-managed repayments with automatic yield distribution to token holders
- **Credit Scoring Engine**: Deterministic scoring (0-1000) based on onchain Arc Network data — TX frequency, DeFi interactions, repayment history
- **Privacy Layer**: AES-256-GCM encryption for private metadata, IPFS content addressing, onchain hash verification
- **Risk Management**: Minimum score requirements, collateral support with LTV validation, default tracking
- **Default Handling**: Automatic default detection with reputation impact and collateral liquidation
- **Investor Dashboard**: Portfolio tracking with active investments, expected yield, repayment schedules
- **Theme System**: Full light/dark mode with system preference detection, persistence, smooth transitions
- **Wallet Integration**: MetaMask support with auto-network switching to Arc Testnet
- **Responsive Design**: Mobile-first fintech-grade UI

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/score/:wallet` | Get wallet credit score from Arc onchain data |
| POST | `/api/score/compute` | Compute score from metrics |
| POST | `/api/metadata/encrypt` | Encrypt metadata (AES-256-GCM) |
| POST | `/api/metadata/decrypt` | Decrypt metadata |
| POST | `/api/ipfs/upload` | Upload data to IPFS (content-addressed) |

### Smart Contracts (Solidity 0.8.24)

| Contract | Description |
|----------|-------------|
| `CreditFactory.sol` | Creates credit agreements with structured terms |
| `CreditToken.sol` | ERC-721 NFT representing credit positions |
| `Marketplace.sol` | Primary + secondary market trading in USDC |
| `RepaymentManager.sol` | Manages repayments and yield distribution |
| `CreditScore.sol` | Onchain deterministic credit scoring |

### Security Features

- ReentrancyGuard on all state-changing functions
- AccessControl with role-based permissions
- SafeERC20 for all token transfers
- Input validation and custom errors
- Double-funding and double-repayment prevention
- LTV validation for collateral

## Data Architecture

- **Onchain**: Credit positions, ownership, repayment state, credit scores
- **IPFS**: Metadata (encrypted for private mode, plaintext for public)
- **Edge API**: Scoring engine, encryption service (Cloudflare Workers)

## Tech Stack

- **Smart Contracts**: Solidity 0.8.24 + OpenZeppelin + Hardhat
- **Frontend**: Vanilla JS + Tailwind CSS + ethers.js
- **Backend API**: Hono (Cloudflare Workers)
- **Deployment**: Cloudflare Pages
- **Blockchain**: Arc Network (Chain ID: 5042002)

## Project Structure

```
webapp/
├── contracts/            # Solidity smart contracts
│   ├── CreditFactory.sol
│   ├── CreditToken.sol
│   ├── Marketplace.sol
│   ├── RepaymentManager.sol
│   └── CreditScore.sol
├── src/
│   └── index.tsx         # Hono API backend (edge)
├── public/static/        # Frontend assets
│   ├── css/app.css       # Global styles
│   └── js/
│       ├── theme.js      # Light/dark theme system
│       ├── arc-config.js  # Arc Network config + contract addresses
│       ├── wallet.js     # Wallet connection manager
│       ├── contracts.js  # Contract interaction layer
│       ├── scoring.js    # Credit scoring engine
│       ├── privacy.js    # Encryption & IPFS
│       ├── marketplace.js # Marketplace logic
│       ├── dashboard.js  # Portfolio dashboard
│       └── app.js        # Main application
├── scripts/
│   └── deploy.js         # Hardhat deployment to Arc
├── backend/              # Node.js scoring backend (optional)
├── artifacts/            # Compiled contract ABIs
├── hardhat.config.cjs    # Hardhat configuration for Arc
├── wrangler.jsonc        # Cloudflare Pages config
├── vite.config.ts        # Vite build config
├── ecosystem.config.cjs  # PM2 config
└── package.json
```

## Development

```bash
# Install dependencies
npm install

# Compile smart contracts
npm run compile

# Build frontend + API
npm run build

# Start local development
pm2 start ecosystem.config.cjs

# Deploy to Arc Network
npm run deploy:arc

# Deploy to Cloudflare Pages
npm run deploy
```

## Credit Scoring Algorithm

Score range: **0 to 1000** (deterministic and reproducible)

| Component | Max Impact |
|-----------|-----------|
| Base Score | 300 pts |
| TX Frequency | +220 pts |
| DeFi Interactions | +180 pts |
| Successful Repayments | +280 pts |
| Default Penalty | -420 pts |
| Gas Usage Penalty | -80 pts |

**Formula**: `Score = min(max(Base + TX + DeFi + Repay - Default - Gas, 0), 1000)`

## Deployment

- **Platform**: Cloudflare Pages
- **Status**: Active
- **Network**: Arc Testnet (Chain ID: 5042002)
- **Last Updated**: April 2026
