import { renderIcon } from '../components/Icon.js';
import { withBasePath } from '../../utils/assets.js';

export class ScenarioSelectionScreen {
  constructor({ scenarios, onSelect }) {
    this.scenarios = scenarios;
    this.onSelect = onSelect;
    this.root = null;
  }

  mount(parent) {
    this.root = document.createElement('div');
    this.root.className = 'screen scenario-selection-screen';
    this.root.innerHTML = `
      <section class="panel-card scenario-selection-shell">
        <div class="scenario-selection-brand">
          <img src="${withBasePath('logo.png')}" alt="Skana Robotics" class="scenario-logo" />
          <div>
            <p class="scenario-kicker">Skana Robotics</p>
            <h1>Scenario Selection</h1>
            <p class="scenario-summary">Choose the operational mission profile to launch the simulation.</p>
          </div>
        </div>
        <div class="scenario-card-grid">
          ${this.scenarios.map((scenario) => `
            <button class="scenario-card" type="button" data-scenario="${scenario.id}">
              <span class="scenario-card-icon">${renderIcon(scenario.icon)}</span>
              <strong>${scenario.title}</strong>
              <span>${scenario.subtitle}</span>
            </button>
          `).join('')}
        </div>
      </section>
    `;

    for (const button of this.root.querySelectorAll('[data-scenario]')) {
      button.addEventListener('click', () => {
        this.onSelect?.(button.dataset.scenario);
      });
    }

    parent.replaceChildren(this.root);
  }

  destroy() {
    this.root?.remove();
    this.root = null;
  }
}
