export class GameCard {
  constructor(statusItems = null) {
    this.root = null;
    this.statusNodes = {};
    this.statusItems = statusItems ?? [
      { key: 'time', label: 'Sim Time', value: '00:00' },
      { key: 'threats', label: 'Threats', value: '0' },
      { key: 'suspicious', label: 'Suspicious', value: '0' },
      { key: 'enemy', label: 'Enemy', value: '0' },
      { key: 'interceptors', label: 'Interceptors', value: '0' },
    ];
  }

  mount(parent) {
    this.root = document.createElement('section');
    this.root.className = 'panel-card game-card';
    this.root.innerHTML = `
      <div class="game-card-head">
        <div class="status-strip">
          ${this.statusItems.map((item) => `
            <div><span>${item.label}</span><strong data-status="${item.key}">${item.value}</strong></div>
          `).join('')}
        </div>
      </div>
      <div class="game-alert-host"></div>
      <div class="sim-canvas-shell">
        <div class="sim-canvas-host"></div>
      </div>
    `;

    for (const node of this.root.querySelectorAll('[data-status]')) {
      this.statusNodes[node.dataset.status] = node;
    }

    parent.appendChild(this.root);
  }

  getCanvasHost() {
    return this.root?.querySelector('.sim-canvas-host') ?? null;
  }

  getAlertHost() {
    return this.root?.querySelector('.game-alert-host') ?? null;
  }

  setStatus(key, value) {
    const node = this.statusNodes[key];

    if (node) {
      node.textContent = value;
    }
  }

  destroy() {
    this.root?.remove();
    this.root = null;
    this.statusNodes = {};
  }
}
