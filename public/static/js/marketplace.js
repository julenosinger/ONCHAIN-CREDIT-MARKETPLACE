// === Marketplace Logic ===
const MarketplaceEngine = {
  credits: [],
  filteredCredits: [],
  filters: {
    status: 'all',
    yieldMin: 0,
    yieldMax: 100,
    durationMax: 365,
    riskMax: 1000,
    search: ''
  },
  sortBy: 'newest',
  loading: false,

  async loadCredits() {
    this.loading = true;
    try {
      const ids = await ContractManager.getAllCreditIds();
      const credits = [];

      for (const id of ids) {
        const data = await ContractManager.getCreditData(id);
        if (data) {
          data.yieldPct = parseFloat(ContractManager.getYieldPct(data));
          data.daysRemaining = ContractManager.getDaysRemaining(data);
          data.status = ContractManager.getStatus(data);
          credits.push(data);
        }
      }

      this.credits = credits;
      this.applyFilters();
    } catch (e) {
      console.error('Failed to load credits:', e);
      this.credits = [];
      this.filteredCredits = [];
    }
    this.loading = false;
  },

  applyFilters() {
    let result = [...this.credits];

    // Status filter
    if (this.filters.status !== 'all') {
      result = result.filter(c => {
        switch (this.filters.status) {
          case 'open': return !c.funded && !c.defaulted && !c.settled;
          case 'funded': return c.funded && !c.defaulted && !c.settled;
          case 'settled': return c.settled;
          case 'defaulted': return c.defaulted;
          case 'listed': return c.listing.active;
          default: return true;
        }
      });
    }

    // Yield filter
    result = result.filter(c => c.yieldPct >= this.filters.yieldMin && c.yieldPct <= this.filters.yieldMax);

    // Duration filter
    result = result.filter(c => c.daysRemaining <= this.filters.durationMax);

    // Search
    if (this.filters.search) {
      const q = this.filters.search.toLowerCase();
      result = result.filter(c =>
        String(c.id).includes(q) ||
        c.borrower.toLowerCase().includes(q) ||
        c.owner.toLowerCase().includes(q)
      );
    }

    // Sort
    switch (this.sortBy) {
      case 'yield-high': result.sort((a, b) => b.yieldPct - a.yieldPct); break;
      case 'yield-low': result.sort((a, b) => a.yieldPct - b.yieldPct); break;
      case 'due-soon': result.sort((a, b) => a.daysRemaining - b.daysRemaining); break;
      case 'principal-high': result.sort((a, b) => Number(b.principal) - Number(a.principal)); break;
      case 'newest': result.sort((a, b) => Number(b.id) - Number(a.id)); break;
    }

    this.filteredCredits = result;
  },

  getStats() {
    const total = this.credits.length;
    const open = this.credits.filter(c => !c.funded && !c.defaulted && !c.settled).length;
    const funded = this.credits.filter(c => c.funded && !c.defaulted && !c.settled).length;
    const settled = this.credits.filter(c => c.settled).length;
    const defaulted = this.credits.filter(c => c.defaulted).length;
    const listed = this.credits.filter(c => c.listing.active).length;

    const totalVolume = this.credits.reduce((sum, c) => sum + Number(c.principal), 0);
    const avgYield = total > 0 ? this.credits.reduce((sum, c) => sum + c.yieldPct, 0) / total : 0;

    return { total, open, funded, settled, defaulted, listed, totalVolume, avgYield };
  },

  // Demo data for when contracts aren't deployed
  getDemoCredits() {
    const now = Math.floor(Date.now() / 1000);
    return [
      {
        id: 1n, borrower: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD28',
        principal: 10000000000n, repaymentAmount: 10800000000n,
        dueDate: BigInt(now + 86400 * 90), minimumScore: 450, funded: false,
        defaulted: false, settled: false, collateralRequired: false,
        collateralToken: ethers.ZeroAddress, collateralAmount: 0n,
        listing: { seller: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD28', priceUSDC: 10000000000n, expiresAt: BigInt(now + 86400 * 7), primary: true, active: true },
        owner: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD28',
        repaymentState: null, yieldPct: 8.00, daysRemaining: 90,
        status: { text: 'Open', class: 'badge-warning', icon: 'fa-clock' }
      },
      {
        id: 2n, borrower: '0x8ba1f109551bD432803012645Ac136ddd64DBA72',
        principal: 50000000000n, repaymentAmount: 56000000000n,
        dueDate: BigInt(now + 86400 * 180), minimumScore: 600, funded: true,
        defaulted: false, settled: false, collateralRequired: true,
        collateralToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        collateralAmount: 30000000000n,
        listing: { seller: ethers.ZeroAddress, priceUSDC: 0n, expiresAt: 0n, primary: false, active: false },
        owner: '0x1234567890AbCdEf1234567890AbCdEf12345678',
        repaymentState: { totalRepaid: 14000000000n, activatedAt: BigInt(now - 86400 * 30), active: true, defaulted: false, settled: false },
        yieldPct: 12.00, daysRemaining: 180,
        status: { text: 'Funded', class: 'badge-info', icon: 'fa-handshake' }
      },
      {
        id: 3n, borrower: '0xdD870fA1b7C4700F2BD7f44238821C26f7392148',
        principal: 25000000000n, repaymentAmount: 27250000000n,
        dueDate: BigInt(now + 86400 * 60), minimumScore: 500, funded: true,
        defaulted: false, settled: true, collateralRequired: false,
        collateralToken: ethers.ZeroAddress, collateralAmount: 0n,
        listing: { seller: ethers.ZeroAddress, priceUSDC: 0n, expiresAt: 0n, primary: false, active: false },
        owner: '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12',
        repaymentState: { totalRepaid: 27250000000n, activatedAt: BigInt(now - 86400 * 60), active: false, defaulted: false, settled: true },
        yieldPct: 9.00, daysRemaining: 60,
        status: { text: 'Settled', class: 'badge-success', icon: 'fa-check-circle' }
      },
      {
        id: 4n, borrower: '0x583031D1113aD414F02576BD6afaBfb302140225',
        principal: 75000000000n, repaymentAmount: 86250000000n,
        dueDate: BigInt(now + 86400 * 365), minimumScore: 700, funded: false,
        defaulted: false, settled: false, collateralRequired: true,
        collateralToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        collateralAmount: 50000000000n,
        listing: { seller: '0x583031D1113aD414F02576BD6afaBfb302140225', priceUSDC: 75000000000n, expiresAt: BigInt(now + 86400 * 14), primary: true, active: true },
        owner: '0x583031D1113aD414F02576BD6afaBfb302140225',
        repaymentState: null, yieldPct: 15.00, daysRemaining: 365,
        status: { text: 'Open', class: 'badge-warning', icon: 'fa-clock' }
      },
      {
        id: 5n, borrower: '0x14723A09ACff6D2A60DcdF7aA4AFf308FDDC160C',
        principal: 5000000000n, repaymentAmount: 5350000000n,
        dueDate: BigInt(now - 86400 * 10), minimumScore: 400, funded: true,
        defaulted: true, settled: false, collateralRequired: false,
        collateralToken: ethers.ZeroAddress, collateralAmount: 0n,
        listing: { seller: ethers.ZeroAddress, priceUSDC: 0n, expiresAt: 0n, primary: false, active: false },
        owner: '0xFeEdBaCk1234567890AbCdEf1234567890AbCdEf',
        repaymentState: { totalRepaid: 2000000000n, activatedAt: BigInt(now - 86400 * 90), active: false, defaulted: true, settled: false },
        yieldPct: 7.00, daysRemaining: -10,
        status: { text: 'Defaulted', class: 'badge-danger', icon: 'fa-times-circle' }
      }
    ];
  }
};

window.MarketplaceEngine = MarketplaceEngine;
