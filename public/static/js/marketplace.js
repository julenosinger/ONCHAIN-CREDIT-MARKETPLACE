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

  // Check if contracts are deployed and accessible
  hasContracts() {
    return Object.values(CONTRACT_ADDRESSES).every(a => a && a !== '' && a !== ethers.ZeroAddress);
  }
};

window.MarketplaceEngine = MarketplaceEngine;
