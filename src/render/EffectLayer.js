import { Container, Graphics, Texture } from 'pixi.js';
import { Emitter } from 'pixi-particles';

function createExplosionConfig(x, y) {
  return {
    alpha: {
      list: [
        { value: 0.9, time: 0 },
        { value: 0, time: 1 },
      ],
      isStepped: false,
    },
    scale: {
      list: [
        { value: 0.35, time: 0 },
        { value: 1.1, time: 1 },
      ],
      isStepped: false,
    },
    color: {
      list: [
        { value: 'fff6c6', time: 0 },
        { value: 'ff9b54', time: 0.35 },
        { value: '6b2f1d', time: 1 },
      ],
      isStepped: false,
    },
    speed: {
      list: [
        { value: 150, time: 0 },
        { value: 35, time: 1 },
      ],
      isStepped: false,
    },
    startRotation: { min: 0, max: 360 },
    rotationSpeed: { min: 0, max: 90 },
    lifetime: { min: 0.35, max: 0.7 },
    frequency: 0.004,
    emitterLifetime: 0.14,
    maxParticles: 80,
    pos: { x, y },
    addAtBack: false,
    spawnType: 'circle',
    spawnCircle: {
      x: 0,
      y: 0,
      r: 12,
    },
  };
}

function createSplashConfig(x, y) {
  return {
    alpha: {
      list: [
        { value: 0.82, time: 0 },
        { value: 0, time: 1 },
      ],
      isStepped: false,
    },
    scale: {
      list: [
        { value: 0.16, time: 0 },
        { value: 0.7, time: 1 },
      ],
      isStepped: false,
    },
    color: {
      list: [
        { value: 'f6ffff', time: 0 },
        { value: '84d4e8', time: 0.5 },
        { value: '2b6a7f', time: 1 },
      ],
      isStepped: false,
    },
    speed: {
      list: [
        { value: 110, time: 0 },
        { value: 18, time: 1 },
      ],
      isStepped: false,
    },
    startRotation: { min: 240, max: 300 },
    rotationSpeed: { min: 0, max: 0 },
    lifetime: { min: 0.3, max: 0.55 },
    frequency: 0.003,
    emitterLifetime: 0.08,
    maxParticles: 50,
    pos: { x, y },
    addAtBack: false,
    spawnType: 'burst',
    particlesPerWave: 18,
    particleSpacing: 0,
    angleStart: 0,
  };
}

function createFlashConfig(x, y) {
  return {
    alpha: {
      list: [
        { value: 0.95, time: 0 },
        { value: 0, time: 1 },
      ],
      isStepped: false,
    },
    scale: {
      list: [
        { value: 0.2, time: 0 },
        { value: 0.5, time: 1 },
      ],
      isStepped: false,
    },
    color: {
      list: [
        { value: 'fff3b5', time: 0 },
        { value: 'ff9b54', time: 1 },
      ],
      isStepped: false,
    },
    speed: {
      list: [
        { value: 45, time: 0 },
        { value: 5, time: 1 },
      ],
      isStepped: false,
    },
    startRotation: { min: 0, max: 360 },
    rotationSpeed: { min: 0, max: 0 },
    lifetime: { min: 0.12, max: 0.2 },
    frequency: 0.002,
    emitterLifetime: 0.05,
    maxParticles: 24,
    pos: { x, y },
    addAtBack: false,
    spawnType: 'circle',
    spawnCircle: {
      x: 0,
      y: 0,
      r: 4,
    },
  };
}

export class EffectLayer {
  constructor() {
    this.container = new Container();
    this.emitters = [];
    this.flashBursts = [];
  }

  spawnEmitter(configFactory, x, y, fallbackColor = 0xffcc7a) {
    try {
      const emitter = new Emitter(this.container, [Texture.WHITE], configFactory(x, y));
      emitter.autoUpdate = false;
      emitter.updateOwnerPos(x, y);

      const wrapper = {
        emitter,
        finished: false,
      };

      emitter.playOnce(() => {
        wrapper.finished = true;
      });

      this.emitters.push(wrapper);
    } catch {
      const flash = new Graphics();
      flash.lineStyle(2, 0xffffff, 0.8);
      flash.beginFill(fallbackColor, 0.9);
      flash.drawCircle(0, 0, 10);
      flash.endFill();
      flash.x = x;
      flash.y = y;
      this.container.addChild(flash);
      this.flashBursts.push({ graphic: flash, age: 0, lifetime: 0.45 });
    }
  }

  spawnExplosion(x, y) {
    this.spawnEmitter(createExplosionConfig, x, y, 0xffcc7a);
  }

  spawnSplash(x, y) {
    this.spawnEmitter(createSplashConfig, x, y, 0x93e6f5);
  }

  spawnMuzzleFlash(x, y) {
    this.spawnEmitter(createFlashConfig, x, y, 0xfff0ae);
  }

  update(dtSec) {
    for (const wrapper of this.emitters) {
      wrapper.emitter.update(dtSec);
    }

    this.emitters = this.emitters.filter((wrapper) => {
      if (!wrapper.finished) {
        return true;
      }

      wrapper.emitter.cleanup();
      wrapper.emitter.destroy();
      return false;
    });

    this.flashBursts = this.flashBursts.filter((flash) => {
      flash.age += dtSec;
      const progress = Math.min(1, flash.age / flash.lifetime);
      flash.graphic.alpha = 1 - progress;
      flash.graphic.scale.set(1 + progress * 1.8);

      if (progress >= 1) {
        flash.graphic.destroy();
        return false;
      }

      return true;
    });
  }

  clear() {
    for (const wrapper of this.emitters) {
      wrapper.emitter.cleanup();
      wrapper.emitter.destroy();
    }

    for (const flash of this.flashBursts) {
      flash.graphic.destroy();
    }

    this.emitters = [];
    this.flashBursts = [];
  }

  destroy() {
    this.clear();
    this.container.destroy({ children: true });
  }
}
