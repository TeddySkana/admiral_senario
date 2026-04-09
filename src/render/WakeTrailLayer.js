import { Container, Graphics } from 'pixi.js';
import { distanceBetween, headingToVector } from '../sim/utils/math.js';

const MAX_TRAIL_AGE = 4.8;
const RIPPLE_LIFETIME_SEC = 0.9;

export class WakeTrailLayer {
  constructor() {
    this.container = new Container();
    this.graphics = new Graphics();
    this.container.addChild(this.graphics);
    this.histories = new Map();
    this.turnRipples = [];
  }

  update(entities, dtSec) {
    const activeIds = new Set(entities.map((entity) => entity.id));

    for (const entity of entities) {
      const history = this.histories.get(entity.id) ?? [];
      const samplePoint = {
        x: entity.renderX,
        y: entity.renderY,
        headingDeg: entity.renderHeadingDeg,
        courseDeg: entity.renderCourseDeg,
        speedKnots: entity.speedKnots,
        age: 0,
      };
      const lastPoint = history[history.length - 1];

      if (!lastPoint || distanceBetween(lastPoint, samplePoint) > 0.05) {
        history.push(samplePoint);
      }

      history.forEach((point) => {
        point.age += dtSec;
      });

      this.histories.set(entity.id, history.filter((point) => point.age <= MAX_TRAIL_AGE));

      const turnMagnitude = Math.abs((entity.renderHeadingDeg ?? 0) - (entity.renderCourseDeg ?? entity.renderHeadingDeg ?? 0));
      const normalizedTurn = Math.min(180, Math.min(turnMagnitude, 360 - turnMagnitude));

      if (entity.speedKnots > 8 && normalizedTurn > 6) {
        const lastRipple = this.turnRipples[this.turnRipples.length - 1];

        if (!lastRipple || lastRipple.entityId !== entity.id || lastRipple.age > 0.22) {
          const sternVector = headingToVector(entity.renderHeadingDeg);
          this.turnRipples.push({
            entityId: entity.id,
            x: entity.renderX - (sternVector.x * 0.1),
            y: entity.renderY - (sternVector.y * 0.1),
            age: 0,
          });
        }
      }
    }

    for (const entityId of this.histories.keys()) {
      if (!activeIds.has(entityId)) {
        this.histories.delete(entityId);
      }
    }

    this.turnRipples = this.turnRipples.filter((ripple) => ripple.age <= RIPPLE_LIFETIME_SEC);
    this.turnRipples.forEach((ripple) => {
      ripple.age += dtSec;
    });
  }

  draw(worldToScreen) {
    this.graphics.clear();

    for (const trail of this.histories.values()) {
      for (let index = 1; index < trail.length; index += 1) {
        const previous = trail[index - 1];
        const current = trail[index];
        const a = worldToScreen(previous);
        const b = worldToScreen(current);
        const progress = current.age / MAX_TRAIL_AGE;
        const alpha = Math.max(0, 0.26 - (progress * 0.2));
        const width = Math.max(0.5, 2.2 - (progress * 1.4));
        const wakeSpread = 1.8 - (progress * 1.2);
        const direction = headingToVector(current.courseDeg ?? current.headingDeg);
        const normal = { x: direction.y, y: -direction.x };

        this.graphics.lineStyle(width + 2, 0xd6f5ff, alpha * 0.18);
        this.graphics.moveTo(a.x, a.y);
        this.graphics.lineTo(b.x, b.y);

        this.graphics.lineStyle(width, 0xdaf4ff, alpha);
        this.graphics.moveTo(a.x + (normal.x * wakeSpread), a.y + (normal.y * wakeSpread));
        this.graphics.lineTo(b.x + (normal.x * wakeSpread), b.y + (normal.y * wakeSpread));
        this.graphics.moveTo(a.x - (normal.x * wakeSpread), a.y - (normal.y * wakeSpread));
        this.graphics.lineTo(b.x - (normal.x * wakeSpread), b.y - (normal.y * wakeSpread));
      }
    }

    for (const ripple of this.turnRipples) {
      const point = worldToScreen(ripple);
      const progress = ripple.age / RIPPLE_LIFETIME_SEC;
      const radius = 5 + (progress * 12);
      const alpha = (1 - progress) * 0.22;
      this.graphics.lineStyle(1.4, 0xdaf4ff, alpha);
      this.graphics.drawCircle(point.x, point.y, radius);
    }
  }

  clear() {
    this.histories.clear();
    this.turnRipples = [];
    this.graphics.clear();
  }

  destroy() {
    this.clear();
    this.container.destroy({ children: true });
  }
}
