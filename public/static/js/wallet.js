// === Wallet Connection Manager ===
const WalletManager = {
  provider: null,
  signer: null,
  address: null,
  chainId: null,
  connected: false,

  async connect() {
    if (!window.ethereum) {
      Toast.show('MetaMask not detected. Please install MetaMask to continue.', 'error');
      return false;
    }

    try {
      // Request accounts
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      if (!accounts || accounts.length === 0) {
        Toast.show('No accounts found. Please unlock MetaMask.', 'error');
        return false;
      }

      this.address = accounts[0];
      this.provider = new ethers.BrowserProvider(window.ethereum);
      this.signer = await this.provider.getSigner();

      // Check and switch network
      const network = await this.provider.getNetwork();
      this.chainId = Number(network.chainId);

      if (this.chainId !== ARC_CONFIG.chainId) {
        await this.switchToArc();
      }

      this.connected = true;
      this._setupListeners();
      
      Toast.show(`Wallet connected: ${this.shortAddress}`, 'success');
      if (window.AppState) window.AppState.onWalletChange();
      
      return true;
    } catch (err) {
      console.error('Connection failed:', err);
      Toast.show(`Connection failed: ${err.message}`, 'error');
      return false;
    }
  },

  async switchToArc() {
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: ARC_CONFIG.chainIdHex }]
      });
    } catch (switchError) {
      // Chain not added, add it
      if (switchError.code === 4902) {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: ARC_CONFIG.chainIdHex,
            chainName: ARC_CONFIG.name,
            nativeCurrency: ARC_CONFIG.currency,
            rpcUrls: ARC_CONFIG.rpcUrls,
            blockExplorerUrls: [ARC_CONFIG.explorer]
          }]
        });
      } else {
        throw switchError;
      }
    }

    this.provider = new ethers.BrowserProvider(window.ethereum);
    this.signer = await this.provider.getSigner();
    const network = await this.provider.getNetwork();
    this.chainId = Number(network.chainId);
  },

  disconnect() {
    this.provider = null;
    this.signer = null;
    this.address = null;
    this.chainId = null;
    this.connected = false;
    Toast.show('Wallet disconnected', 'info');
    if (window.AppState) window.AppState.onWalletChange();
  },

  get shortAddress() {
    if (!this.address) return '';
    return `${this.address.slice(0, 6)}...${this.address.slice(-4)}`;
  },

  get isCorrectChain() {
    return this.chainId === ARC_CONFIG.chainId;
  },

  _setupListeners() {
    if (!window.ethereum) return;

    window.ethereum.on('accountsChanged', (accounts) => {
      if (accounts.length === 0) {
        this.disconnect();
      } else {
        this.address = accounts[0];
        Toast.show(`Account changed: ${this.shortAddress}`, 'info');
        if (window.AppState) window.AppState.onWalletChange();
      }
    });

    window.ethereum.on('chainChanged', (chainIdHex) => {
      this.chainId = parseInt(chainIdHex, 16);
      if (this.chainId !== ARC_CONFIG.chainId) {
        Toast.show('Please switch to Arc Testnet (Chain ID: 5042002)', 'warning');
      }
      if (window.AppState) window.AppState.onWalletChange();
    });
  }
};

// === Toast Notification System ===
const Toast = {
  container: null,

  init() {
    this.container = document.createElement('div');
    this.container.className = 'toast-container';
    document.body.appendChild(this.container);
  },

  show(message, type = 'info', duration = 4000) {
    if (!this.container) this.init();

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' };
    toast.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i><span>${message}</span>`;

    this.container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }
};

window.WalletManager = WalletManager;
window.Toast = Toast;
