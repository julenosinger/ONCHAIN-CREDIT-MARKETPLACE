import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import dayjs from 'dayjs'
import {
  useAccount,
  useConnect,
  useDisconnect,
  usePublicClient,
  useSwitchChain,
  useWriteContract,
} from 'wagmi'
import { keccak256, stringToHex, parseUnits, formatUnits } from 'viem'
import { addresses, abis } from './contracts'
import { arcTestnet } from './web3'
import './App.css'

const backendUrl = import.meta.env.VITE_BACKEND_URL

function toUSDC(value) {
  return parseUnits(String(value || '0'), 6)
}

function fromUSDC(value) {
  return Number(formatUnits(value || 0n, 6)).toFixed(2)
}

export default function App() {
  const { address, isConnected, chainId } = useAccount()
  const { connect, connectors } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChain } = useSwitchChain()
  const publicClient = usePublicClient({ chainId: arcTestnet.id })
  const { writeContractAsync } = useWriteContract()

  const [credits, setCredits] = useState([])
  const [portfolio, setPortfolio] = useState([])
  const [scoreInfo, setScoreInfo] = useState(null)
  const [status, setStatus] = useState('Pronto')

  const [form, setForm] = useState({
    principal: '',
    repayment: '',
    dueDate: '',
    schedule: '0',
    installmentCount: '1',
    minScore: '450',
    metadata: '{"company":"","invoiceRef":"","notes":""}',
    privateMode: true,
    collateralRequired: false,
    collateralToken: '',
    collateralAmount: '0',
    collateralValuation: '0',
    maxLtvBps: '7000',
  })

  useEffect(() => {
    if (isConnected && chainId !== arcTestnet.id) {
      switchChain({ chainId: arcTestnet.id })
    }
  }, [chainId, isConnected, switchChain])

  const missingConfig = useMemo(() => {
    return Object.entries(addresses)
      .filter(([, v]) => !v)
      .map(([k]) => k)
  }, [])

  async function refreshCredits() {
    if (!publicClient || missingConfig.length > 0) return

    setStatus('Carregando créditos...')
    const ids = await publicClient.readContract({
      address: addresses.factory,
      abi: abis.CreditFactory,
      functionName: 'getAllCreditIds',
    })

    const rows = []
    for (const id of ids) {
      const summary = await publicClient.readContract({
        address: addresses.factory,
        abi: abis.CreditFactory,
        functionName: 'getCreditSummary',
        args: [id],
      })

      const listing = await publicClient.readContract({
        address: addresses.marketplace,
        abi: abis.Marketplace,
        functionName: 'listings',
        args: [id],
      })

      const owner = await publicClient.readContract({
        address: addresses.token,
        abi: abis.CreditToken,
        functionName: 'ownerOf',
        args: [id],
      })

      rows.push({ id, summary, listing, owner })
    }

    setCredits(rows)
    setStatus('Créditos atualizados')
  }

  async function refreshPortfolio() {
    if (!address || !publicClient) return

    const mine = []
    for (const c of credits) {
      if (c.owner.toLowerCase() === address.toLowerCase()) {
        mine.push(c)
      }
    }
    setPortfolio(mine)
  }

  useEffect(() => {
    refreshCredits().catch((e) => setStatus(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicClient, isConnected])

  useEffect(() => {
    refreshPortfolio()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [credits, address])

  async function createCredit(e) {
    e.preventDefault()
    try {
      setStatus('Encriptando metadata e enviando ao IPFS...')
      const payload = JSON.parse(form.metadata)
      const encryptedResp = await axios.post(`${backendUrl}/metadata/encrypt-upload`, { payload })

      const metadataUri = encryptedResp.data.ipfs.uri
      const metadataHash = keccak256(stringToHex(JSON.stringify(encryptedResp.data.encrypted)))
      const identityHash = keccak256(stringToHex(address.toLowerCase()))

      setStatus('Enviando transação de criação de crédito...')
      const tx = await writeContractAsync({
        address: addresses.factory,
        abi: abis.CreditFactory,
        functionName: 'createCredit',
        args: [
          {
            principal: toUSDC(form.principal),
            repaymentAmount: toUSDC(form.repayment),
            dueDate: BigInt(dayjs(form.dueDate).unix()),
            schedule: Number(form.schedule),
            installmentCount: Number(form.installmentCount),
            borrowerIdentityHash: identityHash,
            metadataURI: metadataUri,
            metadataHash,
            isPrivate: form.privateMode,
            minimumScore: Number(form.minScore),
            collateralRequired: form.collateralRequired,
            collateralToken: form.collateralToken || '0x0000000000000000000000000000000000000000',
            collateralAmount: toUSDC(form.collateralAmount),
            collateralValuationUSDC: toUSDC(form.collateralValuation),
            maxLtvBps: Number(form.maxLtvBps),
            tokenURI: metadataUri,
          },
        ],
      })

      setStatus(`Crédito criado. Tx: ${tx}`)
      await refreshCredits()
    } catch (err) {
      setStatus(err?.shortMessage || err.message)
    }
  }

  async function listPrimary(creditId, principal) {
    const price = prompt('Preço de emissão primária em USDC', fromUSDC(principal))
    if (!price) return
    const tx = await writeContractAsync({
      address: addresses.marketplace,
      abi: abis.Marketplace,
      functionName: 'listPrimary',
      args: [creditId, toUSDC(price), BigInt(dayjs().add(7, 'day').unix())],
    })
    setStatus(`Listagem primária criada: ${tx}`)
    await refreshCredits()
  }

  async function buy(creditId, price) {
    const txApprove = await writeContractAsync({
      address: addresses.usdc,
      abi: [
        {
          type: 'function',
          name: 'approve',
          stateMutability: 'nonpayable',
          inputs: [
            { name: 'spender', type: 'address' },
            { name: 'value', type: 'uint256' },
          ],
          outputs: [{ name: '', type: 'bool' }],
        },
      ],
      functionName: 'approve',
      args: [addresses.marketplace, price],
    })

    setStatus(`Approve enviado: ${txApprove}`)

    const tx = await writeContractAsync({
      address: addresses.marketplace,
      abi: abis.Marketplace,
      functionName: 'buy',
      args: [creditId],
    })

    setStatus(`Compra concluída: ${tx}`)
    await refreshCredits()
  }

  async function repay(creditId) {
    const amount = prompt('Valor da parcela (USDC)')
    if (!amount) return

    await writeContractAsync({
      address: addresses.usdc,
      abi: [
        {
          type: 'function',
          name: 'approve',
          stateMutability: 'nonpayable',
          inputs: [
            { name: 'spender', type: 'address' },
            { name: 'value', type: 'uint256' },
          ],
          outputs: [{ name: '', type: 'bool' }],
        },
      ],
      functionName: 'approve',
      args: [addresses.repayment, toUSDC(amount)],
    })

    const tx = await writeContractAsync({
      address: addresses.repayment,
      abi: abis.RepaymentManager,
      functionName: 'repay',
      args: [creditId, toUSDC(amount)],
    })

    setStatus(`Repagamento enviado: ${tx}`)
    await refreshCredits()
  }

  async function loadScore() {
    if (!address) return
    const resp = await axios.get(`${backendUrl}/score/${address}`)
    setScoreInfo(resp.data)
  }

  return (
    <div className="app">
      <header>
        <h1>Onchain Credit Marketplace — Arc Testnet</h1>
        <p>Chain ID obrigatório: 5042002</p>
      </header>

      <section className="wallet">
        {!isConnected ? (
          <div className="row">
            {connectors.map((c) => (
              <button key={c.id} onClick={() => connect({ connector: c })}>
                Conectar com {c.name}
              </button>
            ))}
          </div>
        ) : (
          <div className="row">
            <span>Wallet: {address}</span>
            <span>Chain: {chainId}</span>
            <button onClick={() => disconnect()}>Desconectar</button>
            <button onClick={refreshCredits}>Atualizar créditos</button>
            <button onClick={loadScore}>Calcular score</button>
          </div>
        )}
      </section>

      {missingConfig.length > 0 && (
        <section className="warning">
          <strong>Faltam variáveis:</strong> {missingConfig.join(', ')}
        </section>
      )}

      <section className="grid">
        <form onSubmit={createCredit} className="card">
          <h2>Borrower: Criar Crédito</h2>
          <input placeholder="Principal (USDC)" value={form.principal} onChange={(e) => setForm({ ...form, principal: e.target.value })} />
          <input placeholder="Repayment (USDC)" value={form.repayment} onChange={(e) => setForm({ ...form, repayment: e.target.value })} />
          <input type="datetime-local" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          <select value={form.schedule} onChange={(e) => setForm({ ...form, schedule: e.target.value })}>
            <option value="0">Bullet</option>
            <option value="1">Installments</option>
          </select>
          <input placeholder="Installments" value={form.installmentCount} onChange={(e) => setForm({ ...form, installmentCount: e.target.value })} />
          <input placeholder="Score mínimo" value={form.minScore} onChange={(e) => setForm({ ...form, minScore: e.target.value })} />
          <textarea rows={5} value={form.metadata} onChange={(e) => setForm({ ...form, metadata: e.target.value })} />
          <label>
            <input type="checkbox" checked={form.privateMode} onChange={(e) => setForm({ ...form, privateMode: e.target.checked })} /> Modo privado
          </label>
          <label>
            <input type="checkbox" checked={form.collateralRequired} onChange={(e) => setForm({ ...form, collateralRequired: e.target.checked })} /> Exigir colateral
          </label>
          <input placeholder="Token colateral" value={form.collateralToken} onChange={(e) => setForm({ ...form, collateralToken: e.target.value })} />
          <input placeholder="Qtde colateral" value={form.collateralAmount} onChange={(e) => setForm({ ...form, collateralAmount: e.target.value })} />
          <input placeholder="Valuation USDC" value={form.collateralValuation} onChange={(e) => setForm({ ...form, collateralValuation: e.target.value })} />
          <input placeholder="Max LTV bps" value={form.maxLtvBps} onChange={(e) => setForm({ ...form, maxLtvBps: e.target.value })} />

          <button type="submit">Criar crédito</button>
        </form>

        <div className="card">
          <h2>Marketplace (Primary + Secondary)</h2>
          {credits.map((c) => {
            const [borrower, principal, repayment, dueDate, minScore, funded, defaulted, settled] = c.summary
            const yieldPct = Number(((Number(repayment) - Number(principal)) / Number(principal)) * 100).toFixed(2)
            const [seller, price, expiresAt, primary, active] = c.listing

            return (
              <div key={String(c.id)} className="credit">
                <p><strong>ID:</strong> {String(c.id)}</p>
                <p><strong>Borrower:</strong> {borrower}</p>
                <p><strong>Holder:</strong> {c.owner}</p>
                <p><strong>Yield:</strong> {yieldPct}%</p>
                <p><strong>Vencimento:</strong> {dayjs.unix(Number(dueDate)).format('YYYY-MM-DD HH:mm')}</p>
                <p><strong>Min Score:</strong> {String(minScore)}</p>
                <p><strong>Status:</strong> {defaulted ? 'Default' : settled ? 'Settled' : funded ? 'Funded' : 'Open'}</p>
                <p><strong>Listing:</strong> {active ? `${primary ? 'Primária' : 'Secundária'} ${fromUSDC(price)} USDC` : 'Sem listagem'}</p>
                {isConnected && borrower.toLowerCase() === address?.toLowerCase() && !funded && (
                  <button onClick={() => listPrimary(c.id, principal)}>Listar primário</button>
                )}
                {isConnected && active && seller.toLowerCase() !== address?.toLowerCase() && (
                  <button onClick={() => buy(c.id, price)}>Comprar</button>
                )}
                {isConnected && borrower.toLowerCase() === address?.toLowerCase() && funded && !defaulted && !settled && (
                  <button onClick={() => repay(c.id)}>Pagar parcela</button>
                )}
                {active && <p>Expira em: {Number(expiresAt) ? dayjs.unix(Number(expiresAt)).format('YYYY-MM-DD HH:mm') : 'sem expiração'}</p>}
              </div>
            )
          })}
        </div>

        <div className="card">
          <h2>Dashboard do Investidor</h2>
          <p>Posições ativas: {portfolio.length}</p>
          {portfolio.map((p) => {
            const [, principal, repayment, dueDate, , , defaulted, settled] = p.summary
            return (
              <div key={String(p.id)} className="credit">
                <p><strong>Credit #{String(p.id)}</strong></p>
                <p>Principal: {fromUSDC(principal)} USDC</p>
                <p>Retorno esperado: {fromUSDC(repayment)} USDC</p>
                <p>Vencimento: {dayjs.unix(Number(dueDate)).format('YYYY-MM-DD HH:mm')}</p>
                <p>Status: {defaulted ? 'Defaulted' : settled ? 'Settled' : 'Active'}</p>
              </div>
            )
          })}
        </div>

        <div className="card">
          <h2>Score de Crédito Determinístico</h2>
          {scoreInfo ? (
            <>
              <p><strong>Score:</strong> {scoreInfo.score}</p>
              <pre>{JSON.stringify(scoreInfo.metrics, null, 2)}</pre>
            </>
          ) : (
            <p>Conecte wallet e clique em "Calcular score".</p>
          )}
        </div>
      </section>

      <footer>
        <small>{status}</small>
      </footer>
    </div>
  )
}
