const ICONS = {
  run: '<path d="M7 4l11 8-11 8z"/><path d="M3 4h2v16H3z"/>',
  play: '<path d="M7 4l11 8-11 8z"/>',
  pause: '<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>',
  reset: '<path d="M12 4a8 8 0 108 8h-2a6 6 0 11-1.76-4.24L14 10h7V3l-2.95 2.95A7.96 7.96 0 0012 4z"/>',
  speed: '<path d="M3 13a9 9 0 1118 0h-2a7 7 0 10-14 0H3zm8-5h2v6h-2z"/>',
  music: '<path d="M16 3v10.2A3.8 3.8 0 1114 10V6.2l-6 1.2V16a3.8 3.8 0 11-2-3.4V5.8l10-2z"/>',
  sfx: '<path d="M3 9h4l5-4v14l-5-4H3z"/><path d="M15 9a3 3 0 010 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M17 6a6 6 0 010 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  back: '<path d="M10 6l-6 6 6 6"/><path d="M4 12h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  debug: '<path d="M4 6h16v12H4z"/><path d="M8 2v4M16 2v4M8 18v4M16 18v4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  friendly: '<path d="M12 3l5 6-1 8h-8L7 9l5-6z"/>',
  contact: '<path d="M12 3a5 5 0 015 5c0 3-5 10-5 10S7 11 7 8a5 5 0 015-5z"/><circle cx="12" cy="8" r="2" fill="currentColor"/>',
  interceptor: '<path d="M4 12h8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9 7l5 5-5 5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="18" cy="12" r="3"/>',
  minimap: '<path d="M3 5l6-2 6 2 6-2v16l-6 2-6-2-6 2z"/><path d="M9 3v16M15 5v16" fill="none" stroke="currentColor" stroke-width="2"/>',
  graph: '<path d="M4 18h16" fill="none" stroke="currentColor" stroke-width="2"/><path d="M6 14l4-4 3 2 5-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  table: '<path d="M3 5h18v14H3z"/><path d="M3 10h18M9 5v14M15 5v14" fill="none" stroke="currentColor" stroke-width="2"/>',
  warning: '<path d="M12 3l10 18H2L12 3z"/><path d="M12 9v6M12 18h.01" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  success: '<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  enemy: '<path d="M12 3l9 9-9 9-9-9z"/><path d="M8 8l8 8M16 8l-8 8" fill="none" stroke="currentColor" stroke-width="2"/>',
  suspicious: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16h.01" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  shore: '<path d="M3 16c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 4 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M6 11l3-4 4 3 5-5 1 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  rig: '<path d="M8 4h8l-1 4h4l-2 3-1 8H8L7 11 5 8h4z"/><path d="M10 4v15M14 4v15M7 19h10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
};

export function renderIcon(name, label = '', className = '') {
  const body = ICONS[name] ?? ICONS.warning;
  const aria = label ? ` role="img" aria-label="${label}"` : ' aria-hidden="true"';

  return `<svg viewBox="0 0 24 24" class="ui-icon ${className}"${aria}>${body}</svg>`;
}
