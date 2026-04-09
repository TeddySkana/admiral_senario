import { Graphics } from 'pixi.js';

function getBaseRadius(entity) {
  if (!entity) {
    return 0;
  }

  if (entity.type === 'cargo') {
    return 22;
  }

  return entity.type === 'friendly' ? 18 : 16;
}

export class SelectionOverlay {
  constructor() {
    this.graphics = new Graphics();
  }

  update({ selectedEntity, geometry, viewport, elapsedSec }) {
    this.graphics.clear();

    if (!selectedEntity) {
      return;
    }

    const pulse = 0.65 + (Math.sin(elapsedSec * 4.5) * 0.18);
    const x = selectedEntity.renderXScreen;
    const y = selectedEntity.renderYScreen;
    const radius = getBaseRadius(selectedEntity);

    this.graphics.lineStyle(2.1, 0xffffff, 0.95);
    this.graphics.drawCircle(x, y, radius + (pulse * 3));

    this.graphics.lineStyle(2, 0xc9f7ff, 0.78);
    this.graphics.moveTo(x - radius - 6, y - radius + 2);
    this.graphics.lineTo(x - radius + 2, y - radius + 2);
    this.graphics.lineTo(x - radius + 2, y - radius - 6);
    this.graphics.moveTo(x + radius + 6, y - radius + 2);
    this.graphics.lineTo(x + radius - 2, y - radius + 2);
    this.graphics.lineTo(x + radius - 2, y - radius - 6);
    this.graphics.moveTo(x - radius - 6, y + radius - 2);
    this.graphics.lineTo(x - radius + 2, y + radius - 2);
    this.graphics.lineTo(x - radius + 2, y + radius + 6);
    this.graphics.moveTo(x + radius + 6, y + radius - 2);
    this.graphics.lineTo(x + radius - 2, y + radius - 2);
    this.graphics.lineTo(x + radius - 2, y + radius + 6);

    if (selectedEntity.type === 'friendly' && selectedEntity.engagementRangeNm) {
      const radiusX = (selectedEntity.engagementRangeNm / geometry.widthNm) * viewport.width;
      const radiusY = (selectedEntity.engagementRangeNm / geometry.heightNm) * viewport.height;
      this.graphics.lineStyle(1.4, 0x7af2b5, 0.8);
      this.graphics.beginFill(0x7af2b5, 0.25);
      this.graphics.drawEllipse(x, y, radiusX, radiusY);
      this.graphics.endFill();
    }

    if (selectedEntity.assignedTargetId) {
      this.graphics.lineStyle(1.2, 0x7af2b5, 0.86);
      this.graphics.moveTo(x, y - radius - 10);
      this.graphics.lineTo(x, y - radius - 22);
    }
  }

  destroy() {
    this.graphics.destroy();
  }
}
