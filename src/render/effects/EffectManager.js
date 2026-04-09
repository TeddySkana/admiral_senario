import { Container, Graphics, Texture } from 'pixi.js';
import { Emitter } from 'pixi-particles';
import { lerp } from '../../sim/utils/math.js';
import {
  createExplosionConfig,
  createFlashConfig,
  createSmokeConfig,
  createSplashConfig,
} from './effectPresets.js';

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

export class EffectManager {
  constructor(eventBus) {
    this.eventBus = eventBus;
    this.container = new Container();
    this.overlayGraphics = new Graphics();
    this.particleContainer = new Container();
    this.container.addChild(this.overlayGraphics, this.particleContainer);

    this.burstEmitters = [];
    this.smokeSources = new Map();
    this.pendingBursts = [];
    this.projectiles = [];
    this.rings = [];
    this.pendingEntityMarkers = [];
    this.unsubscribers = [];

    this.bindEvents();
  }

  bindEvents() {
    this.unsubscribers.push(
      this.eventBus.on('weapon-fired', (event) => {
        this.pendingBursts.push({ kind: 'flash', x: event.x, y: event.y });
        this.projectiles.push({
          x: event.x,
          y: event.y,
          targetX: event.targetX,
          targetY: event.targetY,
          durationSec: event.durationSec ?? 0.45,
          age: 0,
        });
      }),
      this.eventBus.on('impact', (event) => {
        this.pendingBursts.push({ kind: 'flash', x: event.x, y: event.y });
        this.pendingBursts.push({ kind: 'splash', x: event.x, y: event.y });
        this.rings.push({ x: event.x, y: event.y, color: 0xdaf4ff, lifetime: 0.55, maxRadius: 28, age: 0 });
      }),
      this.eventBus.on('vessel-neutralized', (event) => {
        this.pendingBursts.push({ kind: 'flash', x: event.x, y: event.y });
        this.pendingBursts.push({ kind: 'explosion', x: event.x, y: event.y });
        this.pendingBursts.push({ kind: 'splash', x: event.x, y: event.y });
        this.rings.push({ x: event.x, y: event.y, color: 0xff9565, lifetime: 0.9, maxRadius: 42, age: 0 });
      }),
      this.eventBus.on('ship-damaged', (event) => {
        const ratio = event.maxHealth ? 1 - (event.health / event.maxHealth) : 0.5;
        this.attachSmokeSource(event.vesselId, Math.max(0.42, ratio + 0.2));
        this.rings.push({ entityId: event.vesselId, color: 0xffb27a, lifetime: 0.6, maxRadius: 18, age: 0 });
      }),
      this.eventBus.on('ship-sunk', (event) => {
        this.attachSmokeSource(event.vesselId, 1);
        this.pendingBursts.push({ kind: 'explosion', x: event.x, y: event.y });
        this.pendingBursts.push({ kind: 'splash', x: event.x, y: event.y });
        this.rings.push({ entityId: event.vesselId, color: 0xff6b6b, lifetime: 0.9, maxRadius: 32, age: 0 });
      }),
      this.eventBus.on('vessel-suspicious', (event) => {
        this.pendingEntityMarkers.push({ entityId: event.vesselId, color: 0xf6c562, lifetime: 1.1, maxRadius: 22, age: 0 });
      }),
      this.eventBus.on('vessel-enemy', (event) => {
        this.pendingEntityMarkers.push({ entityId: event.vesselId, color: 0xff6b6b, lifetime: 1.2, maxRadius: 28, age: 0 });
      }),
      this.eventBus.on('vessel-target', (event) => {
        this.pendingEntityMarkers.push({ entityId: event.vesselId, color: 0xff9f5b, lifetime: 1.2, maxRadius: 26, age: 0 });
      }),
      this.eventBus.on('interceptor-assigned', (event) => {
        this.pendingEntityMarkers.push({ entityId: event.vesselId, color: 0xffd97f, lifetime: 0.9, maxRadius: 26, age: 0 });
        this.pendingEntityMarkers.push({ entityId: event.interceptorId, color: 0x7af2b5, lifetime: 0.9, maxRadius: 20, age: 0 });
      }),
      this.eventBus.on('collision', (event) => {
        this.pendingBursts.push({ kind: 'flash', x: event.x, y: event.y });
        this.pendingBursts.push({ kind: 'explosion', x: event.x, y: event.y });
        this.pendingBursts.push({ kind: 'splash', x: event.x, y: event.y });
      }),
    );
  }

  attachSmokeSource(entityId, intensity) {
    const existing = this.smokeSources.get(entityId);

    if (existing) {
      existing.intensity = Math.max(existing.intensity, intensity);
      existing.missingSec = 0;
      return;
    }

    try {
      const emitter = new Emitter(this.particleContainer, [Texture.WHITE], createSmokeConfig(0, 0, intensity));
      emitter.autoUpdate = false;
      emitter.emit = true;
      this.smokeSources.set(entityId, { emitter, intensity, missingSec: 0 });
    } catch {
      this.smokeSources.set(entityId, { emitter: null, intensity, missingSec: 0, fallbackAge: 0 });
    }
  }

  spawnBurst(kind, screenX, screenY, intensity = 0.75) {
    const configFactory = kind === 'explosion'
      ? (x, y) => createExplosionConfig(x, y)
      : kind === 'splash'
        ? (x, y) => createSplashConfig(x, y)
        : (x, y) => createFlashConfig(x, y);

    try {
      const emitter = new Emitter(this.particleContainer, [Texture.WHITE], configFactory(screenX, screenY, intensity));
      emitter.autoUpdate = false;
      emitter.updateOwnerPos(screenX, screenY);

      const wrapper = { emitter, finished: false };
      emitter.playOnce(() => {
        wrapper.finished = true;
      });
      this.burstEmitters.push(wrapper);
    } catch {
      this.rings.push({
        screenX,
        screenY,
        color: kind === 'splash' ? 0xdaf4ff : kind === 'explosion' ? 0xff9565 : 0xfff5be,
        lifetime: kind === 'flash' ? 0.18 : 0.45,
        maxRadius: kind === 'explosion' ? 20 : 14,
        age: 0,
      });
    }
  }

  resolvePendingBursts(worldToScreen) {
    for (const burst of this.pendingBursts) {
      const point = worldToScreen({ x: burst.x, y: burst.y });
      this.spawnBurst(burst.kind, point.x, point.y, burst.intensity);
    }

    this.pendingBursts = [];
  }

  resolvePendingEntityMarkers(renderEntitiesById) {
    if (this.pendingEntityMarkers.length === 0) {
      return;
    }

    const unresolved = [];

    for (const marker of this.pendingEntityMarkers) {
      if (renderEntitiesById.has(marker.entityId)) {
        this.rings.push(marker);
      } else {
        unresolved.push(marker);
      }
    }

    this.pendingEntityMarkers = unresolved.slice(-24);
  }

  updateBurstEmitters(dtSec) {
    for (const wrapper of this.burstEmitters) {
      try {
        wrapper.emitter.update(dtSec);
      } catch {
        wrapper.finished = true;
      }
    }

    this.burstEmitters = this.burstEmitters.filter((wrapper) => {
      if (!wrapper.finished) {
        return true;
      }

      wrapper.emitter.cleanup();
      wrapper.emitter.destroy();
      return false;
    });
  }

  updateSmokeSources(dtSec, renderEntitiesById) {
    for (const [entityId, source] of this.smokeSources.entries()) {
      const entity = renderEntitiesById.get(entityId);

      if (!entity) {
        source.missingSec += dtSec;

        if (source.missingSec > 2.1) {
          if (source.emitter) {
            source.emitter.emit = false;
            source.emitter.cleanup();
            source.emitter.destroy();
          }

          this.smokeSources.delete(entityId);
        }

        continue;
      }

      source.missingSec = 0;

      if (source.emitter) {
        try {
          source.emitter.updateOwnerPos(entity.renderXScreen, entity.renderYScreen - 8);
          source.emitter.update(dtSec);
        } catch {
          source.emitter.emit = false;
          source.emitter.cleanup();
          source.emitter.destroy();
          source.emitter = null;
        }
      }
    }
  }

  drawProjectiles(worldToScreen, dtSec) {
    const graphics = this.overlayGraphics;

    this.projectiles = this.projectiles.filter((projectile) => {
      projectile.age += dtSec;
      const progress = clamp01(projectile.age / projectile.durationSec);
      const tailProgress = clamp01(progress - 0.18);
      const head = worldToScreen({
        x: lerp(projectile.x, projectile.targetX, progress),
        y: lerp(projectile.y, projectile.targetY, progress),
      });
      const tail = worldToScreen({
        x: lerp(projectile.x, projectile.targetX, tailProgress),
        y: lerp(projectile.y, projectile.targetY, tailProgress),
      });
      const alpha = 1 - (progress * 0.2);

      graphics.lineStyle(5, 0xffb97a, 0.18 * alpha);
      graphics.moveTo(tail.x, tail.y);
      graphics.lineTo(head.x, head.y);
      graphics.lineStyle(2.2, 0xfff4d4, 0.95 * alpha);
      graphics.moveTo(tail.x, tail.y);
      graphics.lineTo(head.x, head.y);
      graphics.beginFill(0xfff4d4, 0.9 * alpha);
      graphics.drawCircle(head.x, head.y, 2.4);
      graphics.endFill();

      return progress < 1;
    });
  }

  drawRings(dtSec, renderEntitiesById, worldToScreen) {
    const graphics = this.overlayGraphics;

    this.rings = this.rings.filter((ring) => {
      ring.age += dtSec;
      const progress = clamp01(ring.age / ring.lifetime);
      let x = ring.screenX;
      let y = ring.screenY;

      if (ring.entityId) {
        const entity = renderEntitiesById.get(ring.entityId);

        if (!entity) {
          return progress < 0.2;
        }

        x = entity.renderXScreen;
        y = entity.renderYScreen;
      } else if (ring.x != null && ring.y != null) {
        const point = worldToScreen({ x: ring.x, y: ring.y });
        x = point.x;
        y = point.y;
      }

      const radius = 10 + ((ring.maxRadius ?? 24) * progress);
      const alpha = (1 - progress) * 0.9;
      graphics.lineStyle(2.2, ring.color, alpha);
      graphics.drawCircle(x, y, radius);

      if (progress < 0.35) {
        graphics.beginFill(ring.color, 0.06 * (1 - progress));
        graphics.drawCircle(x, y, radius * 0.72);
        graphics.endFill();
      }

      return progress < 1;
    });
  }

  update(dtSec, { renderEntitiesById, worldToScreen }) {
    this.overlayGraphics.clear();
    this.resolvePendingBursts(worldToScreen);
    this.resolvePendingEntityMarkers(renderEntitiesById);
    this.updateBurstEmitters(dtSec);
    this.updateSmokeSources(dtSec, renderEntitiesById);
    this.drawProjectiles(worldToScreen, dtSec);
    this.drawRings(dtSec, renderEntitiesById, worldToScreen);
  }

  clear() {
    this.overlayGraphics.clear();

    for (const wrapper of this.burstEmitters) {
      wrapper.emitter.cleanup();
      wrapper.emitter.destroy();
    }

    for (const source of this.smokeSources.values()) {
      if (source.emitter) {
        source.emitter.emit = false;
        source.emitter.cleanup();
        source.emitter.destroy();
      }
    }

    this.burstEmitters = [];
    this.smokeSources.clear();
    this.pendingBursts = [];
    this.projectiles = [];
    this.rings = [];
    this.pendingEntityMarkers = [];
  }

  destroy() {
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers = [];
    this.clear();
    this.container.destroy({ children: true });
  }
}
