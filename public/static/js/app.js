// === Main Application — Onchain Credit Marketplace ===
const AppState = {
  currentPage: 'marketplace',
  credits: [],
  scoreData: null,
  loading: false,

  async init() {
    Toast.init();
    await loadABIs();

    // Check if contracts are deployed and load real onchain data
    const hasContracts = MarketplaceEngine.hasContracts();
    
    if (hasContracts) {
      // Load real credit data from deployed contracts
      try {
        await MarketplaceEngine.loadCredits();
        this.credits = MarketplaceEngine.credits;
      } catch (err) {
        console.error('Failed to load credits from chain:', err);
        this.credits = [];
      }
    } else {
      // No contracts deployed — show empty state, no mock data
      this.credits = [];
      MarketplaceEngine.credits = [];
      MarketplaceEngine.filteredCredits = [];
    }

    this.render();
    
    // Auto-connect if previously connected
    if (window.ethereum && window.ethereum.selectedAddress) {
      await WalletManager.connect();
    }
  },

  async onWalletChange() {
    // Reload credits from chain when wallet changes
    if (WalletManager.connected && MarketplaceEngine.hasContracts()) {
      try {
        await MarketplaceEngine.loadCredits();
        this.credits = MarketplaceEngine.credits;
      } catch (err) {
        console.error('Failed to refresh credits:', err);
      }
    }
    this.render();
    if (WalletManager.connected && this.credits.length > 0) {
      DashboardEngine.computePortfolio(this.credits, WalletManager.address);
    }
  },

  navigate(page) {
    this.currentPage = page;
    this.render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  render() {
    const app = document.getElementById('app');
    app.innerHTML = `
      ${this.renderNav()}
      <main class="page-container">
        ${this.renderPage()}
      </main>
      ${this.renderMobileNav()}
    `;
    this.bindEvents();
  },

  renderNav() {
    const isDark = ThemeManager.current === 'dark';
    return `
    <nav class="nav ${isDark ? 'bg-slate-900/80' : 'bg-white/80'}">
      <div class="nav-inner">
        <div class="logo">
          <div class="logo-icon bg-gradient-to-br from-blue-500 to-emerald-400 text-white">
            <i class="fas fa-chart-line"></i>
          </div>
          <span>ArcCredit</span>
          <span class="network-badge ${isDark ? 'bg-emerald-900/40 text-emerald-400' : 'bg-emerald-50 text-emerald-600'}">
            <span class="network-dot bg-emerald-400"></span>
            Arc Testnet
          </span>
        </div>

        <div class="nav-links">
          <button class="nav-link ${this.currentPage === 'marketplace' ? 'active' : ''}" onclick="AppState.navigate('marketplace')">
            <i class="fas fa-store mr-1"></i> Marketplace
          </button>
          <button class="nav-link ${this.currentPage === 'originate' ? 'active' : ''}" onclick="AppState.navigate('originate')">
            <i class="fas fa-plus-circle mr-1"></i> Originate
          </button>
          <button class="nav-link ${this.currentPage === 'dashboard' ? 'active' : ''}" onclick="AppState.navigate('dashboard')">
            <i class="fas fa-chart-pie mr-1"></i> Dashboard
          </button>
          <button class="nav-link ${this.currentPage === 'score' ? 'active' : ''}" onclick="AppState.navigate('score')">
            <i class="fas fa-shield-alt mr-1"></i> Credit Score
          </button>
          <button class="nav-link ${this.currentPage === 'repay' ? 'active' : ''}" onclick="AppState.navigate('repay')">
            <i class="fas fa-hand-holding-usd mr-1"></i> Repay
          </button>
        </div>

        <div class="nav-actions">
          <div class="theme-toggle ${isDark ? 'bg-slate-700 border-slate-600' : 'bg-yellow-100 border-yellow-200'}" onclick="ThemeManager.toggle(); AppState.render();" title="Toggle theme">
            <div class="toggle-thumb ${isDark ? 'bg-slate-500' : 'bg-yellow-400'}">
              ${isDark ? '🌙' : '☀️'}
            </div>
          </div>

          ${WalletManager.connected ? `
            <span class="wallet-addr hidden sm:inline px-3 py-1.5 rounded-lg ${isDark ? 'bg-slate-800' : 'bg-slate-100'}">${WalletManager.shortAddress}</span>
            ${!WalletManager.isCorrectChain ? `<button class="btn btn-sm btn-danger" onclick="WalletManager.switchToArc()">Switch to Arc</button>` : ''}
            <button class="btn btn-sm btn-ghost" onclick="WalletManager.disconnect(); AppState.render();">
              <i class="fas fa-sign-out-alt"></i>
            </button>
          ` : `
            <button class="btn btn-sm btn-arc" onclick="WalletManager.connect()">
              <i class="fab fa-ethereum mr-1"></i> Connect Wallet
            </button>
          `}
        </div>
      </div>
    </nav>`;
  },

  renderMobileNav() {
    const isDark = ThemeManager.current === 'dark';
    return `
    <div class="mobile-nav ${isDark ? 'bg-slate-900' : 'bg-white'}">
      <button class="mobile-nav-item ${this.currentPage === 'marketplace' ? 'active' : ''}" onclick="AppState.navigate('marketplace')">
        <i class="fas fa-store"></i> Market
      </button>
      <button class="mobile-nav-item ${this.currentPage === 'originate' ? 'active' : ''}" onclick="AppState.navigate('originate')">
        <i class="fas fa-plus-circle"></i> Create
      </button>
      <button class="mobile-nav-item ${this.currentPage === 'dashboard' ? 'active' : ''}" onclick="AppState.navigate('dashboard')">
        <i class="fas fa-chart-pie"></i> Portfolio
      </button>
      <button class="mobile-nav-item ${this.currentPage === 'score' ? 'active' : ''}" onclick="AppState.navigate('score')">
        <i class="fas fa-shield-alt"></i> Score
      </button>
      <button class="mobile-nav-item ${this.currentPage === 'repay' ? 'active' : ''}" onclick="AppState.navigate('repay')">
        <i class="fas fa-hand-holding-usd"></i> Repay
      </button>
    </div>`;
  },

  renderPage() {
    switch (this.currentPage) {
      case 'marketplace': return this.renderMarketplace();
      case 'originate': return this.renderOriginate();
      case 'dashboard': return this.renderDashboard();
      case 'score': return this.renderScore();
      case 'repay': return this.renderRepay();
      default: return this.renderMarketplace();
    }
  },

  // ==========================================
  // MARKETPLACE PAGE
  // ==========================================
  renderMarketplace() {
    const isDark = ThemeManager.current === 'dark';
    const credits = MarketplaceEngine.filteredCredits;
    const stats = MarketplaceEngine.getStats();

    return `
    <div>
      <!-- Hero -->
      <div class="hero-gradient">
        <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 class="text-3xl font-bold mb-2">Credit Marketplace</h1>
            <p class="opacity-60">Browse tokenized credit positions and earn yield on Arc Network</p>
          </div>
          <button class="btn btn-primary" onclick="AppState.navigate('originate')">
            <i class="fas fa-plus"></i> Create Credit Position
          </button>
        </div>
      </div>

      <!-- Stats -->
      <div class="grid-4 mb-6">
        <div class="card ${isDark ? 'bg-slate-800/50' : 'bg-white'} stat-card">
          <div class="stat-label">Total Positions</div>
          <div class="stat-value">${stats.total}</div>
          <div class="stat-change positive"><i class="fas fa-arrow-up"></i> ${stats.listed} listed</div>
        </div>
        <div class="card ${isDark ? 'bg-slate-800/50' : 'bg-white'} stat-card">
          <div class="stat-label">Open for Investment</div>
          <div class="stat-value text-blue-500">${stats.open}</div>
        </div>
        <div class="card ${isDark ? 'bg-slate-800/50' : 'bg-white'} stat-card">
          <div class="stat-label">Active (Funded)</div>
          <div class="stat-value text-emerald-500">${stats.funded}</div>
        </div>
        <div class="card ${isDark ? 'bg-slate-800/50' : 'bg-white'} stat-card">
          <div class="stat-label">Avg. Yield</div>
          <div class="stat-value text-amber-500">${stats.avgYield.toFixed(1)}%</div>
        </div>
      </div>

      <!-- Filters -->
      <div class="filter-bar">
        <button class="filter-chip ${MarketplaceEngine.filters.status === 'all' ? 'active' : ''}" onclick="AppState.setFilter('status','all')">All</button>
        <button class="filter-chip ${MarketplaceEngine.filters.status === 'listed' ? 'active' : ''}" onclick="AppState.setFilter('status','listed')">Listed</button>
        <button class="filter-chip ${MarketplaceEngine.filters.status === 'open' ? 'active' : ''}" onclick="AppState.setFilter('status','open')">Open</button>
        <button class="filter-chip ${MarketplaceEngine.filters.status === 'funded' ? 'active' : ''}" onclick="AppState.setFilter('status','funded')">Funded</button>
        <button class="filter-chip ${MarketplaceEngine.filters.status === 'settled' ? 'active' : ''}" onclick="AppState.setFilter('status','settled')">Settled</button>
        <button class="filter-chip ${MarketplaceEngine.filters.status === 'defaulted' ? 'active' : ''}" onclick="AppState.setFilter('status','defaulted')">Defaulted</button>
        <div class="flex-1"></div>
        <select class="form-select" style="width:auto" onchange="MarketplaceEngine.sortBy=this.value; MarketplaceEngine.applyFilters(); AppState.render();">
          <option value="newest">Newest First</option>
          <option value="yield-high">Highest Yield</option>
          <option value="yield-low">Lowest Yield</option>
          <option value="due-soon">Due Soonest</option>
          <option value="principal-high">Highest Principal</option>
        </select>
      </div>

      <!-- Credit Cards Grid -->
      ${!MarketplaceEngine.hasContracts() ? `
        <div class="empty-state">
          <i class="fas fa-link-slash"></i>
          <h3 class="text-lg font-semibold mt-2">Contracts Not Deployed</h3>
          <p class="mt-1 max-w-md mx-auto">Smart contracts have not been deployed to Arc Network yet. Deploy the contracts and update the addresses in the configuration to activate the marketplace.</p>
          <div class="flex gap-3 mt-4 justify-center">
            <a href="${ARC_CONFIG.faucet}" target="_blank" class="btn btn-sm btn-arc"><i class="fas fa-faucet mr-1"></i>Get Testnet USDC</a>
            <a href="${ARC_CONFIG.explorer}" target="_blank" class="btn btn-sm btn-ghost"><i class="fas fa-external-link-alt mr-1"></i>Arc Explorer</a>
          </div>
        </div>
      ` : MarketplaceEngine.loading ? `
        <div class="empty-state">
          <i class="fas fa-spinner fa-spin"></i>
          <h3 class="text-lg font-semibold mt-2">Loading Credit Positions...</h3>
          <p class="mt-1">Fetching data from Arc Network contracts.</p>
        </div>
      ` : credits.length === 0 ? `
        <div class="empty-state">
          <i class="fas fa-inbox"></i>
          <h3 class="text-lg font-semibold mt-2">No Credit Positions Found</h3>
          <p class="mt-1">No credit positions have been created on-chain yet. Be the first to create one.</p>
          <button class="btn btn-primary mt-4" onclick="AppState.navigate('originate')">
            <i class="fas fa-plus mr-1"></i> Create Credit Position
          </button>
        </div>
      ` : `
        <div class="grid-3">
          ${credits.map(c => this.renderCreditCard(c)).join('')}
        </div>
      `}
    </div>`;
  },

  renderCreditCard(credit) {
    const isDark = ThemeManager.current === 'dark';
    const status = credit.status;
    const principal = ContractManager.fromUSDC(credit.principal);
    const repayment = ContractManager.fromUSDC(credit.repaymentAmount);
    const dueStr = dayjs.unix(Number(credit.dueDate)).format('MMM D, YYYY');
    const isListed = credit.listing.active;
    const listingPrice = isListed ? ContractManager.fromUSDC(credit.listing.priceUSDC) : null;

    return `
    <div class="credit-card ${isDark ? 'bg-slate-800/50' : 'bg-white'} card-hover">
      <div class="credit-card-header">
        <div>
          <div class="text-sm font-bold opacity-50">CREDIT #${String(credit.id)}</div>
          <div class="wallet-addr mt-1">${credit.borrower.slice(0, 10)}...${credit.borrower.slice(-6)}</div>
        </div>
        <span class="badge ${status.class}"><i class="fas ${status.icon} mr-1"></i>${status.text}</span>
      </div>

      <div class="credit-card-body">
        <div class="credit-metric">
          <span class="credit-metric-label">Principal</span>
          <span class="credit-metric-value">${principal} <span class="text-xs opacity-50">USDC</span></span>
        </div>
        <div class="credit-metric">
          <span class="credit-metric-label">Yield</span>
          <span class="credit-metric-value text-emerald-500">${credit.yieldPct.toFixed(2)}%</span>
        </div>
        <div class="credit-metric">
          <span class="credit-metric-label">Repayment</span>
          <span class="credit-metric-value">${repayment} <span class="text-xs opacity-50">USDC</span></span>
        </div>
        <div class="credit-metric">
          <span class="credit-metric-label">Due Date</span>
          <span class="credit-metric-value">${dueStr}</span>
        </div>
        <div class="credit-metric">
          <span class="credit-metric-label">Min Score</span>
          <span class="credit-metric-value">${String(credit.minimumScore)}</span>
        </div>
        <div class="credit-metric">
          <span class="credit-metric-label">Duration</span>
          <span class="credit-metric-value">${credit.daysRemaining > 0 ? credit.daysRemaining + 'd' : 'Overdue'}</span>
        </div>
      </div>

      ${credit.collateralRequired ? `
        <div class="flex items-center gap-2 mb-3">
          <span class="badge badge-arc"><i class="fas fa-lock mr-1"></i>Collateralized</span>
          <span class="text-xs opacity-50">${ContractManager.fromUSDC(credit.collateralAmount)} USDC</span>
        </div>
      ` : ''}

      ${credit.repaymentState ? `
        <div class="mb-3">
          <div class="flex justify-between text-xs mb-1">
            <span class="opacity-50">Repayment Progress</span>
            <span>${DashboardEngine.getRepaymentProgress(credit).toFixed(0)}%</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill bg-gradient-to-r from-blue-500 to-emerald-400" style="width:${DashboardEngine.getRepaymentProgress(credit)}%"></div>
          </div>
        </div>
      ` : ''}

      <div class="credit-card-footer">
        ${isListed ? `
          <button class="btn btn-sm btn-primary flex-1" onclick="AppState.handleBuy(${String(credit.id)}n, ${String(credit.listing.priceUSDC)}n)">
            <i class="fas fa-shopping-cart"></i> Buy ${listingPrice} USDC
          </button>
        ` : ''}
        ${!credit.funded && !isListed && WalletManager.address && credit.borrower.toLowerCase() === WalletManager.address.toLowerCase() ? `
          <button class="btn btn-sm btn-arc flex-1" onclick="AppState.handleListPrimary(${String(credit.id)}n, ${String(credit.principal)}n)">
            <i class="fas fa-tag"></i> List for Sale
          </button>
        ` : ''}
        ${credit.funded && !credit.defaulted && !credit.settled && WalletManager.address && credit.owner.toLowerCase() === WalletManager.address.toLowerCase() ? `
          <button class="btn btn-sm btn-secondary flex-1" onclick="AppState.handleListSecondary(${String(credit.id)}n, ${String(credit.principal)}n)">
            <i class="fas fa-exchange-alt"></i> List Secondary
          </button>
        ` : ''}
        <a href="${ARC_CONFIG.explorer}/token/${CONTRACT_ADDRESSES.creditToken || '#'}?a=${String(credit.id)}" target="_blank" class="btn btn-sm btn-ghost">
          <i class="fas fa-external-link-alt"></i>
        </a>
      </div>
    </div>`;
  },

  setFilter(key, value) {
    MarketplaceEngine.filters[key] = value;
    MarketplaceEngine.applyFilters();
    this.render();
  },

  // ==========================================
  // ORIGINATE PAGE (Credit Creation)
  // ==========================================
  renderOriginate() {
    const isDark = ThemeManager.current === 'dark';
    if (!WalletManager.connected) {
      return `
      <div class="hero-gradient text-center py-16">
        <i class="fas fa-wallet text-5xl text-blue-500 mb-4"></i>
        <h2 class="text-2xl font-bold mb-2">Connect Your Wallet</h2>
        <p class="opacity-60 mb-6">You need to connect your wallet to create a credit position.</p>
        <button class="btn btn-lg btn-arc" onclick="WalletManager.connect()">
          <i class="fab fa-ethereum mr-2"></i> Connect Wallet
        </button>
      </div>`;
    }

    if (!MarketplaceEngine.hasContracts()) {
      return `
      <div class="hero-gradient text-center py-16">
        <i class="fas fa-tools text-5xl text-amber-500 mb-4"></i>
        <h2 class="text-2xl font-bold mb-2">Contracts Not Deployed</h2>
        <p class="opacity-60 mb-6 max-w-lg mx-auto">Smart contracts must be deployed to Arc Network before you can create credit positions. Deploy the contracts and configure the addresses to proceed.</p>
        <a href="${ARC_CONFIG.explorer}" target="_blank" class="btn btn-lg btn-ghost"><i class="fas fa-external-link-alt mr-2"></i>View Arc Explorer</a>
      </div>`;
    }

    return `
    <div>
      <div class="section-header">
        <div>
          <h1 class="section-title">Originate Credit</h1>
          <div class="section-subtitle">Create a tokenized credit position as an ERC-721 NFT on Arc Network</div>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Form -->
        <div class="lg:col-span-2">
          <div class="card ${isDark ? 'bg-slate-800/50' : 'bg-white'}">
            <h3 class="text-lg font-bold mb-4"><i class="fas fa-file-contract mr-2 text-blue-500"></i>Credit Terms</h3>

            <div class="grid-2">
              <div class="form-group">
                <label class="form-label">Principal Amount (USDC)</label>
                <input type="number" id="orig-principal" class="form-input" placeholder="e.g. 10000" min="1" step="0.01">
              </div>
              <div class="form-group">
                <label class="form-label">Repayment Amount (USDC)</label>
                <input type="number" id="orig-repayment" class="form-input" placeholder="e.g. 10800" min="1" step="0.01">
              </div>
              <div class="form-group">
                <label class="form-label">Due Date</label>
                <input type="datetime-local" id="orig-dueDate" class="form-input">
              </div>
              <div class="form-group">
                <label class="form-label">Payment Schedule</label>
                <select id="orig-schedule" class="form-select">
                  <option value="0">Bullet (single payment)</option>
                  <option value="1">Installments</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Installment Count</label>
                <input type="number" id="orig-installments" class="form-input" value="1" min="1" max="24">
              </div>
              <div class="form-group">
                <label class="form-label">Minimum Credit Score</label>
                <input type="number" id="orig-minScore" class="form-input" value="0" min="0" max="1000">
                <span class="text-xs opacity-50 mt-1 block">Set to 0 for no minimum requirement. Your onchain score must meet this threshold.</span>
              </div>
            </div>

            <h3 class="text-lg font-bold mt-6 mb-4"><i class="fas fa-shield-alt mr-2 text-emerald-500"></i>Privacy & Metadata</h3>

            <div class="form-group">
              <label class="form-label">Metadata (JSON)</label>
              <textarea id="orig-metadata" class="form-textarea" rows="4">{"company": "", "invoiceRef": "", "purpose": "", "notes": ""}</textarea>
            </div>

            <div class="flex gap-6 mb-4">
              <label class="form-checkbox">
                <input type="checkbox" id="orig-private" checked> Private Mode (encrypted metadata)
              </label>
              <label class="form-checkbox">
                <input type="checkbox" id="orig-collateral"> Require Collateral
              </label>
            </div>

            <div id="collateral-fields" class="hidden">
              <h3 class="text-lg font-bold mt-4 mb-4"><i class="fas fa-lock mr-2 text-amber-500"></i>Collateral Configuration</h3>
              <div class="grid-2">
                <div class="form-group">
                  <label class="form-label">Collateral Token Address</label>
                  <input type="text" id="orig-collToken" class="form-input" placeholder="0x...">
                </div>
                <div class="form-group">
                  <label class="form-label">Collateral Amount</label>
                  <input type="number" id="orig-collAmount" class="form-input" placeholder="Amount">
                </div>
                <div class="form-group">
                  <label class="form-label">Collateral Valuation (USDC)</label>
                  <input type="number" id="orig-collVal" class="form-input" placeholder="USDC value">
                </div>
                <div class="form-group">
                  <label class="form-label">Max LTV (basis points)</label>
                  <input type="number" id="orig-maxLtv" class="form-input" value="7000" min="1000" max="10000">
                </div>
              </div>
            </div>

            <button class="btn btn-lg btn-primary w-full mt-6" onclick="AppState.handleCreateCredit()" id="create-credit-btn">
              <i class="fas fa-rocket"></i> Create Credit Position
            </button>
          </div>
        </div>

        <!-- Preview -->
        <div>
          <div class="card ${isDark ? 'bg-slate-800/50' : 'bg-white'} mb-4">
            <h3 class="text-sm font-bold mb-3 opacity-50 uppercase tracking-wide">Position Preview</h3>
            <div id="orig-preview">
              <p class="text-sm opacity-40">Fill in the form to see a preview of your credit position.</p>
            </div>
          </div>

          <div class="card ${isDark ? 'bg-slate-800/50' : 'bg-white'}">
            <h3 class="text-sm font-bold mb-3 opacity-50 uppercase tracking-wide">How It Works</h3>
            <div class="space-y-3 text-sm">
              <div class="flex gap-3"><span class="w-6 h-6 rounded-full bg-blue-500/20 text-blue-500 flex items-center justify-center flex-shrink-0 text-xs font-bold">1</span><span>Fill in the credit terms and metadata</span></div>
              <div class="flex gap-3"><span class="w-6 h-6 rounded-full bg-blue-500/20 text-blue-500 flex items-center justify-center flex-shrink-0 text-xs font-bold">2</span><span>Metadata is encrypted (if private) and uploaded to IPFS</span></div>
              <div class="flex gap-3"><span class="w-6 h-6 rounded-full bg-blue-500/20 text-blue-500 flex items-center justify-center flex-shrink-0 text-xs font-bold">3</span><span>An ERC-721 NFT is minted representing your credit position</span></div>
              <div class="flex gap-3"><span class="w-6 h-6 rounded-full bg-blue-500/20 text-blue-500 flex items-center justify-center flex-shrink-0 text-xs font-bold">4</span><span>List it on the marketplace for investors to fund</span></div>
              <div class="flex gap-3"><span class="w-6 h-6 rounded-full bg-blue-500/20 text-blue-500 flex items-center justify-center flex-shrink-0 text-xs font-bold">5</span><span>Repay principal + interest on schedule</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>`;
  },

  // ==========================================
  // DASHBOARD PAGE
  // ==========================================
  renderDashboard() {
    const isDark = ThemeManager.current === 'dark';
    if (!WalletManager.connected) {
      return `<div class="hero-gradient text-center py-16">
        <i class="fas fa-chart-pie text-5xl text-blue-500 mb-4"></i>
        <h2 class="text-2xl font-bold mb-2">Connect Your Wallet</h2>
        <p class="opacity-60 mb-6">View your investment portfolio and borrower positions.</p>
        <button class="btn btn-lg btn-arc" onclick="WalletManager.connect()"><i class="fab fa-ethereum mr-2"></i> Connect Wallet</button>
      </div>`;
    }

    if (!MarketplaceEngine.hasContracts()) {
      return `<div class="hero-gradient text-center py-16">
        <i class="fas fa-link-slash text-5xl text-amber-500 mb-4"></i>
        <h2 class="text-2xl font-bold mb-2">Contracts Not Deployed</h2>
        <p class="opacity-60 mb-6 max-w-lg mx-auto">Portfolio data will be available once the smart contracts are deployed and operational on Arc Network.</p>
      </div>`;
    }

    DashboardEngine.computePortfolio(this.credits, WalletManager.address);
    const s = DashboardEngine.stats;
    const portfolio = DashboardEngine.portfolio;
    const borrowerPositions = DashboardEngine.getBorrowerPositions(this.credits, WalletManager.address);
    const upcoming = DashboardEngine.getUpcomingRepayments(this.credits, WalletManager.address);

    return `
    <div>
      <div class="section-header">
        <div>
          <h1 class="section-title">Portfolio Dashboard</h1>
          <div class="section-subtitle">Wallet: ${WalletManager.shortAddress}</div>
        </div>
      </div>

      <!-- Stats -->
      <div class="grid-4 mb-6">
        <div class="card ${isDark ? 'bg-slate-800/50' : 'bg-white'} stat-card">
          <div class="stat-label">Total Invested</div>
          <div class="stat-value">${s.totalInvested.toFixed(2)}</div>
          <div class="text-xs opacity-40">USDC</div>
        </div>
        <div class="card ${isDark ? 'bg-slate-800/50' : 'bg-white'} stat-card">
          <div class="stat-label">Expected Yield</div>
          <div class="stat-value text-emerald-500">+${s.totalExpectedYield.toFixed(2)}</div>
          <div class="text-xs opacity-40">USDC</div>
        </div>
        <div class="card ${isDark ? 'bg-slate-800/50' : 'bg-white'} stat-card">
          <div class="stat-label">Active Positions</div>
          <div class="stat-value text-blue-500">${s.activePositions}</div>
        </div>
        <div class="card ${isDark ? 'bg-slate-800/50' : 'bg-white'} stat-card">
          <div class="stat-label">Avg. Portfolio Yield</div>
          <div class="stat-value text-amber-500">${s.avgYield.toFixed(1)}%</div>
        </div>
      </div>

      <!-- Tabs -->
      <div class="tabs">
        <button class="tab active" onclick="AppState.switchDashboardTab('investments', this)">My Investments (${portfolio.length})</button>
        <button class="tab" onclick="AppState.switchDashboardTab('borrower', this)">My Borrowing (${borrowerPositions.length})</button>
        <button class="tab" onclick="AppState.switchDashboardTab('upcoming', this)">Upcoming Repayments (${upcoming.length})</button>
      </div>

      <div id="dashboard-tab-content">
        ${portfolio.length === 0 ? `
          <div class="empty-state">
            <i class="fas fa-briefcase"></i>
            <h3 class="text-lg font-semibold mt-2">No Investments Yet</h3>
            <p class="mt-1">Browse the marketplace to find credit positions to invest in.</p>
            <button class="btn btn-primary mt-4" onclick="AppState.navigate('marketplace')">Browse Marketplace</button>
          </div>
        ` : `
          <div class="grid-2">
            ${portfolio.map(c => this.renderCreditCard(c)).join('')}
          </div>
        `}
      </div>
    </div>`;
  },

  switchDashboardTab(tab, el) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');

    const content = document.getElementById('dashboard-tab-content');
    const isDark = ThemeManager.current === 'dark';

    if (tab === 'investments') {
      const portfolio = DashboardEngine.portfolio;
      content.innerHTML = portfolio.length === 0 ? `
        <div class="empty-state"><i class="fas fa-briefcase"></i><h3 class="text-lg font-semibold mt-2">No Investments Yet</h3></div>
      ` : `<div class="grid-2">${portfolio.map(c => this.renderCreditCard(c)).join('')}</div>`;
    } else if (tab === 'borrower') {
      const positions = DashboardEngine.getBorrowerPositions(this.credits, WalletManager.address);
      content.innerHTML = positions.length === 0 ? `
        <div class="empty-state"><i class="fas fa-file-invoice-dollar"></i><h3 class="text-lg font-semibold mt-2">No Borrower Positions</h3></div>
      ` : `<div class="grid-2">${positions.map(c => this.renderCreditCard(c)).join('')}</div>`;
    } else if (tab === 'upcoming') {
      const upcoming = DashboardEngine.getUpcomingRepayments(this.credits, WalletManager.address);
      content.innerHTML = upcoming.length === 0 ? `
        <div class="empty-state"><i class="fas fa-calendar-check"></i><h3 class="text-lg font-semibold mt-2">No Upcoming Repayments</h3></div>
      ` : `
        <div class="table-wrapper"><table class="data-table">
          <thead><tr><th>Credit</th><th>Due Date</th><th>Remaining</th><th>Days Left</th><th>Action</th></tr></thead>
          <tbody>
            ${upcoming.map(c => `
              <tr>
                <td><strong>#${String(c.id)}</strong></td>
                <td>${dayjs.unix(Number(c.dueDate)).format('MMM D, YYYY')}</td>
                <td>${c.remainingAmount.toFixed(2)} USDC</td>
                <td><span class="${c.daysRemaining < 7 ? 'text-red-500 font-bold' : ''}">${c.daysRemaining}d</span></td>
                <td><button class="btn btn-sm btn-primary" onclick="AppState.navigate('repay')">Repay</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table></div>
      `;
    }
  },

  // ==========================================
  // CREDIT SCORE PAGE
  // ==========================================
  renderScore() {
    const isDark = ThemeManager.current === 'dark';

    return `
    <div>
      <div class="section-header">
        <div>
          <h1 class="section-title">Credit Scoring Engine</h1>
          <div class="section-subtitle">Deterministic, onchain-verified credit scores based on Arc Network activity</div>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Score Calculator -->
        <div class="card ${isDark ? 'bg-slate-800/50' : 'bg-white'}">
          <h3 class="text-lg font-bold mb-4"><i class="fas fa-calculator mr-2 text-blue-500"></i>Score Lookup</h3>

          <div class="form-group">
            <label class="form-label">Wallet Address</label>
            <div class="flex gap-2">
              <input type="text" id="score-wallet" class="form-input flex-1" placeholder="0x..." value="${WalletManager.address || ''}">
              <button class="btn btn-primary" onclick="AppState.handleComputeScore()">
                <i class="fas fa-search"></i> Compute
              </button>
            </div>
          </div>

          <div id="score-result" class="mt-4">
            ${this.scoreData ? this.renderScoreResult(this.scoreData) : `
              <div class="text-center py-8 opacity-40">
                <i class="fas fa-shield-alt text-4xl mb-3"></i>
                <p>Enter a wallet address to compute its credit score</p>
              </div>
            `}
          </div>
        </div>

        <!-- Score Algorithm Explanation -->
        <div>
          <div class="card ${isDark ? 'bg-slate-800/50' : 'bg-white'} mb-4">
            <h3 class="text-lg font-bold mb-4"><i class="fas fa-cogs mr-2 text-emerald-500"></i>Scoring Algorithm v1.0</h3>
            <p class="text-sm opacity-60 mb-4">The credit score is computed deterministically from onchain data. The algorithm is fully reproducible and verifiable.</p>

            <div class="space-y-3">
              <div class="flex justify-between items-center p-3 rounded-lg ${isDark ? 'bg-slate-700/50' : 'bg-slate-50'}">
                <span class="text-sm font-semibold">Base Score</span>
                <span class="badge badge-info">300 pts</span>
              </div>
              <div class="flex justify-between items-center p-3 rounded-lg ${isDark ? 'bg-slate-700/50' : 'bg-slate-50'}">
                <span class="text-sm font-semibold">Transaction Frequency</span>
                <span class="badge badge-success">up to +220 pts</span>
              </div>
              <div class="flex justify-between items-center p-3 rounded-lg ${isDark ? 'bg-slate-700/50' : 'bg-slate-50'}">
                <span class="text-sm font-semibold">DeFi Interactions</span>
                <span class="badge badge-success">up to +180 pts</span>
              </div>
              <div class="flex justify-between items-center p-3 rounded-lg ${isDark ? 'bg-slate-700/50' : 'bg-slate-50'}">
                <span class="text-sm font-semibold">Successful Repayments</span>
                <span class="badge badge-success">up to +280 pts</span>
              </div>
              <div class="flex justify-between items-center p-3 rounded-lg ${isDark ? 'bg-slate-700/50' : 'bg-slate-50'}">
                <span class="text-sm font-semibold">Default Penalty</span>
                <span class="badge badge-danger">up to -420 pts</span>
              </div>
              <div class="flex justify-between items-center p-3 rounded-lg ${isDark ? 'bg-slate-700/50' : 'bg-slate-50'}">
                <span class="text-sm font-semibold">Gas Usage Penalty</span>
                <span class="badge badge-warning">up to -80 pts</span>
              </div>
            </div>

            <div class="mt-4 p-3 rounded-lg border border-dashed ${isDark ? 'border-slate-600' : 'border-slate-300'}">
              <div class="text-xs font-bold opacity-50 mb-1">FORMULA</div>
              <code class="text-sm">Score = min(max(300 + TX + DeFi + Repay - Default - Gas, 0), 1000)</code>
            </div>
          </div>

          <div class="card ${isDark ? 'bg-slate-800/50' : 'bg-white'}">
            <h3 class="text-sm font-bold mb-3 opacity-50 uppercase tracking-wide">Score Tiers</h3>
            <div class="space-y-2">
              <div class="flex items-center gap-3"><span class="w-3 h-3 rounded-full bg-emerald-500"></span><span class="text-sm"><strong>800-1000:</strong> Excellent — All tiers eligible</span></div>
              <div class="flex items-center gap-3"><span class="w-3 h-3 rounded-full bg-blue-500"></span><span class="text-sm"><strong>650-799:</strong> Good — Standard terms</span></div>
              <div class="flex items-center gap-3"><span class="w-3 h-3 rounded-full bg-amber-500"></span><span class="text-sm"><strong>450-649:</strong> Fair — Collateral may be required</span></div>
              <div class="flex items-center gap-3"><span class="w-3 h-3 rounded-full bg-red-500"></span><span class="text-sm"><strong>0-449:</strong> Poor — Limited eligibility</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>`;
  },

  renderScoreResult(data) {
    const isDark = ThemeManager.current === 'dark';
    const risk = data.risk || ContractManager.getRiskLevel(data.score);
    const breakdown = data.breakdown;

    return `
    <div class="text-center mb-4">
      ${ScoringEngine.renderGauge(data.score)}
      <div class="mt-2"><span class="badge ${risk.class}">${risk.text} Risk</span></div>
      <p class="text-sm opacity-60 mt-2">${ScoringEngine.getInterpretation(data.score)}</p>
    </div>

    ${breakdown ? `
      <div class="space-y-2 mt-4">
        <div class="text-xs font-bold opacity-50 uppercase tracking-wide mb-2">Score Breakdown</div>
        ${this.renderBreakdownBar('Base', breakdown.base, 300, '#94a3b8')}
        ${this.renderBreakdownBar('TX Frequency', breakdown.txComponent, 220, '#3b82f6')}
        ${this.renderBreakdownBar('DeFi Activity', breakdown.defiComponent, 180, '#10b981')}
        ${this.renderBreakdownBar('Repayments', breakdown.repaymentComponent, 280, '#8b5cf6')}
        ${breakdown.defaultPenalty > 0 ? this.renderBreakdownBar('Default Penalty', -breakdown.defaultPenalty, 420, '#ef4444') : ''}
        ${breakdown.gasPenalty > 0 ? this.renderBreakdownBar('Gas Penalty', -breakdown.gasPenalty, 80, '#f59e0b') : ''}
      </div>
    ` : ''}

    ${data.onchain ? `
      <div class="mt-4 p-3 rounded-lg ${isDark ? 'bg-slate-700/50' : 'bg-slate-50'}">
        <div class="text-xs font-bold opacity-50 mb-2">Onchain Data</div>
        <div class="grid grid-cols-3 gap-2 text-xs">
          <div><span class="opacity-50">TX Count:</span> ${data.onchain.txCount}</div>
          <div><span class="opacity-50">Block:</span> ${data.onchain.blockNumber}</div>
          <div><span class="opacity-50">Source:</span> ${data.source}</div>
        </div>
      </div>
    ` : ''}`;
  },

  renderBreakdownBar(label, value, max, color) {
    const pct = Math.abs(value) / max * 100;
    const sign = value >= 0 ? '+' : '';
    return `
    <div class="flex items-center gap-3">
      <span class="text-xs w-24 opacity-60">${label}</span>
      <div class="flex-1 progress-bar">
        <div class="progress-fill" style="width:${Math.min(pct, 100)}%;background:${color}"></div>
      </div>
      <span class="text-xs font-semibold w-12 text-right" style="color:${color}">${sign}${value}</span>
    </div>`;
  },

  // ==========================================
  // REPAY PAGE
  // ==========================================
  renderRepay() {
    const isDark = ThemeManager.current === 'dark';
    if (!WalletManager.connected) {
      return `<div class="hero-gradient text-center py-16">
        <i class="fas fa-hand-holding-usd text-5xl text-blue-500 mb-4"></i>
        <h2 class="text-2xl font-bold mb-2">Connect Your Wallet</h2>
        <p class="opacity-60 mb-6">Connect to manage your repayments.</p>
        <button class="btn btn-lg btn-arc" onclick="WalletManager.connect()"><i class="fab fa-ethereum mr-2"></i> Connect Wallet</button>
      </div>`;
    }

    if (!MarketplaceEngine.hasContracts()) {
      return `<div class="hero-gradient text-center py-16">
        <i class="fas fa-link-slash text-5xl text-amber-500 mb-4"></i>
        <h2 class="text-2xl font-bold mb-2">Contracts Not Deployed</h2>
        <p class="opacity-60 mb-6 max-w-lg mx-auto">Repayment management will be available once the smart contracts are deployed on Arc Network.</p>
      </div>`;
    }

    const borrowerPositions = DashboardEngine.getBorrowerPositions(this.credits, WalletManager.address)
      .filter(c => c.funded && !c.defaulted && !c.settled);

    return `
    <div>
      <div class="section-header">
        <div>
          <h1 class="section-title">Repayment Center</h1>
          <div class="section-subtitle">Manage your outstanding credit repayments</div>
        </div>
      </div>

      ${borrowerPositions.length === 0 ? `
        <div class="empty-state card ${isDark ? 'bg-slate-800/50' : 'bg-white'}">
          <i class="fas fa-check-circle text-emerald-500"></i>
          <h3 class="text-lg font-semibold mt-2">No Outstanding Repayments</h3>
          <p class="mt-1">You have no active credit positions requiring repayment.</p>
        </div>
      ` : `
        <div class="space-y-4">
          ${borrowerPositions.map(c => {
            const principal = ContractManager.fromUSDC(c.principal);
            const repayment = ContractManager.fromUSDC(c.repaymentAmount);
            const repaid = c.repaymentState ? ContractManager.fromUSDC(c.repaymentState.totalRepaid) : '0.00';
            const remaining = c.repaymentState
              ? ContractManager.fromUSDC(BigInt(c.repaymentAmount.toString()) - BigInt(c.repaymentState.totalRepaid.toString()))
              : repayment;
            const progress = DashboardEngine.getRepaymentProgress(c);
            const dueStr = dayjs.unix(Number(c.dueDate)).format('MMM D, YYYY');
            const isOverdue = c.daysRemaining < 0;

            return `
            <div class="card ${isDark ? 'bg-slate-800/50' : 'bg-white'}">
              <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
                <div>
                  <h3 class="text-lg font-bold">Credit #${String(c.id)}</h3>
                  <div class="text-sm opacity-60">Due: ${dueStr} ${isOverdue ? '<span class="text-red-500 font-bold">(OVERDUE)</span>' : `(${c.daysRemaining} days remaining)`}</div>
                </div>
                <span class="badge ${isOverdue ? 'badge-danger' : 'badge-info'}">
                  ${isOverdue ? 'Overdue' : 'Active'}
                </span>
              </div>

              <div class="grid-4 mb-4">
                <div class="stat-card">
                  <div class="stat-label">Principal</div>
                  <div class="stat-value text-lg">${principal}</div>
                </div>
                <div class="stat-card">
                  <div class="stat-label">Total Due</div>
                  <div class="stat-value text-lg">${repayment}</div>
                </div>
                <div class="stat-card">
                  <div class="stat-label">Repaid</div>
                  <div class="stat-value text-lg text-emerald-500">${repaid}</div>
                </div>
                <div class="stat-card">
                  <div class="stat-label">Remaining</div>
                  <div class="stat-value text-lg text-amber-500">${remaining}</div>
                </div>
              </div>

              <div class="mb-4">
                <div class="flex justify-between text-sm mb-1">
                  <span class="opacity-50">Repayment Progress</span>
                  <span class="font-semibold">${progress.toFixed(1)}%</span>
                </div>
                <div class="progress-bar" style="height:8px">
                  <div class="progress-fill bg-gradient-to-r from-blue-500 to-emerald-400" style="width:${progress}%"></div>
                </div>
              </div>

              <div class="flex gap-3">
                <div class="form-group flex-1 mb-0">
                  <input type="number" id="repay-amount-${String(c.id)}" class="form-input" placeholder="Amount in USDC" step="0.01" value="${remaining}">
                </div>
                <button class="btn btn-primary" onclick="AppState.handleRepay(${String(c.id)}n)">
                  <i class="fas fa-paper-plane"></i> Send Repayment
                </button>
                <button class="btn btn-sm btn-ghost" onclick="document.getElementById('repay-amount-${String(c.id)}').value='${remaining}'">
                  Pay Full
                </button>
              </div>
            </div>`;
          }).join('')}
        </div>
      `}
    </div>`;
  },

  // ==========================================
  // EVENT HANDLERS
  // ==========================================
  async handleCreateCredit() {
    try {
      if (!MarketplaceEngine.hasContracts()) {
        Toast.show('Smart contracts are not deployed yet. Deploy contracts first.', 'error');
        return;
      }

      if (!WalletManager.connected || !WalletManager.signer) {
        Toast.show('Please connect your wallet first.', 'warning');
        return;
      }

      const principal = document.getElementById('orig-principal').value;
      const repayment = document.getElementById('orig-repayment').value;
      const dueDate = document.getElementById('orig-dueDate').value;
      const schedule = document.getElementById('orig-schedule').value;
      const installments = document.getElementById('orig-installments').value;
      const minScore = document.getElementById('orig-minScore').value;
      const metadata = document.getElementById('orig-metadata').value;
      const isPrivate = document.getElementById('orig-private').checked;
      const requireCollateral = document.getElementById('orig-collateral').checked;

      // === Frontend validation ===
      if (!principal || !repayment || !dueDate) {
        Toast.show('Please fill in all required fields: Principal, Repayment Amount, and Due Date.', 'warning');
        return;
      }

      if (parseFloat(principal) <= 0) {
        Toast.show('Principal must be greater than 0.', 'warning');
        return;
      }

      if (parseFloat(repayment) <= parseFloat(principal)) {
        Toast.show('Repayment amount must be greater than principal (to include interest/yield).', 'warning');
        return;
      }

      const dueDateTs = Math.floor(new Date(dueDate).getTime() / 1000);
      const nowTs = Math.floor(Date.now() / 1000);
      if (dueDateTs <= nowTs) {
        Toast.show('Due date must be in the future.', 'warning');
        return;
      }

      // Collateral-specific validation
      if (requireCollateral) {
        const collToken = document.getElementById('orig-collToken')?.value;
        const collAmount = document.getElementById('orig-collAmount')?.value;
        const collVal = document.getElementById('orig-collVal')?.value;
        const maxLtv = document.getElementById('orig-maxLtv')?.value;

        if (!collToken || collToken.trim() === '' || !collToken.startsWith('0x') || collToken.length !== 42) {
          Toast.show('Please enter a valid collateral token address (0x... format, 42 characters).', 'warning');
          return;
        }
        if (!collAmount || parseFloat(collAmount) <= 0) {
          Toast.show('Collateral amount must be greater than 0.', 'warning');
          return;
        }
        if (!collVal || parseFloat(collVal) <= 0) {
          Toast.show('Collateral valuation (USDC) must be greater than 0. This is the USDC value of the collateral.', 'warning');
          return;
        }
        if (!maxLtv || parseInt(maxLtv) <= 0 || parseInt(maxLtv) > 10000) {
          Toast.show('Max LTV must be between 1 and 10000 basis points (0.01% to 100%).', 'warning');
          return;
        }

        // LTV check
        const principalUSDC = parseFloat(principal);
        const valuationUSDC = parseFloat(collVal);
        const ltvBps = parseInt(maxLtv);
        if (principalUSDC * 10000 > valuationUSDC * ltvBps) {
          const maxPrincipal = (valuationUSDC * ltvBps / 10000).toFixed(2);
          Toast.show(`Principal (${principalUSDC} USDC) exceeds max LTV ratio. With ${valuationUSDC} USDC collateral at ${(ltvBps/100).toFixed(0)}% LTV, max principal is ${maxPrincipal} USDC.`, 'warning');
          return;
        }
      }

      // Disable button
      const btn = document.getElementById('create-credit-btn');
      if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...'; }

      Toast.show('Processing metadata...', 'info');

      // Process metadata (encrypt if private)
      let parsedMeta;
      try { parsedMeta = JSON.parse(metadata); } catch { parsedMeta = { raw: metadata }; }

      const metaResult = isPrivate
        ? await PrivacyManager.processPrivateMetadata(parsedMeta)
        : await PrivacyManager.processPublicMetadata(parsedMeta);

      const identityHash = PrivacyManager.generateIdentityHash(WalletManager.address);

      // Build contract params
      const params = {
        principal: ContractManager.toUSDC(principal),
        repaymentAmount: ContractManager.toUSDC(repayment),
        dueDate: BigInt(dueDateTs),
        schedule: Number(schedule),
        installmentCount: Number(schedule) === 1 ? Math.max(Number(installments), 2) : 1,
        borrowerIdentityHash: identityHash,
        metadataURI: metaResult.metadataURI,
        metadataHash: metaResult.metadataHash,
        isPrivate,
        minimumScore: Number(minScore),
        collateralRequired: requireCollateral,
        collateralToken: requireCollateral ? (document.getElementById('orig-collToken')?.value || ethers.ZeroAddress) : ethers.ZeroAddress,
        collateralAmount: requireCollateral ? ContractManager.toUSDC(document.getElementById('orig-collAmount')?.value || '0') : 0n,
        collateralValuationUSDC: requireCollateral ? ContractManager.toUSDC(document.getElementById('orig-collVal')?.value || '0') : 0n,
        maxLtvBps: requireCollateral ? Number(document.getElementById('orig-maxLtv')?.value || '7000') : 0,
        tokenURI: metaResult.metadataURI
      };

      // Auto-submit onchain score if minimumScore > 0
      if (Number(minScore) > 0) {
        Toast.show('Verifying your onchain credit score...', 'info');
        try {
          // Check current onchain score
          const currentOnchainScore = await ContractManager.getScore(WalletManager.address);
          console.log('Current onchain score:', currentOnchainScore);
          
          if (currentOnchainScore < Number(minScore)) {
            // Try to update score onchain via backend
            Toast.show('Updating your onchain credit score...', 'info');
            const submitResp = await fetch('/api/score/submit', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ wallet: WalletManager.address })
            });
            const submitResult = await submitResp.json();
            
            if (submitResult.error) {
              throw new Error(`Score submission failed: ${submitResult.error}`);
            }
            
            console.log('Score updated onchain:', submitResult);
            
            // Check if the new score meets the minimum
            if (submitResult.newScore < Number(minScore)) {
              Toast.show(
                `Your onchain credit score (${submitResult.newScore}) is below the minimum (${minScore}). ` +
                `Try lowering the Minimum Credit Score or increase your onchain activity.`, 
                'warning'
              );
              return;
            }
            
            Toast.show(`Onchain score updated to ${submitResult.newScore}!`, 'success');
          }
        } catch (scoreErr) {
          console.warn('Score check/update warning:', scoreErr);
          // If we can't verify, warn but let the user try anyway
          Toast.show('Could not verify onchain score. Attempting transaction anyway...', 'warning');
        }
      }

      Toast.show('Submitting transaction to Arc Network...', 'info');

      const receipt = await ContractManager.createCredit(params);
      Toast.show(`Credit position created successfully! TX: ${receipt.hash.slice(0, 16)}...`, 'success');

      // Reload marketplace data
      try {
        await MarketplaceEngine.loadCredits();
        this.credits = MarketplaceEngine.credits;
      } catch {}

      this.navigate('marketplace');
    } catch (err) {
      console.error('Create credit error:', err);
      const errorMsg = err.message || 'Transaction failed';
      // Show first line of error if multi-line
      const firstLine = errorMsg.split('\n')[0];
      Toast.show(firstLine, 'error');
    } finally {
      // Re-enable button
      const btn = document.getElementById('create-credit-btn');
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-rocket"></i> Create Credit Position'; }
    }
  },

  async handleBuy(creditId, priceUSDC) {
    if (!WalletManager.connected) {
      Toast.show('Please connect your wallet first', 'warning');
      return;
    }
    if (!MarketplaceEngine.hasContracts()) {
      Toast.show('Smart contracts are not deployed yet.', 'error');
      return;
    }

    try {
      Toast.show('Approving USDC and purchasing...', 'info');
      const receipt = await ContractManager.buyCredit(creditId, priceUSDC);
      Toast.show(`Purchase complete! TX: ${receipt.hash.slice(0, 12)}...`, 'success');
      await MarketplaceEngine.loadCredits();
      this.render();
    } catch (err) {
      Toast.show(err.shortMessage || err.message || 'Purchase failed', 'error');
    }
  },

  async handleListPrimary(creditId, principal) {
    if (!WalletManager.connected) return;
    const price = prompt('Enter listing price in USDC:', ContractManager.fromUSDC(principal));
    if (!price) return;

    try {
      Toast.show('Listing credit position...', 'info');
      const expiresAt = BigInt(Math.floor(Date.now() / 1000) + 86400 * 7);
      const receipt = await ContractManager.listPrimary(creditId, ContractManager.toUSDC(price), expiresAt);
      Toast.show(`Listed! TX: ${receipt.hash.slice(0, 12)}...`, 'success');
      await MarketplaceEngine.loadCredits();
      this.render();
    } catch (err) {
      Toast.show(err.shortMessage || err.message || 'Listing failed', 'error');
    }
  },

  async handleListSecondary(creditId, principal) {
    if (!WalletManager.connected) return;
    const price = prompt('Enter secondary listing price in USDC:', ContractManager.fromUSDC(principal));
    if (!price) return;

    try {
      Toast.show('Listing on secondary market...', 'info');
      const expiresAt = BigInt(Math.floor(Date.now() / 1000) + 86400 * 14);
      const receipt = await ContractManager.listSecondary(creditId, ContractManager.toUSDC(price), expiresAt);
      Toast.show(`Listed! TX: ${receipt.hash.slice(0, 12)}...`, 'success');
      await MarketplaceEngine.loadCredits();
      this.render();
    } catch (err) {
      Toast.show(err.shortMessage || err.message || 'Listing failed', 'error');
    }
  },

  async handleRepay(creditId) {
    if (!WalletManager.connected) return;
    const input = document.getElementById(`repay-amount-${String(creditId)}`);
    const amount = input?.value;
    if (!amount || parseFloat(amount) <= 0) {
      Toast.show('Enter a valid repayment amount', 'warning');
      return;
    }

    try {
      Toast.show('Processing repayment...', 'info');
      const receipt = await ContractManager.repayCredit(creditId, ContractManager.toUSDC(amount));
      Toast.show(`Repayment sent! TX: ${receipt.hash.slice(0, 12)}...`, 'success');
      await MarketplaceEngine.loadCredits();
      this.render();
    } catch (err) {
      Toast.show(err.shortMessage || err.message || 'Repayment failed', 'error');
    }
  },

  async handleComputeScore() {
    const walletInput = document.getElementById('score-wallet');
    const wallet = walletInput?.value;

    if (!wallet || !wallet.startsWith('0x') || wallet.length !== 42) {
      Toast.show('Enter a valid Ethereum address', 'warning');
      return;
    }

    try {
      Toast.show('Computing credit score from Arc Network data...', 'info');
      this.scoreData = await ScoringEngine.computeScore(wallet);
      Toast.show(`Score computed: ${this.scoreData.score}/1000`, 'success');
      this.render();
    } catch (err) {
      Toast.show(err.message || 'Scoring failed', 'error');
    }
  },

  bindEvents() {
    // Toggle collateral fields visibility
    const collCheck = document.getElementById('orig-collateral');
    const collFields = document.getElementById('collateral-fields');
    if (collCheck && collFields) {
      collCheck.addEventListener('change', () => {
        collFields.classList.toggle('hidden', !collCheck.checked);
      });
    }
  }
};

window.AppState = AppState;

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
  AppState.init();
});
