import { renderIcon } from '../components/Icon.js';
import { formatFixed } from '../../sim/utils/units.js';
import { withBasePath } from '../../utils/assets.js';

export class ScenarioBriefScreen {
  constructor({ config, onRun, onBack }) {
    this.config = config;
    this.onRun = onRun;
    this.onBack = onBack;
    this.root = null;
  }

  mount(parent) {
    const mission = this.config.simulation;
    const force = this.config.ownForces;
    const sensors = this.config.sensors.vesselClasses.small;

    this.root = document.createElement('div');
    this.root.className = 'screen scenario-brief-screen';
    this.root.innerHTML = `
      <section class="panel-card scenario-brief-shell">
        <div class="scenario-selection-brand scenario-brief-brand">
          <img src="${withBasePath('logo.png')}" alt="Skana Robotics" class="scenario-logo" />
          <div>
            <p class="scenario-kicker">Offshore Rig Protection</p>
            <h1>${this.config.meta.title}</h1>
            <p class="scenario-summary">${this.config.meta.subtitle}</p>
          </div>
        </div>

        <div class="scenario-brief-grid">
          <article class="panel-card scenario-brief-card">
            <div class="panel-head">
              <h3>${renderIcon('rig')} Mission</h3>
              <p>Routine security period with a protected offshore rig 32 nautical miles from shore.</p>
            </div>
            <div class="hud-panel-content">
              <div class="info-list">
                <div><span>Mission Duration</span><strong>${mission.missionDurationHours} h</strong></div>
                <div><span>Success Condition</span><strong>No protected-area penetration</strong></div>
                <div><span>Static Guard Ring</span><strong>${this.config.world.safetyRadiusYards} yd</strong></div>
                <div><span>Dynamic Patrol Ring</span><strong>${this.config.world.dynamicPatrolRadiusYards} yd</strong></div>
                <div><span>Reserve Launch</span><strong>${mission.reserveAvailableAfterMinutes} min</strong></div>
                <div><span>Threat Type</span><strong>1-2 fast surface boats</strong></div>
              </div>
            </div>
          </article>

          <article class="panel-card scenario-brief-card">
            <div class="panel-head">
              <h3>${renderIcon('friendly')} BS Platform</h3>
              <p>Skana USV profile used by BS 401, BS 402, and BS 403.</p>
            </div>
            <div class="hud-panel-content">
              <div class="info-list">
                <div><span>Length</span><strong>${force.lengthMeters} m</strong></div>
                <div><span>Width</span><strong>${force.widthMeters} m</strong></div>
                <div><span>Max Speed</span><strong>${force.maxSpeedKnots} kt</strong></div>
                <div><span>Cruise Speed</span><strong>${force.cruiseSpeedKnots} kt</strong></div>
                <div><span>Fuel</span><strong>${force.fuelLiters} L</strong></div>
                <div><span>Fuel Burn @ Cruise</span><strong>${force.fuelBurnLitersPerHourAtCruise} L/h</strong></div>
              </div>
            </div>
          </article>

          <article class="panel-card scenario-brief-card">
            <div class="panel-head">
              <h3>${renderIcon('contact')} Sensors & Weapon</h3>
              <p>Using the small-vessel profile from the supplied mission values.</p>
            </div>
            <div class="hud-panel-content">
              <div class="info-list">
                <div><span>Radar Detection</span><strong>${sensors.radarDetectionYards} yd</strong></div>
                <div><span>Day Detection</span><strong>${sensors.dayCamera.detectionYards} yd</strong></div>
                <div><span>Day Identification</span><strong>${sensors.dayCamera.identificationYards} yd</strong></div>
                <div><span>Night Identification</span><strong>${sensors.nightCamera.identificationYards} yd</strong></div>
                <div><span>MAG Range</span><strong>${force.weapon.rangeYards} yd</strong></div>
                <div><span>Hit Probability</span><strong>${formatFixed(force.weapon.hitProbability * 100, 0)}%</strong></div>
              </div>
            </div>
          </article>
        </div>

        <div class="setup-actions scenario-brief-actions">
          <button type="button" class="ghost-button" data-action="back">${renderIcon('back')} <span>Back to Scenario Selection</span></button>
          <button type="button" class="run-button" data-action="run">${renderIcon('run')} <span>Launch Offshore Mission</span></button>
        </div>
      </section>
    `;

    this.root.querySelector('[data-action="back"]').addEventListener('click', () => this.onBack?.());
    this.root.querySelector('[data-action="run"]').addEventListener('click', () => this.onRun?.(this.config));
    parent.replaceChildren(this.root);
  }

  destroy() {
    this.root?.remove();
    this.root = null;
  }
}
