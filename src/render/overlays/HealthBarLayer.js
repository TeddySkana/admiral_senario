import { Graphics } from 'pixi.js';

function shouldDrawBar(entity, selectedEntityId) {
  if (entity.id === selectedEntityId) {
    return true;
  }

  if (entity.type === 'friendly') {
    return true;
  }

  if ((entity.health ?? entity.maxHealth ?? 1) < (entity.maxHealth ?? 1)) {
    return true;
  }

  return (
    entity.classification === 'enemy'
    || entity.classification === 'target'
    || entity.classification === 'suspicious'
    || entity.isSinking
  );
}

function getBarColor(entity, ratio) {
  if (entity.type === 'friendly') {
    return ratio < 0.35 ? 0xff9c8a : 0x7af2b5;
  }

  if (entity.classification === 'enemy') {
    return ratio < 0.35 ? 0xff6b6b : 0xffb27a;
  }

  if (entity.classification === 'target') {
    return ratio < 0.35 ? 0xff9458 : 0xffb87a;
  }

  if (entity.classification === 'suspicious') {
    return 0xf6c562;
  }

  return 0x8dd7f7;
}

export class HealthBarLayer {
  constructor() {
    this.graphics = new Graphics();
  }

  update(entities, selectedEntityId) {
    this.graphics.clear();

    for (const entity of entities) {
      if (!shouldDrawBar(entity, selectedEntityId)) {
        continue;
      }

      const maxHealth = Math.max(1, entity.maxHealth ?? 100);
      const ratio = Math.max(0, Math.min(1, (entity.health ?? maxHealth) / maxHealth));
      const width = entity.type === 'cargo' ? 30 : entity.type === 'friendly' ? 24 : 20;
      const x = entity.renderXScreen - (width / 2);
      const y = entity.renderYScreen - (entity.type === 'cargo' ? 24 : 21);

      this.graphics.lineStyle(1, 0x061520, 0.95);
      this.graphics.beginFill(0x020a11, 0.76);
      this.graphics.drawRoundedRect(x, y, width, 5, 2.5);
      this.graphics.endFill();

      this.graphics.beginFill(0x0f2736, 0.92);
      this.graphics.drawRoundedRect(x + 1, y + 1, width - 2, 3, 2);
      this.graphics.endFill();

      this.graphics.beginFill(getBarColor(entity, ratio), 0.98);
      this.graphics.drawRoundedRect(x + 1, y + 1, Math.max(2, (width - 2) * ratio), 3, 2);
      this.graphics.endFill();
    }
  }

  destroy() {
    this.graphics.destroy();
  }
}
