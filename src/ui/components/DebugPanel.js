export class DebugPanel {
  constructor() {
    this.root = null;
    this.contentNode = null;
    this.visible = false;
  }

  mount(parent) {
    this.root = document.createElement('section');
    this.root.className = 'panel-card debug-panel';
    this.root.innerHTML = `
      <div class="panel-head">
        <div>
          <h3>Debug Panel</h3>
          <p>Runtime diagnostics and selected-track internals.</p>
        </div>
      </div>
      <div class="debug-panel-content"></div>
    `;

    this.contentNode = this.root.querySelector('.debug-panel-content');
    parent.appendChild(this.root);
    this.setVisible(this.visible);
  }

  setVisible(visible) {
    this.visible = Boolean(visible);

    if (this.root) {
      this.root.classList.toggle('is-hidden', !this.visible);
    }
  }

  toggle() {
    this.setVisible(!this.visible);
    return this.visible;
  }

  update(items) {
    if (!this.contentNode) {
      return;
    }

    this.contentNode.innerHTML = items.map((item) => `
      <div class="debug-row">
        <span>${item.label}</span>
        <strong>${item.value}</strong>
      </div>
    `).join('');
  }

  destroy() {
    this.root?.remove();
    this.root = null;
    this.contentNode = null;
  }
}
