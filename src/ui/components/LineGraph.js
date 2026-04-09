import { formatClock, formatFixed } from '../../sim/utils/units.js';
import { renderIcon } from './Icon.js';

function getMaxSeriesValue(points, series) {
  let maxValue = 0;

  for (const point of points) {
    for (const item of series) {
      const value = point[item.key];

      if (value != null && Number.isFinite(value)) {
        maxValue = Math.max(maxValue, value);
      }
    }
  }

  return maxValue || 1;
}

export class LineGraph {
  constructor({
    title,
    series,
    yLabelFormatter = (value) => formatFixed(value, 0),
    emptyMessage = 'Waiting for telemetry...',
    embedded = false,
  }) {
    this.title = title;
    this.series = series;
    this.yLabelFormatter = yLabelFormatter;
    this.emptyMessage = emptyMessage;
    this.embedded = embedded;
    this.root = null;
    this.canvas = null;
    this.ctx = null;
    this.points = [];
    this.resizeObserver = null;
  }

  mount(parent) {
    this.root = document.createElement('section');
    this.root.className = this.embedded ? 'graph-card graph-card-embedded' : 'panel-card graph-card';
    this.root.innerHTML = `
      <div class="panel-head">
        <h3>${renderIcon('graph')} ${this.title}</h3>
        <div class="graph-legend">
          ${this.series.map((item) => `
            <span class="graph-legend-item">
              <i style="background:${item.color}"></i>${item.label}
            </span>
          `).join('')}
        </div>
      </div>
      <canvas class="graph-canvas"></canvas>
    `;

    this.canvas = this.root.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
    parent.appendChild(this.root);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.canvas);
    this.resize();
  }

  resize() {
    if (!this.canvas || !this.ctx) {
      return;
    }

    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.render();
  }

  update(points) {
    this.points = points;
    this.render();
  }

  render() {
    if (!this.ctx || !this.canvas) {
      return;
    }

    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    const ctx = this.ctx;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(4, 12, 24, 0.92)';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = 'rgba(141, 194, 222, 0.12)';
    ctx.strokeRect(0.5, 0.5, width - 1, height - 1);

    if (!this.points || this.points.length < 2) {
      ctx.fillStyle = '#9fb8c9';
      ctx.font = '12px Trebuchet MS';
      ctx.textAlign = 'center';
      ctx.fillText(this.emptyMessage, width / 2, height / 2);
      return;
    }

    const padding = { top: 16, right: 16, bottom: 26, left: 40 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    const startTime = this.points[0].timeSec;
    const endTime = this.points[this.points.length - 1].timeSec;
    const timeRange = Math.max(1, endTime - startTime);
    const yMax = getMaxSeriesValue(this.points, this.series);

    ctx.strokeStyle = 'rgba(117, 170, 214, 0.15)';
    ctx.lineWidth = 1;

    for (let index = 0; index <= 4; index += 1) {
      const y = padding.top + (chartHeight / 4) * index;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();

      const labelValue = yMax - (yMax / 4) * index;
      ctx.fillStyle = '#85a4b8';
      ctx.font = '11px Trebuchet MS';
      ctx.textAlign = 'right';
      ctx.fillText(this.yLabelFormatter(labelValue), padding.left - 6, y + 4);
    }

    for (const seriesItem of this.series) {
      const points = [];

      for (const point of this.points) {
        const value = point[seriesItem.key];

        if (value == null || !Number.isFinite(value)) {
          continue;
        }

        points.push({
          x: padding.left + ((point.timeSec - startTime) / timeRange) * chartWidth,
          y: padding.top + chartHeight - (value / yMax) * chartHeight,
        });
      }

      if (points.length === 0) {
        continue;
      }

      const gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartHeight);
      gradient.addColorStop(0, `${seriesItem.color}55`);
      gradient.addColorStop(1, `${seriesItem.color}00`);

      ctx.beginPath();
      ctx.moveTo(points[0].x, padding.top + chartHeight);
      for (const point of points) {
        ctx.lineTo(point.x, point.y);
      }
      ctx.lineTo(points[points.length - 1].x, padding.top + chartHeight);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();

      ctx.beginPath();
      ctx.strokeStyle = seriesItem.color;
      ctx.lineWidth = 2.4;
      ctx.moveTo(points[0].x, points[0].y);
      for (const point of points.slice(1)) {
        ctx.lineTo(point.x, point.y);
      }
      ctx.stroke();
    }

    ctx.fillStyle = '#9fb8c9';
    ctx.font = '11px Trebuchet MS';
    ctx.textAlign = 'left';
    ctx.fillText(formatClock(startTime), padding.left, height - 8);
    ctx.textAlign = 'center';
    ctx.fillText(formatClock((startTime + endTime) / 2), width / 2, height - 8);
    ctx.textAlign = 'right';
    ctx.fillText(formatClock(endTime), width - padding.right, height - 8);
  }

  destroy() {
    this.resizeObserver?.disconnect();
    this.root?.remove();
    this.root = null;
    this.canvas = null;
    this.ctx = null;
  }
}
