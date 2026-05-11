import { renderIcon } from './Icon.js';

function drawMarker(ctx, x, y, radius, fill, stroke) {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = stroke;
  ctx.stroke();
}

function readThemeColor(name, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export class Minimap {
  constructor(geometry, options = {}) {
    this.geometry = geometry;
    this.options = {
      embedded: false,
      hideHeader: false,
      ...options,
    };
    this.root = null;
    this.canvas = null;
    this.ctx = null;
  }

  mount(parent) {
    this.root = document.createElement('section');
    this.root.className = this.options.embedded
      ? 'minimap-panel minimap-panel-embedded'
      : 'panel-card minimap-card';
    this.root.innerHTML = `
      ${this.options.hideHeader
    ? ''
    : `<div class="panel-head">
        <div>
          <h3>${renderIcon('minimap')} Minimap</h3>
          <p>Operational overview and selected track.</p>
        </div>
      </div>`}
      <canvas class="minimap-canvas" width="${this.geometry.scenarioType === 'offshore' ? 220 : 280}" height="${this.geometry.scenarioType === 'offshore' ? 220 : 200}"></canvas>
    `;

    this.canvas = this.root.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
    parent.appendChild(this.root);
  }

  toCanvas(point) {
    return {
      x: (point.x / this.geometry.widthNm) * this.canvas.width,
      y: (point.y / this.geometry.heightNm) * this.canvas.height,
    };
  }

  update(state, selectedEntityId) {
    if (!this.ctx || !this.canvas) {
      return;
    }

    const ctx = this.ctx;
    const accent = readThemeColor('--color-accent', '#00b6d7');
    const accentSoft = readThemeColor('--color-accent-soft', '#7dd7e8');
    const warning = readThemeColor('--color-warning', '#f5b950');
    const danger = readThemeColor('--color-danger', '#ff6776');
    const success = readThemeColor('--color-success', '#43d38d');

    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    ctx.fillStyle = '#04111e';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    if (this.geometry.scenarioType === 'offshore') {
      this.drawOffshoreMap(ctx, state, selectedEntityId, {
        accent,
        accentSoft,
        warning,
        danger,
        success,
      });
      return;
    }

    const coastX = this.toCanvas({ x: this.geometry.coastlineXNm, y: 0 }).x;
    const westBorder = this.toCanvas({ x: this.geometry.westBorderXNm, y: 0 }).x;
    const northBorder = this.toCanvas({ x: 0, y: this.geometry.northBorderYNm }).y;
    const southBorder = this.toCanvas({ x: 0, y: this.geometry.southBorderYNm }).y;

    ctx.fillStyle = 'rgba(70, 108, 127, 0.24)';
    const laneWest = this.toCanvas({ x: this.geometry.shippingLane.westXNm, y: 0 }).x;
    const laneEast = this.toCanvas({ x: this.geometry.shippingLane.eastXNm, y: 0 }).x;
    ctx.fillRect(laneWest, 0, laneEast - laneWest, this.canvas.height);

    ctx.fillStyle = 'rgba(199, 176, 132, 0.9)';
    ctx.fillRect(coastX, 0, this.canvas.width - coastX, this.canvas.height);

    ctx.strokeStyle = danger;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(westBorder, northBorder);
    ctx.lineTo(this.canvas.width, northBorder);
    ctx.moveTo(westBorder, southBorder);
    ctx.lineTo(this.canvas.width, southBorder);
    ctx.moveTo(westBorder, northBorder);
    ctx.lineTo(westBorder, southBorder);
    ctx.stroke();

    ctx.beginPath();
    const fishingPolygon = this.geometry.fishingPolygon.map((point) => this.toCanvas(point));
    ctx.moveTo(fishingPolygon[0].x, fishingPolygon[0].y);
    fishingPolygon.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
    ctx.closePath();
    ctx.fillStyle = 'rgba(67, 211, 141, 0.14)';
    ctx.fill();
    ctx.strokeStyle = success;
    ctx.stroke();

    for (const line of Object.values(this.geometry.patrolLines)) {
      const start = this.toCanvas(line.start);
      const end = this.toCanvas(line.end);
      ctx.setLineDash([6, 5]);
      ctx.strokeStyle = accentSoft;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
    }

    ctx.setLineDash([]);

    for (const unit of state.friendlyUnits) {
      const point = this.toCanvas(unit);
      drawMarker(ctx, point.x, point.y, unit.id === selectedEntityId ? 5 : 4, success, '#05222d');

      if (unit.assignedTargetId) {
        const target = state.contacts.find((contact) => contact.id === unit.assignedTargetId);

        if (target) {
          const targetPoint = this.toCanvas(target);
          ctx.strokeStyle = 'rgba(67, 211, 141, 0.5)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(point.x, point.y);
          ctx.lineTo(targetPoint.x, targetPoint.y);
          ctx.stroke();
        }
      }
    }

    for (const contact of state.contacts) {
      const point = this.toCanvas(contact);
      const fill = contact.classification === 'enemy'
        ? danger
        : contact.classification === 'target'
          ? '#ff9f5b'
        : contact.classification === 'suspicious'
          ? warning
          : contact.type === 'cargo'
            ? '#bdd1df'
            : accent;

      drawMarker(ctx, point.x, point.y, contact.id === selectedEntityId ? 4.5 : 3.5, fill, '#03121d');
    }
  }

  drawOffshoreMap(ctx, state, selectedEntityId, colors) {
    const rigPoint = this.toCanvas(this.geometry.rig);

    for (const ring of this.geometry.patrolRings ?? []) {
      const radiusX = (ring.radiusNm / this.geometry.widthNm) * this.canvas.width;
      const radiusY = (ring.radiusNm / this.geometry.heightNm) * this.canvas.height;
      ctx.beginPath();
      ctx.ellipse(rigPoint.x, rigPoint.y, radiusX, radiusY, 0, 0, Math.PI * 2);
      ctx.strokeStyle = ring.key === 'security' ? colors.success : '#ffffff';
      ctx.lineWidth = ring.key === 'security' ? 1.8 : 1.7;
      ctx.setLineDash(ring.key === 'security' ? [] : [6, 5]);
      ctx.stroke();
    }

    ctx.setLineDash([]);
    ctx.fillStyle = '#d6f6ff';
    ctx.beginPath();
    ctx.moveTo(rigPoint.x, rigPoint.y - 7);
    ctx.lineTo(rigPoint.x + 7, rigPoint.y);
    ctx.lineTo(rigPoint.x + 3, rigPoint.y + 8);
    ctx.lineTo(rigPoint.x - 3, rigPoint.y + 8);
    ctx.lineTo(rigPoint.x - 7, rigPoint.y);
    ctx.closePath();
    ctx.fill();

    for (const unit of state.friendlyUnits) {
      const point = this.toCanvas(unit);
      drawMarker(ctx, point.x, point.y, unit.id === selectedEntityId ? 5 : 4, colors.success, '#05222d');

      if (unit.assignedTargetId) {
        const target = state.contacts.find((contact) => contact.id === unit.assignedTargetId && contact.alive);

        if (target) {
          const targetPoint = this.toCanvas(target);
          ctx.strokeStyle = 'rgba(67, 211, 141, 0.5)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(point.x, point.y);
          ctx.lineTo(targetPoint.x, targetPoint.y);
          ctx.stroke();
        }
      }
    }

    for (const contact of state.contacts) {
      const point = this.toCanvas(contact);
      const fill = !contact.alive
        ? '#7d8f97'
        : contact.classification === 'enemy'
          ? colors.danger
          : contact.classification === 'suspicious'
            ? colors.warning
            : colors.accent;

      drawMarker(ctx, point.x, point.y, contact.id === selectedEntityId ? 4.5 : 3.5, fill, '#03121d');
    }
  }

  destroy() {
    this.root?.remove();
    this.root = null;
    this.canvas = null;
    this.ctx = null;
  }
}
