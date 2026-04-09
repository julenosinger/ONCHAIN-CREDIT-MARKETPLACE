// === Contract Interaction Layer ===
const ContractManager = {
  // Custom error signatures for decoding (keccak256 of error signature)
  CUSTOM_ERRORS: {
    // CreditFactory errors
    '0x0da333c4': 'Invalid credit terms: principal must be > 0, repayment must exceed principal, due date must be in the future, and identity hash must not be empty.',
    '0x1d89422a': 'Credit score too low: your onchain credit score does not meet the minimum requirement for this position.',
    '0x8aaa89fc': 'Credit position not found.',
    '0x815506a8': 'Credit position is in an invalid state for this operation.',
    '0xd1ef4cea': 'Invalid collateral: ensure token address is set, amount > 0, valuation (USDC) > 0, LTV between 1-10000 bps, and principal does not exceed (collateral valuation * LTV / 10000).',
    // Marketplace errors
    '0x6a5084fd': 'Invalid listing: the credit position cannot be listed with these parameters.',
    '0x82b42900': 'Unauthorized: you do not have permission to perform this action.',
    '0xf80dbaea': 'Listing has expired.',
    // RepaymentManager errors
    '0xaf67655d': 'Unauthorized: only the borrower can repay this credit.',
    '0x66c28b18': 'Repayment amount is out of valid range.',
  },

  // Decode contract errors into human-readable messages
  decodeError(err) {
    // Check for ethers.js decoded error info
    if (err.revert) {
      const name = err.revert.name;
      if (name === 'InvalidCreditTerms') return 'Invalid credit terms: check principal > 0, repayment > principal, due date in future.';
      if (name === 'BorrowerScoreTooLow') {
        const args = err.revert.args;
        return `Credit score too low: your score is ${args?.[0]}, required ${args?.[1]}.`;
      }
      if (name === 'InvalidCollateral') return 'Invalid collateral configuration. Ensure all collateral fields are filled correctly and LTV ratio is valid.';
      if (name === 'InvalidState') return 'Credit position is in an invalid state for this action.';
      if (name === 'CreditNotFound') return 'Credit position not found.';
    }

    // Check raw error data for custom error selectors
    const data = err.data || err.error?.data;
    if (data && typeof data === 'string' && data.length >= 10) {
      const selector = data.slice(0, 10);
      if (this.CUSTOM_ERRORS[selector]) {
        return this.CUSTOM_ERRORS[selector];
      }
    }

    // Check for common revert reasons
    const msg = err.shortMessage || err.message || '';
    if (msg.includes('insufficient funds')) return 'Insufficient USDC balance to complete this transaction.';
    if (msg.includes('user rejected')) return 'Transaction was rejected by the user.';
    if (msg.includes('execution reverted')) {
      // Try to extract reason
      if (msg.includes('ERC20: insufficient allowance')) return 'Token approval needed. The collateral token must be approved before creating a collateralized position.';
      if (msg.includes('ERC20: transfer amount exceeds balance')) return 'Insufficient token balance for the collateral amount specified.';
      return 'Transaction reverted by the smart contract. Check your inputs: all required fields must be valid, and if using collateral, ensure the token is approved and you have sufficient balance.';
    }

    return msg || 'Unknown transaction error';
  },

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

  // Validate credit creation params before sending transaction
  validateCreateCreditParams(params) {
    const errors = [];

    if (!params.principal || params.principal === 0n) {
      errors.push('Principal amount must be greater than 0.');
    }
    if (!params.repaymentAmount || params.repaymentAmount <= params.principal) {
      errors.push('Repayment amount must be greater than principal.');
    }
    if (!params.dueDate || params.dueDate <= BigInt(Math.floor(Date.now() / 1000))) {
      errors.push('Due date must be in the future.');
    }
    if (!params.borrowerIdentityHash || params.borrowerIdentityHash === ethers.ZeroHash) {
      errors.push('Identity hash is missing. Ensure your wallet is connected.');
    }
    if (params.schedule === 1 && (!params.installmentCount || params.installmentCount < 2)) {
      errors.push('Installment schedule requires at least 2 installments.');
    }

    // Collateral validation
    if (params.collateralRequired) {
      if (!params.collateralToken || params.collateralToken === ethers.ZeroAddress) {
        errors.push('Collateral token address is required when collateral is enabled.');
      }
      if (!params.collateralAmount || params.collateralAmount === 0n) {
        errors.push('Collateral amount must be greater than 0.');
      }
      if (!params.collateralValuationUSDC || params.collateralValuationUSDC === 0n) {
        errors.push('Collateral valuation (USDC) must be greater than 0.');
      }
      if (!params.maxLtvBps || params.maxLtvBps === 0 || params.maxLtvBps > 10000) {
        errors.push('Max LTV must be between 1 and 10000 basis points (0.01% to 100%).');
      }
      // LTV check: principal * 10000 must be <= collateralValuationUSDC * maxLtvBps
      if (params.principal && params.collateralValuationUSDC && params.maxLtvBps) {
        const lhs = params.principal * 10000n;
        const rhs = params.collateralValuationUSDC * BigInt(params.maxLtvBps);
        if (lhs > rhs) {
          const maxPrincipal = (params.collateralValuationUSDC * BigInt(params.maxLtvBps)) / 10000n;
          errors.push(`Principal exceeds maximum allowed by LTV ratio. With your collateral valuation and LTV, max principal is ${ethers.formatUnits(maxPrincipal, 6)} USDC.`);
        }
      }
    }

    return errors;
  },

  // Create a new credit position
  async createCredit(params) {
    const factory = this.getWriteContract('CreditFactory', CONTRACT_ADDRESSES.creditFactory);
    if (!factory) throw new Error('Factory contract not available. Please connect your wallet.');

    // Validate params before sending
    const validationErrors = this.validateCreateCreditParams(params);
    if (validationErrors.length > 0) {
      throw new Error(validationErrors.join('\n'));
    }

    // If collateral is required, check allowance and approve if needed
    if (params.collateralRequired && params.collateralToken !== ethers.ZeroAddress) {
      try {
        const collateralContract = new ethers.Contract(
          params.collateralToken,
          ['function allowance(address,address) view returns (uint256)', 'function approve(address,uint256) returns (bool)', 'function balanceOf(address) view returns (uint256)', 'function symbol() view returns (string)', 'function decimals() view returns (uint8)'],
          WalletManager.signer
        );

        // Check balance
        const balance = await collateralContract.balanceOf(WalletManager.address);
        if (balance < params.collateralAmount) {
          let symbol = 'tokens';
          try { symbol = await collateralContract.symbol(); } catch {}
          throw new Error(`Insufficient collateral token balance. You have ${ethers.formatUnits(balance, 6)} ${symbol} but need ${ethers.formatUnits(params.collateralAmount, 6)} ${symbol}.`);
        }

        // Check and set allowance
        const allowance = await collateralContract.allowance(WalletManager.address, CONTRACT_ADDRESSES.creditFactory);
        if (allowance < params.collateralAmount) {
          Toast.show('Approving collateral token transfer...', 'info');
          const approveTx = await collateralContract.approve(CONTRACT_ADDRESSES.creditFactory, params.collateralAmount);
          await approveTx.wait();
          Toast.show('Collateral token approved!', 'success');
        }
      } catch (approveErr) {
        if (approveErr.message.includes('Insufficient collateral')) throw approveErr;
        console.error('Collateral approval error:', approveErr);
        throw new Error(`Failed to approve collateral token: ${approveErr.shortMessage || approveErr.message}`);
      }
    }

    try {
      const tx = await factory.createCredit(params);
      const receipt = await tx.wait();
      return receipt;
    } catch (err) {
      console.error('createCredit raw error:', err);
      throw new Error(this.decodeError(err));
    }
  },

  // List credit on primary market
  async listPrimary(creditId, priceUSDC, expiresAt) {
    // First approve token transfer
    const token = this.getWriteContract('CreditToken', CONTRACT_ADDRESSES.creditToken);
    const approveTx = await token.approve(CONTRACT_ADDRESSES.marketplace, creditId);
    await approveTx.wait();

    const marketplace = this.getWriteContract('Marketplace', CONTRACT_ADDRESSES.marketplace);
    try {
      const tx = await marketplace.listPrimary(creditId, priceUSDC, expiresAt);
      return await tx.wait();
    } catch (err) {
      throw new Error(this.decodeError(err));
    }
  },

  // List credit on secondary market
  async listSecondary(creditId, priceUSDC, expiresAt) {
    const token = this.getWriteContract('CreditToken', CONTRACT_ADDRESSES.creditToken);
    const approveTx = await token.approve(CONTRACT_ADDRESSES.marketplace, creditId);
    await approveTx.wait();

    const marketplace = this.getWriteContract('Marketplace', CONTRACT_ADDRESSES.marketplace);
    try {
      const tx = await marketplace.listSecondary(creditId, priceUSDC, expiresAt);
      return await tx.wait();
    } catch (err) {
      throw new Error(this.decodeError(err));
    }
  },

  // Buy a credit position
  async buyCredit(creditId, priceUSDC) {
    // Approve USDC spend
    const usdc = this.getUSDCWrite();
    const approveTx = await usdc.approve(CONTRACT_ADDRESSES.marketplace, priceUSDC);
    await approveTx.wait();

    const marketplace = this.getWriteContract('Marketplace', CONTRACT_ADDRESSES.marketplace);
    try {
      const tx = await marketplace.buy(creditId);
      return await tx.wait();
    } catch (err) {
      throw new Error(this.decodeError(err));
    }
  },

  // Repay credit
  async repayCredit(creditId, amountUSDC) {
    const usdc = this.getUSDCWrite();
    const approveTx = await usdc.approve(CONTRACT_ADDRESSES.repaymentManager, amountUSDC);
    await approveTx.wait();

    const repayment = this.getWriteContract('RepaymentManager', CONTRACT_ADDRESSES.repaymentManager);
    try {
      const tx = await repayment.repay(creditId, amountUSDC);
      return await tx.wait();
    } catch (err) {
      throw new Error(this.decodeError(err));
    }
  },

  // Trigger default
  async triggerDefault(creditId) {
    const repayment = this.getWriteContract('RepaymentManager', CONTRACT_ADDRESSES.repaymentManager);
    try {
      const tx = await repayment.triggerDefault(creditId);
      return await tx.wait();
    } catch (err) {
      throw new Error(this.decodeError(err));
    }
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
