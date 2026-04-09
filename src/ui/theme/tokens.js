export const THEME_TOKENS = {
  pageBgTop: '#020912',
  pageBgBottom: '#01050b',
  panelBg: 'rgba(7, 20, 34, 0.9)',
  panelBgStrong: 'rgba(5, 14, 24, 0.96)',
  textPrimary: '#ecf5ff',
  textSecondary: '#9bb0c4',
  accent: '#00b6d7',
  accentSoft: '#7dd7e8',
  success: '#43d38d',
  warning: '#f5b950',
  danger: '#ff6776',
  border: 'rgba(58, 93, 121, 0.58)',
  divider: 'rgba(83, 122, 152, 0.3)',
};

const CSS_VAR_MAP = {
  pageBgTop: '--color-page-bg-top',
  pageBgBottom: '--color-page-bg-bottom',
  panelBg: '--color-panel-bg',
  panelBgStrong: '--color-panel-bg-strong',
  textPrimary: '--color-text-primary',
  textSecondary: '--color-text-secondary',
  accent: '--color-accent',
  accentSoft: '--color-accent-soft',
  success: '--color-success',
  warning: '--color-warning',
  danger: '--color-danger',
  border: '--color-border',
  divider: '--color-divider',
};

export function applyThemeTokens(overrides = {}) {
  const root = document.documentElement;
  const merged = {
    ...THEME_TOKENS,
    ...overrides,
  };

  for (const [key, cssVar] of Object.entries(CSS_VAR_MAP)) {
    root.style.setProperty(cssVar, merged[key]);
  }

  return merged;
}
