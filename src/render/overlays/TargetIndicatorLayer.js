import { Graphics } from 'pixi.js';

function drawDashedLine(graphics, start, end, dashLength, gapLength, color, width, alpha) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.hypot(dx, dy);

  if (distance === 0) {
    return;
  }

  const ux = dx / distance;
  const uy = dy / distance;
  let cursor = 0;

  while (cursor < distance) {
    const dashEnd = Math.min(distance, cursor + dashLength);
    graphics.lineStyle(width, color, alpha);
    graphics.moveTo(start.x + (ux * cursor), start.y + (uy * cursor));
    graphics.lineTo(start.x + (ux * dashEnd), start.y + (uy * dashEnd));
    cursor += dashLength + gapLength;
  }
}

function getNearestBorderProjection(entity, geometry) {
  const candidates = [
    {
      distance: Math.abs(entity.renderY - geometry.northBorderYNm),
      point: { x: entity.renderX, y: geometry.northBorderYNm },
    },
    {
      distance: Math.abs(entity.renderY - geometry.southBorderYNm),
      point: { x: entity.renderX, y: geometry.southBorderYNm },
    },
    {
      distance: Math.abs(entity.renderX - geometry.westBorderXNm),
      point: { x: geometry.westBorderXNm, y: entity.renderY },
    },
  ];

  return candidates.sort((left, right) => left.distance - right.distance)[0];
}

function drawTargetDiamond(graphics, x, y, size, color, alpha) {
  graphics.lineStyle(1.8, color, alpha);
  graphics.moveTo(x, y - size);
  graphics.lineTo(x + size, y);
  graphics.lineTo(x, y + size);
  graphics.lineTo(x - size, y);
  graphics.lineTo(x, y - size);
}

export class TargetIndicatorLayer {
  constructor() {
    this.graphics = new Graphics();
  }

  update({ state, renderEntitiesById, worldToScreen, geometry, elapsedSec, selectedEntityId }) {
    this.graphics.clear();
    const pulse = 0.55 + (Math.sin(elapsedSec * 5.1) * 0.3);

    for (const unit of state.friendlyUnits) {
      if (!unit.assignedTargetId) {
        continue;
      }

      const start = renderEntitiesById.get(unit.id);
      const target = renderEntitiesById.get(unit.assignedTargetId);

      if (!start || !target) {
        continue;
      }

      const strength = unit.id === selectedEntityId || target.id === selectedEntityId ? 0.95 : 0.62;
      drawDashedLine(
        this.graphics,
        { x: start.renderXScreen, y: start.renderYScreen },
        { x: target.renderXScreen, y: target.renderYScreen },
        12,
        8,
        0x7af2b5,
        1.7,
        strength,
      );

      drawTargetDiamond(this.graphics, target.renderXScreen, target.renderYScreen, 15 + (pulse * 4), 0xffc873, 0.55 + (pulse * 0.25));
    }

    for (const contact of state.contacts) {
      const renderContact = renderEntitiesById.get(contact.id);

      if (!renderContact) {
        continue;
      }

      if (contact.classification === 'enemy') {
        const projection = getNearestBorderProjection(renderContact, geometry);
        const borderPoint = worldToScreen(projection.point);
        const distanceAlpha = Math.max(0.24, 0.92 - (projection.distance / 6));

        this.graphics.lineStyle(1.5, 0xff9466, distanceAlpha);
        this.graphics.moveTo(renderContact.renderXScreen, renderContact.renderYScreen);
        this.graphics.lineTo(borderPoint.x, borderPoint.y);

        drawTargetDiamond(this.graphics, renderContact.renderXScreen, renderContact.renderYScreen, 11 + (pulse * 3), 0xff6b6b, 0.85);
      } else if (contact.classification === 'target') {
        const projection = getNearestBorderProjection(renderContact, geometry);
        const borderPoint = worldToScreen(projection.point);
        const distanceAlpha = Math.max(0.2, 0.78 - (projection.distance / 7.5));

        this.graphics.lineStyle(1.3, 0xffbb8c, distanceAlpha);
        this.graphics.moveTo(renderContact.renderXScreen, renderContact.renderYScreen);
        this.graphics.lineTo(borderPoint.x, borderPoint.y);

        drawTargetDiamond(this.graphics, renderContact.renderXScreen, renderContact.renderYScreen, 10 + (pulse * 2.5), 0xff9f5b, 0.78);
      } else if (contact.classification === 'suspicious') {
        drawTargetDiamond(this.graphics, renderContact.renderXScreen, renderContact.renderYScreen, 9 + (pulse * 2), 0xf6c562, 0.7);
      }
    }
  }

  destroy() {
    this.graphics.destroy();
  }
}
