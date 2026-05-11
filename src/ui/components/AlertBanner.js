import { renderIcon } from './Icon.js';

const ALERT_DEFINITIONS = {
  'vessel-suspicious': {
    severity: 'warning',
    title: 'Suspicious Contact',
    icon: 'suspicious',
  },
  'vessel-enemy': {
    severity: 'danger',
    title: 'Enemy Declared',
    icon: 'enemy',
  },
  'vessel-target': {
    severity: 'danger',
    title: 'Priority Target',
    icon: 'interceptor',
  },
  'interceptor-assigned': {
    severity: 'info',
    title: 'Interceptor Assigned',
    icon: 'interceptor',
  },
  'interceptor-reassigned': {
    severity: 'info',
    title: 'Interceptor Reassigned',
    icon: 'interceptor',
  },
  'interception-success': {
    severity: 'success',
    title: 'Interception Success',
    icon: 'success',
  },
  'simulation-paused': {
    severity: 'muted',
    title: 'Simulation Paused',
    icon: 'pause',
  },
  'simulation-resumed': {
    severity: 'info',
    title: 'Simulation Resumed',
    icon: 'play',
  },
  'threat-detected': {
    severity: 'warning',
    title: 'Threat Detected',
    icon: 'suspicious',
  },
  'hostile-identified': {
    severity: 'danger',
    title: 'Hostile Identified',
    icon: 'enemy',
  },
  'reserve-launch-available': {
    severity: 'info',
    title: 'Reserve Ready',
    icon: 'friendly',
  },
  'reserve-launched': {
    severity: 'success',
    title: 'Reserve Launched',
    icon: 'interceptor',
  },
  'sea-state-warning': {
    severity: 'warning',
    title: 'Sea State Warning',
    icon: 'warning',
  },
  'protected-area-penetrated': {
    severity: 'danger',
    title: 'Protected Area Breached',
    icon: 'enemy',
  },
  'collision-event': {
    severity: 'danger',
    title: 'Collision Event',
    icon: 'warning',
  },
  'mission-success': {
    severity: 'success',
    title: 'Mission Success',
    icon: 'success',
  },
  'mission-failure': {
    severity: 'danger',
    title: 'Mission Failure',
    icon: 'enemy',
  },
  target_detected: {
    severity: 'warning',
    title: 'Target Detected',
    icon: 'suspicious',
  },
  radio_challenge_started: {
    severity: 'info',
    title: 'Radio Challenge',
    icon: 'contact',
  },
  target_cleared_non_threat: {
    severity: 'success',
    title: 'Target Cleared',
    icon: 'success',
  },
  returned_to_patrol: {
    severity: 'info',
    title: 'Returned To Patrol',
    icon: 'friendly',
  },
  intercept_started: {
    severity: 'info',
    title: 'Intercept Started',
    icon: 'interceptor',
  },
  zigzag_started: {
    severity: 'warning',
    title: 'Zigzag Approach',
    icon: 'suspicious',
  },
  warning_flare_fired: {
    severity: 'warning',
    title: 'Warning Flare',
    icon: 'warning',
  },
  operator_approval_requested: {
    severity: 'warning',
    title: 'Approval Requested',
    icon: 'warning',
  },
  operator_approval_granted: {
    severity: 'success',
    title: 'Approval Granted',
    icon: 'success',
  },
  operator_approval_denied: {
    severity: 'warning',
    title: 'Approval Denied',
    icon: 'warning',
  },
  mag_fire_blocked_unsafe_rig_line: {
    severity: 'danger',
    title: 'MAG Fire Blocked',
    icon: 'enemy',
  },
  mag_fired: {
    severity: 'danger',
    title: 'MAG Fired',
    icon: 'enemy',
  },
  target_neutralized: {
    severity: 'success',
    title: 'Target Neutralized',
    icon: 'success',
  },
  mag_failed: {
    severity: 'danger',
    title: 'MAG Failed',
    icon: 'warning',
  },
  ram_pursuit_started: {
    severity: 'danger',
    title: 'Ram Pursuit',
    icon: 'interceptor',
  },
  collision_occurred: {
    severity: 'danger',
    title: 'Collision',
    icon: 'warning',
  },
  mission_failed_protected_area_penetrated: {
    severity: 'danger',
    title: 'Protected Area Breached',
    icon: 'enemy',
  },
};

export class AlertBanner {
  constructor(eventBus) {
    this.eventBus = eventBus;
    this.root = null;
    this.itemsNode = null;
    this.activeAlerts = [];
    this.timeouts = new Map();
    this.unsubscribers = [];
  }

  mount(parent) {
    this.root = document.createElement('div');
    this.root.className = 'alert-banner';
    this.root.innerHTML = '<div class="alert-banner-items"></div>';
    this.itemsNode = this.root.querySelector('.alert-banner-items');
    parent.appendChild(this.root);

    for (const type of Object.keys(ALERT_DEFINITIONS)) {
      this.unsubscribers.push(this.eventBus.on(type, (payload) => {
        const definition = ALERT_DEFINITIONS[type];
        this.pushAlert({
          id: `${type}-${payload.id ?? performance.now()}`,
          title: definition.title,
          severity: definition.severity,
          icon: definition.icon,
          message: payload.description ?? type,
        });
      }));
    }
  }

  pushAlert(alert) {
    this.activeAlerts.unshift(alert);
    this.activeAlerts = this.activeAlerts.slice(0, 4);
    this.render();

    const timeoutId = window.setTimeout(() => {
      this.dismiss(alert.id);
    }, alert.severity === 'danger' ? 5200 : 3600);

    this.timeouts.set(alert.id, timeoutId);
  }

  dismiss(id) {
    this.activeAlerts = this.activeAlerts.filter((alert) => alert.id !== id);
    const timeoutId = this.timeouts.get(id);

    if (timeoutId) {
      window.clearTimeout(timeoutId);
      this.timeouts.delete(id);
    }

    this.render();
  }

  render() {
    if (!this.itemsNode) {
      return;
    }

    this.itemsNode.innerHTML = this.activeAlerts.map((alert) => `
      <article class="alert-chip is-${alert.severity}">
        <span class="alert-chip-label">${renderIcon(alert.icon)}${alert.title}</span>
        <strong>${alert.message}</strong>
      </article>
    `).join('');
  }

  destroy() {
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers = [];

    for (const timeoutId of this.timeouts.values()) {
      window.clearTimeout(timeoutId);
    }

    this.timeouts.clear();
    this.root?.remove();
    this.root = null;
    this.itemsNode = null;
    this.activeAlerts = [];
  }
}
