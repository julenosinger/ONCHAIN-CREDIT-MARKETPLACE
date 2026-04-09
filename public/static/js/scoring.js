// === Credit Scoring Engine ===
const ScoringEngine = {
  // Fetch and compute deterministic credit score from Arc Network onchain data
  async computeScore(walletAddress) {
    try {
      // Step 1: Fetch onchain metrics from Arc
      const resp = await fetch(`/api/score/${walletAddress}`);
      const apiData = await resp.json();

      if (apiData.error) {
        throw new Error(apiData.error);
      }

      // Step 2: Also try to get onchain score if contract is deployed
      let onchainScore = 0;
      let onchainMetrics = null;

      if (CONTRACT_ADDRESSES.creditScore) {
        onchainScore = await ContractManager.getScore(walletAddress);
        onchainMetrics = await ContractManager.getWalletMetrics(walletAddress);
      }

      // Step 3: Combine data
      const finalScore = onchainScore > 0 ? onchainScore : apiData.score;
      const metrics = onchainMetrics || apiData.metrics;

      return {
        score: finalScore,
        metrics,
        onchain: apiData.onchain,
        risk: ContractManager.getRiskLevel(finalScore),
        breakdown: this.getBreakdown(metrics),
        source: onchainScore > 0 ? 'onchain-contract' : 'api-computed',
        deterministic: true,
        timestamp: Date.now()
      };
    } catch (err) {
      console.error('Scoring error:', err);
      throw err;
    }
  },

  // Get score breakdown
  getBreakdown(metrics) {
    const base = 300;
    const txComponent = Math.min((metrics.txFrequency || 0) * 4, 220);
    const defiComponent = Math.min((metrics.defiInteractionCount || 0) * 6, 180);
    const repaymentComponent = Math.min((metrics.successfulRepayments || 0) * 35, 280);
    const defaultPenalty = Math.min((metrics.defaults || 0) * 120, 420);
    const gasPenalty = (metrics.avgGasUsed || 0) > 350000
      ? Math.min(Math.floor(((metrics.avgGasUsed || 0) - 350000) / 1000), 80) : 0;

    return {
      base,
      txComponent,
      defiComponent,
      repaymentComponent,
      defaultPenalty,
      gasPenalty,
      total: Math.min(Math.max(base + txComponent + defiComponent + repaymentComponent - defaultPenalty - gasPenalty, 0), 1000)
    };
  },

  // Render score gauge SVG
  renderGauge(score, size = 160) {
    const max = 1000;
    const pct = Math.min(score / max, 1);
    const radius = (size - 16) / 2;
    const circumference = 2 * Math.PI * radius;
    const dashoffset = circumference * (1 - pct);

    const color = score >= 800 ? '#10b981' : score >= 650 ? '#3b82f6' : score >= 450 ? '#f59e0b' : '#ef4444';

    return `
      <div class="score-gauge" style="width:${size}px;height:${size}px">
        <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
          <circle cx="${size/2}" cy="${size/2}" r="${radius}" fill="none" stroke="rgba(148,163,184,0.15)" stroke-width="8"/>
          <circle cx="${size/2}" cy="${size/2}" r="${radius}" fill="none" stroke="${color}" stroke-width="8"
            stroke-linecap="round"
            stroke-dasharray="${circumference}"
            stroke-dashoffset="${dashoffset}"
            style="transition: stroke-dashoffset 1s ease"/>
        </svg>
        <div class="score-gauge-value">
          <div class="score-number" style="color:${color}">${score}</div>
          <div class="score-label">out of 1000</div>
        </div>
      </div>
    `;
  },

  // Score interpretation text
  getInterpretation(score) {
    if (score >= 800) return 'Excellent credit standing. Eligible for all credit tiers with minimal requirements.';
    if (score >= 650) return 'Good credit profile. Eligible for most credit positions with standard terms.';
    if (score >= 450) return 'Fair credit standing. Eligible for collateralized positions with moderate terms.';
    if (score >= 300) return 'Below average credit. Limited to high-collateral positions.';
    return 'Very low score. Must build onchain history before applying for credit.';
  }
};

window.ScoringEngine = ScoringEngine;
