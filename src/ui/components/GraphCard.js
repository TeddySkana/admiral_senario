import { renderIcon } from './Icon.js';

export class GraphCard {
  constructor() {
    this.root = null;
    this.slots = {};
  }

  mount(parent) {
    this.root = document.createElement('section');
    this.root.className = 'panel-card graph-combo-card';
    this.root.innerHTML = `
      <div class="panel-head graph-combo-head">
        <h3>${renderIcon('graph')}Operational Trends</h3>
      </div>
      <div class="graph-combo-grid">
        <div class="graph-slot" data-slot="classifications"></div>
        <div class="graph-slot" data-slot="borderDistance"></div>
      </div>
    `;

    for (const slot of this.root.querySelectorAll('[data-slot]')) {
      this.slots[slot.dataset.slot] = slot;
    }

    parent.appendChild(this.root);
  }

  getSlot(name) {
    return this.slots[name] ?? null;
  }

  destroy() {
    this.root?.remove();
    this.root = null;
    this.slots = {};
  }
}
