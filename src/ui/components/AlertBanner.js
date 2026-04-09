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
