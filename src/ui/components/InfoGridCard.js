export class InfoGridCard {
  constructor() {
    this.root = null;
    this.slots = {};
  }

  mount(parent) {
    this.root = document.createElement('section');
    this.root.className = 'panel-card info-grid-card';
    this.root.innerHTML = `
      <div class="info-grid-shell">
        <div class="info-grid-slot" data-slot="friendly"></div>
        <div class="info-grid-slot" data-slot="contact"></div>
        <div class="info-grid-slot" data-slot="minimap"></div>
        <div class="info-grid-slot" data-slot="interceptor"></div>
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
