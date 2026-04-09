// === Investor Dashboard Logic ===
const DashboardEngine = {
  portfolio: [],
  stats: {
    totalInvested: 0,
    totalExpectedYield: 0,
    activePositions: 0,
    settledPositions: 0,
    defaultedPositions: 0,
    avgYield: 0,
    totalRepaid: 0
  },

  computePortfolio(credits, walletAddress) {
    if (!walletAddress) {
      this.portfolio = [];
      this.stats = { totalInvested: 0, totalExpectedYield: 0, activePositions: 0, settledPositions: 0, defaultedPositions: 0, avgYield: 0, totalRepaid: 0 };
      return;
    }

    const addr = walletAddress.toLowerCase();
    this.portfolio = credits.filter(c => c.owner.toLowerCase() === addr && c.funded);

    let totalInvested = 0;
    let totalExpectedYield = 0;
    let totalRepaid = 0;
    let activePositions = 0;
    let settledPositions = 0;
    let defaultedPositions = 0;

    for (const c of this.portfolio) {
      const principal = ContractManager.fromUSDCRaw(c.principal);
      const repayment = ContractManager.fromUSDCRaw(c.repaymentAmount);

      totalInvested += principal;
      totalExpectedYield += (repayment - principal);

      if (c.repaymentState) {
        totalRepaid += ContractManager.fromUSDCRaw(c.repaymentState.totalRepaid);
      }

      if (c.defaulted) defaultedPositions++;
      else if (c.settled) settledPositions++;
      else activePositions++;
    }

    const avgYield = this.portfolio.length > 0
      ? this.portfolio.reduce((sum, c) => sum + c.yieldPct, 0) / this.portfolio.length
      : 0;

    this.stats = {
      totalInvested,
      totalExpectedYield,
      activePositions,
      settledPositions,
      defaultedPositions,
      avgYield,
      totalRepaid
    };
  },

  // Get borrower positions
  getBorrowerPositions(credits, walletAddress) {
    if (!walletAddress) return [];
    const addr = walletAddress.toLowerCase();
    return credits.filter(c => c.borrower.toLowerCase() === addr);
  },

  // Calculate repayment progress
  getRepaymentProgress(credit) {
    if (!credit.repaymentState) return 0;
    const total = Number(credit.repaymentAmount.toString());
    const repaid = Number(credit.repaymentState.totalRepaid.toString());
    if (total === 0) return 0;
    return Math.min((repaid / total) * 100, 100);
  },

  // Get upcoming repayments
  getUpcomingRepayments(credits, walletAddress) {
    if (!walletAddress) return [];
    const addr = walletAddress.toLowerCase();
    const now = Math.floor(Date.now() / 1000);

    return credits
      .filter(c => c.borrower.toLowerCase() === addr && c.funded && !c.defaulted && !c.settled)
      .map(c => {
        const repaidBig = c.repaymentState ? c.repaymentState.totalRepaid : 0n;
        const remainingBig = BigInt(c.repaymentAmount.toString()) - BigInt(repaidBig.toString());
        const remaining = ContractManager.fromUSDCRaw(remainingBig);
        return { ...c, remainingAmount: remaining };
      })
      .sort((a, b) => Number(a.dueDate) - Number(b.dueDate));
  }
};

window.DashboardEngine = DashboardEngine;
