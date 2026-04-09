# Onchain Credit Marketplace — Arc Testnet (Chain ID 5042002)

## Project Overview
- **Name**: Onchain Credit Marketplace
- **Goal**: Tokenizar posições de crédito onchain e permitir funding/investimento em USDC com mercado primário e secundário.
- **Network obrigatório**: **Arc Testnet** (`chainId: 5042002`)
- **Stack**:
  - Smart Contracts: Solidity + Hardhat
  - Frontend: React + Vite + Wagmi/Viem
  - Backend: Node.js/Express (score determinístico + IPFS/privacy)
  - Storage: IPFS (com metadata encriptada opcional)

---

## Current Status
### ✅ Implementado
1. **CreditFactory.sol**
   - Originação de crédito com estrutura real:
     - principal, repaymentAmount, interestBps, dueDate
     - payment schedule (bullet/installments)
     - borrowerIdentityHash
     - metadataURI + metadataHash
   - Controles de risco:
     - score mínimo
     - colateral opcional
     - validação LTV (`maxLtvBps`)

2. **CreditToken.sol (ERC-721)**
   - Um NFT por posição de crédito
   - Ownership tracking e transferibilidade

3. **Marketplace.sol**
   - **Primário** (borrower → investor)
   - **Secundário** (investor → investor)
   - Compra com USDC via `buy()`

4. **RepaymentManager.sol**
   - Recebe repayment do borrower
   - Distribui automaticamente ao holder atual do token
   - Suporta pagamento parcial
   - Marca default por atraso
   - Aciona liberação/liquidação de colateral

5. **CreditScore.sol**
   - Score determinístico e reproduzível (0-1000)
   - Fórmula onchain com métricas verificáveis
   - Atualização via `updateFromMetrics()`
   - Penalização por default e atualização por repayment

6. **Backend real (sem mocks)**
   - Coleta métrica onchain via Arc RPC
   - Score determinístico replicando fórmula do contrato
   - Upload IPFS
   - Encriptação AES-256-GCM para metadata privada

7. **Frontend React**
   - Conexão com MetaMask + WalletConnect
   - Criação de crédito (borrower)
   - Listagem e compra (investor)
   - Repayment
   - Dashboard do investidor
   - Consulta de score via backend

8. **Segurança implementada**
   - Access control (`AccessControl`)
   - `ReentrancyGuard`
   - `SafeERC20`
   - Proteção contra double funding / double settlement por estado

9. **Eventos onchain**
   - `CreditCreated`
   - `CreditFunded`
   - `RepaymentMade`
   - `CreditDefaultTriggered`

---

## ⚠️ Pending (bloqueado por credenciais/rede)
- Deploy real em Arc Testnet não executado ainda neste ambiente porque faltam:
  - `ARC_RPC_URL`
  - `PRIVATE_KEY` com saldo
  - endereço real de `USDC` em Arc Testnet
  - (opcional) dados de verificação no explorer

Sem essas variáveis, não é possível publicar endereços finais dos contratos.

---

## Entry URIs (Backend + Frontend)

### Frontend
- `http://localhost:3000`

### Backend API
- `GET /health`
- `GET /score/:wallet`
  - retorna score determinístico e métricas onchain
- `POST /score/:wallet/push`
  - calcula score + publica em `CreditScore`
- `POST /metadata/encrypt-upload`
  - encripta payload JSON e envia para IPFS

---

## Contract Modules
- `/contracts/CreditFactory.sol`
- `/contracts/CreditToken.sol`
- `/contracts/Marketplace.sol`
- `/contracts/RepaymentManager.sol`
- `/contracts/CreditScore.sol`

### Data Model (resumo)
`CreditPosition`:
- borrower
- principal
- repaymentAmount
- interestBps
- dueDate
- schedule
- installmentCount
- borrowerIdentityHash
- metadataURI / metadataHash
- isPrivate
- minimumScore
- funded / defaulted / settled
- collateral settings

---

## Project Structure
- `/contracts` – contratos Solidity
- `/frontend` – UI React/Vite
- `/backend` – APIs de score/privacy/IPFS
- `/ipfs` – reservado para integração e payloads
- `/scripts` – deploy/verify/export ABI
- `/utils` – reservado para utilitários extras

---

## Setup
```bash
cd /home/user/webapp
cp .env.example .env
# preencher todas as variáveis obrigatórias

npm install
npm run compile
npm run export:abi
```

### Rodar backend
```bash
cd /home/user/webapp
npm run backend
```

### Rodar frontend
```bash
cd /home/user/webapp
npm run frontend:dev
```

---

## Deploy on Arc Testnet
```bash
cd /home/user/webapp
npm run deploy:arc
```

Após deploy:
1. Copiar `deployments.arc.json`
2. Atualizar `frontend/.env` com os endereços
3. (Opcional) verificar contratos:
```bash
npm run verify:arc
```

---

## Not Implemented Yet (roadmap técnico)
1. Ordem book avançada para mercado secundário
2. Engine de parcelamento com calendário obrigatório por parcela
3. Liquidator dedicado para colateral com desconto configurável
4. Índices/subgraph para filtros de marketplace em alta escala
5. Camada zk-proof completa (atualmente estrutura “zk-ready”, não prova zk completa)
6. Testes de integração E2E com fork Arc

---

## Recommended Next Steps
1. Informar credenciais Arc e USDC real para deploy imediato
2. Executar deploy e registrar endereços finais
3. Popular score inicial de borrowers via backend `/score/:wallet/push`
4. Validar fluxo completo:
   - create credit → list primary → buy → repay parcial/total → default
5. Adicionar suíte de testes de segurança (fuzz/invariants)

---

## Deployment Status
- **Platform**: Arc Testnet (EVM)
- **Status**: 🟡 Código pronto para deploy, aguardando variáveis de ambiente reais
- **Last Updated**: 2026-04-09
