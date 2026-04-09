export class GameCard {
  constructor() {
    this.root = null;
    this.statusNodes = {};
  }

  mount(parent) {
    this.root = document.createElement('section');
    this.root.className = 'panel-card game-card';
    this.root.innerHTML = `
      <div class="game-card-head">
        <div class="status-strip">
          <div><span>Sim Time</span><strong data-status="time">00:00</strong></div>
          <div><span>Threats</span><strong data-status="threats">0</strong></div>
          <div><span>Suspicious</span><strong data-status="suspicious">0</strong></div>
          <div><span>Enemy</span><strong data-status="enemy">0</strong></div>
          <div><span>Interceptors</span><strong data-status="interceptors">0</strong></div>
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
