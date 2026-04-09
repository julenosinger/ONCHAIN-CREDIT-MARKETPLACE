import { Hono } from 'hono'
import { cors } from 'hono/cors'

type Bindings = {
  ARC_RPC_URL: string
  METADATA_ENCRYPTION_SECRET: string
}

const app = new Hono<{ Bindings: Bindings }>()

app.use('/api/*', cors())

// Health check
app.get('/api/health', (c) => {
  return c.json({ ok: true, chainId: 5042002, network: 'Arc Testnet', timestamp: Date.now() })
})

// Credit scoring - compute deterministic score from onchain metrics
app.post('/api/score/compute', async (c) => {
  const body = await c.req.json()
  const { txFrequency, defiInteractionCount, successfulRepayments, defaults, avgGasUsed } = body

  const base = 300
  const txComponent = Math.min((txFrequency || 0) * 4, 220)
  const defiComponent = Math.min((defiInteractionCount || 0) * 6, 180)
  const repaymentComponent = Math.min((successfulRepayments || 0) * 35, 280)
  const defaultPenalty = Math.min((defaults || 0) * 120, 420)
  const gasPenalty = (avgGasUsed || 0) > 350000
    ? Math.min(Math.floor(((avgGasUsed || 0) - 350000) / 1000), 80)
    : 0

  const raw = base + txComponent + defiComponent + repaymentComponent
  const finalScore = Math.max(raw - defaultPenalty - gasPenalty, 0)
  const score = Math.min(finalScore, 1000)

  return c.json({
    score,
    breakdown: { base, txComponent, defiComponent, repaymentComponent, defaultPenalty, gasPenalty },
    metrics: { txFrequency, defiInteractionCount, successfulRepayments, defaults, avgGasUsed },
    deterministic: true,
    algorithm: 'v1.0'
  })
})

// Fetch onchain metrics for a wallet from Arc Network
app.get('/api/score/:wallet', async (c) => {
  const wallet = c.req.param('wallet')
  const rpcUrl = c.env?.ARC_RPC_URL || 'https://rpc.testnet.arc.network'

  try {
    // Get transaction count
    const txCountResp = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1,
        method: 'eth_getTransactionCount',
        params: [wallet, 'latest']
      })
    })
    const txCountData = await txCountResp.json() as any
    const txCount = parseInt(txCountData.result || '0', 16)

    // Get balance
    const balResp = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 2,
        method: 'eth_getBalance',
        params: [wallet, 'latest']
      })
    })
    const balData = await balResp.json() as any
    const balance = parseInt(balData.result || '0', 16)

    // Get latest block for estimation
    const blockResp = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 3,
        method: 'eth_blockNumber',
        params: []
      })
    })
    const blockData = await blockResp.json() as any
    const blockNumber = parseInt(blockData.result || '0', 16)

    // Derive metrics deterministically from onchain data
    const txFrequency = Math.min(txCount * 100, 5500)  // Scale tx count
    const defiInteractionCount = Math.floor(txCount * 0.3)  // Estimate DeFi interactions
    const avgGasUsed = txCount > 0 ? 150000 : 0  // Average gas estimate

    // Compute score
    const base = 300
    const txComponent = Math.min(txFrequency * 4, 220)
    const defiComponent = Math.min(defiInteractionCount * 6, 180)
    const repaymentComponent = 0
    const defaultPenalty = 0
    const gasPenalty = avgGasUsed > 350000
      ? Math.min(Math.floor((avgGasUsed - 350000) / 1000), 80) : 0

    const raw = base + txComponent + defiComponent + repaymentComponent
    const score = Math.min(Math.max(raw - defaultPenalty - gasPenalty, 0), 1000)

    return c.json({
      wallet,
      score,
      metrics: {
        txFrequency,
        defiInteractionCount,
        successfulRepayments: 0,
        defaults: 0,
        avgGasUsed,
        measuredAt: Math.floor(Date.now() / 1000)
      },
      onchain: {
        txCount,
        balance: balance.toString(),
        blockNumber
      },
      deterministic: true,
      network: 'Arc Testnet',
      chainId: 5042002
    })
  } catch (err: any) {
    return c.json({ error: err.message, wallet }, 500)
  }
})

// Privacy - encrypt metadata (using Web Crypto API for CF Workers)
app.post('/api/metadata/encrypt', async (c) => {
  const { payload } = await c.req.json()
  if (!payload) return c.json({ error: 'Payload is required' }, 400)

  const encoder = new TextEncoder()
  const plaintext = encoder.encode(JSON.stringify(payload))

  // Generate random IV
  const iv = crypto.getRandomValues(new Uint8Array(12))

  // Derive key from secret
  const secret = c.env?.METADATA_ENCRYPTION_SECRET || 'onchain-credit-marketplace-default-key-2024'
  const keyMaterial = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'PBKDF2' }, false, ['deriveKey']
  )
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: encoder.encode('arc-credit-salt'), iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  )

  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext)
  const encryptedArray = new Uint8Array(encrypted)

  // Convert to hex strings
  const ivHex = Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join('')
  const ciphertextHex = Array.from(encryptedArray).map(b => b.toString(16).padStart(2, '0')).join('')

  // Generate content hash for onchain verification
  const hashBuffer = await crypto.subtle.digest('SHA-256', plaintext)
  const hashArray = new Uint8Array(hashBuffer)
  const contentHash = '0x' + Array.from(hashArray).map(b => b.toString(16).padStart(2, '0')).join('')

  return c.json({
    encrypted: {
      algorithm: 'AES-256-GCM',
      iv: ivHex,
      ciphertext: ciphertextHex
    },
    contentHash,
    timestamp: Date.now()
  })
})

// Decrypt metadata (for authorized access)
app.post('/api/metadata/decrypt', async (c) => {
  const { iv: ivHex, ciphertext: ciphertextHex } = await c.req.json()
  if (!ivHex || !ciphertextHex) return c.json({ error: 'iv and ciphertext are required' }, 400)

  try {
    const encoder = new TextEncoder()
    const iv = new Uint8Array(ivHex.match(/.{1,2}/g).map((byte: string) => parseInt(byte, 16)))
    const ciphertext = new Uint8Array(ciphertextHex.match(/.{1,2}/g).map((byte: string) => parseInt(byte, 16)))

    const secret = c.env?.METADATA_ENCRYPTION_SECRET || 'onchain-credit-marketplace-default-key-2024'
    const keyMaterial = await crypto.subtle.importKey(
      'raw', encoder.encode(secret), { name: 'PBKDF2' }, false, ['deriveKey']
    )
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: encoder.encode('arc-credit-salt'), iterations: 100000, hash: 'SHA-256' },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    )

    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
    const decoded = new TextDecoder().decode(decrypted)
    const payload = JSON.parse(decoded)

    return c.json({ payload, decryptedAt: Date.now() })
  } catch (err: any) {
    return c.json({ error: 'Decryption failed - invalid key or corrupted data' }, 400)
  }
})

// IPFS simulation - store metadata with content addressing
app.post('/api/ipfs/upload', async (c) => {
  const { data } = await c.req.json()
  if (!data) return c.json({ error: 'Data is required' }, 400)

  const encoder = new TextEncoder()
  const content = encoder.encode(JSON.stringify(data))
  const hashBuffer = await crypto.subtle.digest('SHA-256', content)
  const hashArray = new Uint8Array(hashBuffer)
  const cid = 'bafybeig' + Array.from(hashArray.slice(0, 20)).map(b => b.toString(16).padStart(2, '0')).join('')

  return c.json({
    cid,
    uri: `ipfs://${cid}`,
    gateway: `https://ipfs.io/ipfs/${cid}`,
    size: content.length,
    timestamp: Date.now()
  })
})

// Serve main HTML page
app.get('*', (c) => {
  return c.html(getMainHTML())
})

function getMainHTML() {
  return `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Onchain Credit Marketplace | Arc Network</title>
  <meta name="description" content="Tokenized Credit & Yield Platform on Arc Network">
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>💰</text></svg>">
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          colors: {
            brand: { 50:'#eff6ff',100:'#dbeafe',200:'#bfdbfe',300:'#93c5fd',400:'#60a5fa',500:'#3b82f6',600:'#2563eb',700:'#1d4ed8',800:'#1e40af',900:'#1e3a8a' },
            arc: { light:'#00d4aa', dark:'#00b894', deep:'#009975' },
            surface: { light:'#ffffff', dark:'#0f172a' },
            card: { light:'#f8fafc', dark:'#1e293b' },
            muted: { light:'#64748b', dark:'#94a3b8' }
          }
        }
      }
    }
  </script>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.5.0/css/all.min.css" rel="stylesheet">
  <link href="/static/css/app.css" rel="stylesheet">
</head>
<body class="bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-300 min-h-screen">
  <div id="app"></div>
  <script src="https://cdn.jsdelivr.net/npm/ethers@6.13.4/dist/ethers.umd.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/dayjs@1.11.13/dayjs.min.js"></script>
  <script src="/static/js/theme.js"></script>
  <script src="/static/js/arc-config.js"></script>
  <script src="/static/js/wallet.js"></script>
  <script src="/static/js/contracts.js"></script>
  <script src="/static/js/scoring.js"></script>
  <script src="/static/js/privacy.js"></script>
  <script src="/static/js/marketplace.js"></script>
  <script src="/static/js/dashboard.js"></script>
  <script src="/static/js/app.js"></script>
</body>
</html>`
}

export default app
