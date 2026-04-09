// === Contract Interaction Layer ===
const ContractManager = {
  // Get a read-only contract instance
  getReadContract(name, address) {
    const abi = CONTRACT_ABIS[name];
    if (!abi) {
      console.error(`ABI not loaded for ${name}`);
      return null;
    }
    const provider = new ethers.JsonRpcProvider(ARC_CONFIG.rpcUrl, ARC_CONFIG.chainId);
    return new ethers.Contract(address, abi, provider);
  },

  // Get a write contract instance (requires signer)
  getWriteContract(name, address) {
    if (!WalletManager.signer) {
      Toast.show('Please connect your wallet first', 'warning');
      return null;
    }
    const abi = CONTRACT_ABIS[name];
    if (!abi) {
      console.error(`ABI not loaded for ${name}`);
      return null;
    }
    return new ethers.Contract(address, abi, WalletManager.signer);
  },

  getUSDCRead() {
    const provider = new ethers.JsonRpcProvider(ARC_CONFIG.rpcUrl, ARC_CONFIG.chainId);
    return new ethers.Contract(CONTRACT_ADDRESSES.usdc, ERC20_ABI, provider);
  },

  getUSDCWrite() {
    if (!WalletManager.signer) return null;
    return new ethers.Contract(CONTRACT_ADDRESSES.usdc, ERC20_ABI, WalletManager.signer);
  },

  // Parse USDC amounts (6 decimals)
  toUSDC(value) {
    return ethers.parseUnits(String(value || '0'), 6);
  },

  fromUSDC(value) {
    return Number(ethers.formatUnits(value || 0n, 6)).toFixed(2);
  },

  fromUSDCRaw(value) {
    return Number(ethers.formatUnits(value || 0n, 6));
  },

  // Fetch all credit IDs
  async getAllCreditIds() {
    const factory = this.getReadContract('CreditFactory', CONTRACT_ADDRESSES.creditFactory);
    if (!factory) return [];
    try {
      return await factory.getAllCreditIds();
    } catch (e) {
      console.error('Failed to get credit IDs:', e);
      return [];
    }
  },

  // Get full credit data
  async getCreditData(creditId) {
    const factory = this.getReadContract('CreditFactory', CONTRACT_ADDRESSES.creditFactory);
    const marketplace = this.getReadContract('Marketplace', CONTRACT_ADDRESSES.marketplace);
    const token = this.getReadContract('CreditToken', CONTRACT_ADDRESSES.creditToken);
    const repayment = this.getReadContract('RepaymentManager', CONTRACT_ADDRESSES.repaymentManager);

    if (!factory || !marketplace || !token) return null;

    try {
      const [summary, listing, owner, repayState] = await Promise.all([
        factory.getCreditSummary(creditId),
        marketplace.listings(creditId),
        token.ownerOf(creditId).catch(() => ethers.ZeroAddress),
        repayment ? repayment.repaymentStates(creditId).catch(() => null) : null
      ]);

      return {
        id: creditId,
        borrower: summary[0],
        principal: summary[1],
        repaymentAmount: summary[2],
        dueDate: summary[3],
        minimumScore: summary[4],
        funded: summary[5],
        defaulted: summary[6],
        settled: summary[7],
        collateralRequired: summary[8],
        collateralToken: summary[9],
        collateralAmount: summary[10],
        listing: {
          seller: listing[0],
          priceUSDC: listing[1],
          expiresAt: listing[2],
          primary: listing[3],
          active: listing[4]
        },
        owner,
        repaymentState: repayState ? {
          totalRepaid: repayState[0],
          activatedAt: repayState[1],
          active: repayState[2],
          defaulted: repayState[3],
          settled: repayState[4]
        } : null
      };
    } catch (e) {
      console.error(`Failed to get credit ${creditId}:`, e);
      return null;
    }
  },

  // Get status label
  getStatus(credit) {
    if (credit.defaulted) return { text: 'Defaulted', class: 'badge-danger', icon: 'fa-times-circle' };
    if (credit.settled) return { text: 'Settled', class: 'badge-success', icon: 'fa-check-circle' };
    if (credit.funded) return { text: 'Funded', class: 'badge-info', icon: 'fa-handshake' };
    return { text: 'Open', class: 'badge-warning', icon: 'fa-clock' };
  },

  // Calculate yield percentage
  getYieldPct(credit) {
    const principal = Number(credit.principal.toString());
    const repayment = Number(credit.repaymentAmount.toString());
    if (principal === 0) return '0.00';
    return (((repayment - principal) / principal) * 100).toFixed(2);
  },

  // Get days until due
  getDaysRemaining(credit) {
    const now = Math.floor(Date.now() / 1000);
    const due = Number(credit.dueDate.toString());
    const days = Math.ceil((due - now) / 86400);
    return days;
  },

  // Get risk level from score
  getRiskLevel(score) {
    if (score >= 800) return { text: 'Very Low', class: 'badge-success', color: '#10b981' };
    if (score >= 650) return { text: 'Low', class: 'badge-info', color: '#3b82f6' };
    if (score >= 450) return { text: 'Medium', class: 'badge-warning', color: '#f59e0b' };
    if (score >= 300) return { text: 'High', class: 'badge-danger', color: '#ef4444' };
    return { text: 'Very High', class: 'badge-danger', color: '#dc2626' };
  },

  // Create a new credit position
  async createCredit(params) {
    const factory = this.getWriteContract('CreditFactory', CONTRACT_ADDRESSES.creditFactory);
    if (!factory) throw new Error('Factory contract not available');

    const tx = await factory.createCredit(params);
    const receipt = await tx.wait();
    return receipt;
  },

  // List credit on primary market
  async listPrimary(creditId, priceUSDC, expiresAt) {
    // First approve token transfer
    const token = this.getWriteContract('CreditToken', CONTRACT_ADDRESSES.creditToken);
    const approveTx = await token.approve(CONTRACT_ADDRESSES.marketplace, creditId);
    await approveTx.wait();

    const marketplace = this.getWriteContract('Marketplace', CONTRACT_ADDRESSES.marketplace);
    const tx = await marketplace.listPrimary(creditId, priceUSDC, expiresAt);
    return await tx.wait();
  },

  // List credit on secondary market
  async listSecondary(creditId, priceUSDC, expiresAt) {
    const token = this.getWriteContract('CreditToken', CONTRACT_ADDRESSES.creditToken);
    const approveTx = await token.approve(CONTRACT_ADDRESSES.marketplace, creditId);
    await approveTx.wait();

    const marketplace = this.getWriteContract('Marketplace', CONTRACT_ADDRESSES.marketplace);
    const tx = await marketplace.listSecondary(creditId, priceUSDC, expiresAt);
    return await tx.wait();
  },

  // Buy a credit position
  async buyCredit(creditId, priceUSDC) {
    // Approve USDC spend
    const usdc = this.getUSDCWrite();
    const approveTx = await usdc.approve(CONTRACT_ADDRESSES.marketplace, priceUSDC);
    await approveTx.wait();

    const marketplace = this.getWriteContract('Marketplace', CONTRACT_ADDRESSES.marketplace);
    const tx = await marketplace.buy(creditId);
    return await tx.wait();
  },

  // Repay credit
  async repayCredit(creditId, amountUSDC) {
    const usdc = this.getUSDCWrite();
    const approveTx = await usdc.approve(CONTRACT_ADDRESSES.repaymentManager, amountUSDC);
    await approveTx.wait();

    const repayment = this.getWriteContract('RepaymentManager', CONTRACT_ADDRESSES.repaymentManager);
    const tx = await repayment.repay(creditId, amountUSDC);
    return await tx.wait();
  },

  // Trigger default
  async triggerDefault(creditId) {
    const repayment = this.getWriteContract('RepaymentManager', CONTRACT_ADDRESSES.repaymentManager);
    const tx = await repayment.triggerDefault(creditId);
    return await tx.wait();
  },

  // Get credit score for a wallet
  async getScore(wallet) {
    const score = this.getReadContract('CreditScore', CONTRACT_ADDRESSES.creditScore);
    if (!score) return 0;
    try {
      const s = await score.getScore(wallet);
      return Number(s);
    } catch (e) {
      return 0;
    }
  },

  // Get wallet metrics from score contract
  async getWalletMetrics(wallet) {
    const score = this.getReadContract('CreditScore', CONTRACT_ADDRESSES.creditScore);
    if (!score) return null;
    try {
      const m = await score.metrics(wallet);
      return {
        txFrequency: Number(m[0]),
        defiInteractionCount: Number(m[1]),
        successfulRepayments: Number(m[2]),
        defaults: Number(m[3]),
        avgGasUsed: Number(m[4]),
        measuredAt: Number(m[5])
      };
    } catch (e) {
      return null;
    }
  },

  // Get USDC balance
  async getUSDCBalance(address) {
    const usdc = this.getUSDCRead();
    if (!usdc || !CONTRACT_ADDRESSES.usdc) return '0.00';
    try {
      const bal = await usdc.balanceOf(address);
      return this.fromUSDC(bal);
    } catch (e) {
      return '0.00';
    }
  }
};

window.ContractManager = ContractManager;
