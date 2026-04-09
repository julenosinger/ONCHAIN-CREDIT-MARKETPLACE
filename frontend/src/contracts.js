import CreditFactory from './abi/CreditFactory.json'
import CreditToken from './abi/CreditToken.json'
import Marketplace from './abi/Marketplace.json'
import RepaymentManager from './abi/RepaymentManager.json'
import CreditScore from './abi/CreditScore.json'

export const addresses = {
  factory: import.meta.env.VITE_CREDIT_FACTORY,
  token: import.meta.env.VITE_CREDIT_TOKEN,
  marketplace: import.meta.env.VITE_MARKETPLACE,
  repayment: import.meta.env.VITE_REPAYMENT_MANAGER,
  score: import.meta.env.VITE_CREDIT_SCORE,
  usdc: import.meta.env.VITE_USDC_ADDRESS,
}

export const abis = {
  CreditFactory: CreditFactory.abi,
  CreditToken: CreditToken.abi,
  Marketplace: Marketplace.abi,
  RepaymentManager: RepaymentManager.abi,
  CreditScore: CreditScore.abi,
}
