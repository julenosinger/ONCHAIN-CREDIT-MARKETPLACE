// === Theme System — Light & Dark Mode ===
const ThemeManager = {
  STORAGE_KEY: 'ocm-theme',
  
  init() {
    const stored = localStorage.getItem(this.STORAGE_KEY);
    if (stored) {
      this.apply(stored);
    } else {
      // Detect system preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      this.apply(prefersDark ? 'dark' : 'light');
    }

    // Listen for OS theme changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (!localStorage.getItem(this.STORAGE_KEY)) {
        this.apply(e.matches ? 'dark' : 'light');
      }
    });
  },

  apply(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    this._current = theme;
  },

  toggle() {
    const next = this._current === 'dark' ? 'light' : 'dark';
    localStorage.setItem(this.STORAGE_KEY, next);
    this.apply(next);
    return next;
  },

  get current() {
    return this._current || 'dark';
  },

  _current: 'dark'
};

ThemeManager.init();
window.ThemeManager = ThemeManager;
