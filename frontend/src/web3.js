import { createConfig, http } from 'wagmi'
import { injected, walletConnect } from 'wagmi/connectors'
import { defineChain } from 'viem'

export const arcTestnet = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'Arc', symbol: 'ARC', decimals: 18 },
  rpcUrls: {
    default: { http: [import.meta.env.VITE_ARC_RPC_URL] },
    public: { http: [import.meta.env.VITE_ARC_RPC_URL] },
  },
  blockExplorers: {
    default: { name: 'Arc Explorer', url: 'https://explorer.arc.network' },
  },
  testnet: true,
})

export const config = createConfig({
  chains: [arcTestnet],
  connectors: [
    injected(),
    walletConnect({
      projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID,
      showQrModal: true,
    }),
  ],
  transports: {
    [arcTestnet.id]: http(import.meta.env.VITE_ARC_RPC_URL),
  },
})
