import { cloneScenarioConfig, defaultScenario, getEngagementRangeNm } from '../../sim/config/defaultScenario.js';
import { formatFixed } from '../../sim/utils/units.js';
import { renderIcon } from '../components/Icon.js';
import { SetupPanel } from '../components/SetupPanel.js';

const FIELD_GROUPS = [
  {
    title: 'World Geometry',
    description: 'Define the operational maritime frame, border geometry, and fishing area placement.',
    fields: [
      { path: 'world.widthNm', label: 'World Width', unit: 'nm', type: 'number', step: '0.1' },
      { path: 'world.heightNm', label: 'World Height', unit: 'nm', type: 'number', step: '0.1' },
      { path: 'world.coastlineXNm', label: 'Coastline X', unit: 'nm', type: 'number', step: '0.1' },
      { path: 'world.westBorderXNm', label: 'West Border X', unit: 'nm', type: 'number', step: '0.1' },
      { path: 'world.northBorderYNm', label: 'North Border Y', unit: 'nm', type: 'number', step: '0.1' },
      { path: 'world.southBorderYNm', label: 'South Border Y', unit: 'nm', type: 'number', step: '0.1' },
      { path: 'world.shippingLaneWestXNm', label: 'Lane West X', unit: 'nm', type: 'number', step: '0.1' },
      { path: 'world.shippingLaneEastXNm', label: 'Lane East X', unit: 'nm', type: 'number', step: '0.1' },
      { path: 'fishingZone.depthNm', label: 'Fishing Depth', unit: 'nm', type: 'number', step: '0.1' },
      { path: 'fishingZone.northInsetNm', label: 'Fishing North Inset', unit: 'nm', type: 'number', step: '0.1' },
      { path: 'fishingZone.southInsetNm', label: 'Fishing South Inset', unit: 'nm', type: 'number', step: '0.1' },
    ],
  },
  {
    title: 'Simulation Profile',
    description: 'Configure scenario density, deterministic seed behavior, and startup tempo.',
    fields: [
      { path: 'simulation.initialSpeedMultiplier', label: 'Initial Speed', unit: 'x', type: 'number', step: '1' },
      { path: 'contacts.fishingBoatCount', label: 'Fishing Boats', unit: '', type: 'number', step: '1' },
      { path: 'contacts.cargoShipCount', label: 'Neutral Lane Ships', unit: '', type: 'number', step: '1' },
      { path: 'randomSeed', label: 'Random Seed', unit: '', type: 'text' },
      { path: 'spawnBehavior.enableNeutralLaneTraffic', label: 'Neutral Lane Traffic', unit: '', type: 'checkbox' },
    ],
  },
  {
    title: 'Dvora Forces',
    description: 'Tune friendly performance, endurance, and patrol offsets on each border line.',
    fields: [
      { path: 'dvora.friendlyBoatType', label: 'Friendly Type', unit: '', type: 'text' },
      { path: 'dvora.friendlyBoatCount', label: 'Patrol Boats', unit: '', type: 'number', step: '1' },
      { path: 'dvora.maxSpeedKnots', label: 'Max Speed', unit: 'kt', type: 'number', step: '0.1' },
      { path: 'dvora.cruiseSpeedKnots', label: 'Cruise Speed', unit: 'kt', type: 'number', step: '0.1' },
      { path: 'dvora.maxOperationalRangeNm', label: 'Operational Range', unit: 'nm', type: 'number', step: '1' },
      { path: 'dvora.engagementRangeNm', label: 'Engagement Radius', unit: 'nm', type: 'number', step: '0.1' },
      { path: 'patrolOffsetsNm.north', label: 'North Patrol Offset', unit: 'nm', type: 'number', step: '0.1' },
      { path: 'patrolOffsetsNm.west', label: 'West Patrol Offset', unit: 'nm', type: 'number', step: '0.1' },
      { path: 'patrolOffsetsNm.south', label: 'South Patrol Offset', unit: 'nm', type: 'number', step: '0.1' },
    ],
  },
  {
    title: 'Hostile Classification Rules',
    description: 'Configure thresholds for suspicious and enemy classification logic.',
    fields: [
      { path: 'classification.suspiciousSpeedThresholdKnots', label: 'Hostile Speed Threshold', unit: 'kt', type: 'number', step: '0.1' },
      { path: 'classification.hostileHeadingDurationMinutes', label: 'Hostile Heading Duration', unit: 'min', type: 'number', step: '0.1' },
      { path: 'classification.homeHeadingToleranceDegrees', label: 'Home Heading Tolerance', unit: 'deg', type: 'number', step: '1' },
      { path: 'classification.suspiciousEscalationThreshold', label: 'Suspicious Count Before Target', unit: 'times', type: 'number', step: '1' },
    ],
  },
  {
    title: 'Environment And Spawn Behavior',
    description: 'Set maritime conditions and contact behavior weights for deterministic variability.',
    fields: [
      { path: 'environment.seaState', label: 'Sea State', unit: '', type: 'number', step: '1' },
      { path: 'environment.waveHeightMeters', label: 'Wave Height', unit: 'm', type: 'number', step: '0.1' },
      { path: 'environment.windKnots', label: 'Wind', unit: 'kt', type: 'number', step: '0.1' },
      { path: 'spawnBehavior.attackModeChancePerMinute', label: 'Attack Mode Chance / Min', unit: '0..1', type: 'number', step: '0.01' },
      { path: 'spawnBehavior.fishingSpeedMinKnots', label: 'Fishing Speed Min', unit: 'kt', type: 'number', step: '0.1' },
      { path: 'spawnBehavior.fishingSpeedMaxKnots', label: 'Fishing Speed Max', unit: 'kt', type: 'number', step: '0.1' },
      { path: 'spawnBehavior.hostileSpeedMinKnots', label: 'Hostile Speed Min', unit: 'kt', type: 'number', step: '0.1' },
      { path: 'spawnBehavior.hostileSpeedMaxKnots', label: 'Hostile Speed Max', unit: 'kt', type: 'number', step: '0.1' },
      { path: 'spawnBehavior.cargoSpeedMinKnots', label: 'Cargo Speed Min', unit: 'kt', type: 'number', step: '0.1' },
      { path: 'spawnBehavior.cargoSpeedMaxKnots', label: 'Cargo Speed Max', unit: 'kt', type: 'number', step: '0.1' },
    ],
  },
];

function getValueByPath(object, path) {
  return path.split('.').reduce((value, key) => value?.[key], object);
}

function setValueByPath(object, path, value) {
  const keys = path.split('.');
  const lastKey = keys.pop();
  const target = keys.reduce((accumulator, key) => accumulator[key], object);
  target[lastKey] = value;
}

function normalizeConfig(config) {
  config.world.widthNm = Math.max(10, config.world.widthNm);
  config.world.heightNm = Math.max(10, config.world.heightNm);
  config.world.westBorderXNm = Math.max(1, Math.min(config.world.widthNm - 5, config.world.westBorderXNm));
  config.world.coastlineXNm = Math.max(config.world.westBorderXNm + 3, Math.min(config.world.widthNm - 0.5, config.world.coastlineXNm));
  config.world.northBorderYNm = Math.max(0.5, Math.min(config.world.heightNm - 5, config.world.northBorderYNm));
  config.world.southBorderYNm = Math.max(config.world.northBorderYNm + 3, Math.min(config.world.heightNm - 0.5, config.world.southBorderYNm));
  config.world.shippingLaneEastXNm = Math.max(0.8, Math.min(config.world.westBorderXNm - 0.3, config.world.shippingLaneEastXNm));
  config.world.shippingLaneWestXNm = Math.max(0.2, Math.min(config.world.shippingLaneEastXNm - 0.6, config.world.shippingLaneWestXNm));
  config.contacts.fishingBoatCount = Math.max(1, Math.round(config.contacts.fishingBoatCount));
  config.contacts.cargoShipCount = Math.max(0, Math.round(config.contacts.cargoShipCount));
  config.dvora.friendlyBoatCount = Math.max(3, Math.round(config.dvora.friendlyBoatCount));
  config.dvora.cruiseSpeedKnots = Math.min(config.dvora.cruiseSpeedKnots, config.dvora.maxSpeedKnots);
  config.dvora.engagementRangeNm = Math.max(0.2, config.dvora.engagementRangeNm);
  config.classification.suspiciousEscalationThreshold = Math.max(
    0,
    Math.round(config.classification.suspiciousEscalationThreshold),
  );
  config.spawnBehavior.attackModeChancePerMinute = Math.max(
    0,
    Math.min(1, config.spawnBehavior.attackModeChancePerMinute),
  );
  config.spawnBehavior.fishingSpeedMinKnots = Math.max(0.5, config.spawnBehavior.fishingSpeedMinKnots);
  config.spawnBehavior.fishingSpeedMaxKnots = Math.max(
    config.spawnBehavior.fishingSpeedMinKnots,
    config.spawnBehavior.fishingSpeedMaxKnots,
  );
  config.spawnBehavior.hostileSpeedMinKnots = Math.max(1, config.spawnBehavior.hostileSpeedMinKnots);
  config.spawnBehavior.hostileSpeedMaxKnots = Math.max(
    config.spawnBehavior.hostileSpeedMinKnots,
    config.spawnBehavior.hostileSpeedMaxKnots,
  );

  return config;
}

export class SetupScreen {
  constructor({
    initialConfig = cloneScenarioConfig(defaultScenario),
    onRun,
    onBack = null,
    title = 'Shore Protection',
    subtitle = 'Configure the existing coastal simulation and launch the current scenario.',
  }) {
    this.initialConfig = cloneScenarioConfig(initialConfig);
    this.onRun = onRun;
    this.onBack = onBack;
    this.title = title;
    this.subtitle = subtitle;
    this.root = null;
    this.form = null;
    this.rangeNote = null;
    this.panels = [];
    this.handleSubmit = this.handleSubmit.bind(this);
    this.handleAnyInput = this.handleAnyInput.bind(this);
  }

  mount(parent) {
    this.root = document.createElement('div');
    this.root.className = 'screen setup-screen';
    this.root.innerHTML = `
      <form class="setup-form">
        <div class="setup-screen-head">
          <div>
            <p class="scenario-kicker">Scenario Setup</p>
            <h1 class="setup-screen-title">${this.title}</h1>
            <p class="setup-screen-subtitle">${this.subtitle}</p>
          </div>
          ${this.onBack ? `<button type="button" class="ghost-button" data-action="back">${renderIcon('back')} <span>Back to Scenario Selection</span></button>` : ''}
        </div>
        <div class="setup-toolbar">
          <p class="setup-note">Engagement Radius: <strong id="setup-range-note">-</strong></p>
        </div>
        <div class="setup-panels"></div>
        <div class="setup-actions">
          <button type="submit" class="run-button">${renderIcon('run')} <span>Run Simulation</span></button>
        </div>
      </form>
    `;

    this.form = this.root.querySelector('form');
    this.rangeNote = this.root.querySelector('#setup-range-note');
    const panelsHost = this.root.querySelector('.setup-panels');

    this.root.querySelector('[data-action="back"]')?.addEventListener('click', () => {
      this.onBack?.();
    });

    for (const group of FIELD_GROUPS) {
      const panel = new SetupPanel({
        title: group.title,
        description: group.description,
        fields: group.fields,
        renderField: (field) => this.renderField(field),
      });

      panel.mount(panelsHost);
      this.panels.push(panel);
    }

    this.form.addEventListener('submit', this.handleSubmit);
    this.form.addEventListener('input', this.handleAnyInput);

    this.populateForm(this.initialConfig);
    this.updateDerivedNotes();
    parent.replaceChildren(this.root);
  }

  renderField(field) {
    if (field.type === 'checkbox') {
      return `
        <label class="field-row field-row-check">
          <span>${field.label}</span>
          <input type="checkbox" name="${field.path}" />
        </label>
      `;
    }

    return `
      <label class="field-row">
        <span>${field.label}${field.unit ? ` <em>${field.unit}</em>` : ''}</span>
        <input type="${field.type}" name="${field.path}" step="${field.step ?? 'any'}" />
      </label>
    `;
  }

  populateForm(config) {
    for (const group of FIELD_GROUPS) {
      for (const field of group.fields) {
        const input = this.form.elements.namedItem(field.path);
        const value = getValueByPath(config, field.path);

        if (!input) {
          continue;
        }

        if (field.type === 'checkbox') {
          input.checked = Boolean(value);
        } else {
          input.value = value;
        }
      }
    }
  }

  collectValues() {
    const nextConfig = cloneScenarioConfig(defaultScenario);

    for (const group of FIELD_GROUPS) {
      for (const field of group.fields) {
        const input = this.form.elements.namedItem(field.path);

        if (!input) {
          continue;
        }

        if (field.type === 'checkbox') {
          setValueByPath(nextConfig, field.path, input.checked);
        } else if (field.type === 'text') {
          setValueByPath(nextConfig, field.path, input.value.trim());
        } else {
          setValueByPath(nextConfig, field.path, Number(input.value));
        }
      }
    }

    return normalizeConfig(nextConfig);
  }

  updateDerivedNotes() {
    const config = this.collectValues();
    this.rangeNote.textContent = `${formatFixed(getEngagementRangeNm(config), 2)} nm`;
  }

  handleAnyInput() {
    this.updateDerivedNotes();
  }

  handleSubmit(event) {
    event.preventDefault();
    this.onRun(this.collectValues());
  }

  destroy() {
    this.form?.removeEventListener('submit', this.handleSubmit);
    this.form?.removeEventListener('input', this.handleAnyInput);
    this.panels.forEach((panel) => panel.destroy());
    this.panels = [];
    this.root?.remove();
    this.root = null;
    this.form = null;
    this.rangeNote = null;
  }
}
