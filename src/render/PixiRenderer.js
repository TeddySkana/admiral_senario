import { Application, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { degToRad } from '../sim/utils/math.js';
import { EffectManager } from './effects/EffectManager.js';
import { getInterpolatedEntityState } from './interpolation/interpolate.js';
import { getEntityColor, RENDER_PALETTE } from './RenderPalette.js';
import { WakeTrailLayer } from './WakeTrailLayer.js';
import { HealthBarLayer } from './overlays/HealthBarLayer.js';
import { FpsOverlay } from './overlays/FpsOverlay.js';
import { SelectionOverlay } from './overlays/SelectionOverlay.js';
import { TargetIndicatorLayer } from './overlays/TargetIndicatorLayer.js';
import { OceanLayer } from './water/OceanLayer.js';
import { withBasePath } from '../utils/assets.js';

const SHIP_SPRITE_PATHS = {
  friendly: withBasePath('sprites/ships/dvora-friendly.png'),
  cargo: withBasePath('sprites/ships/cargo-neutral.png'),
  fishing: withBasePath('sprites/ships/fishing-contact.png'),
};

const SHIP_SPRITE_SCALES = {
  friendly: 0.24,
  cargo: 0.27,
  fishing: 0.92,
};
const NAUTICAL_MILES_PER_STATUTE_MILE = 0.868976;

function drawGlowingLine(graphics, start, end, glowColor, coreColor, width) {
  graphics.lineStyle(width + 4, glowColor, 0.08);
  graphics.moveTo(start.x, start.y);
  graphics.lineTo(end.x, end.y);
  graphics.lineStyle(width + 1.5, glowColor, 0.18);
  graphics.moveTo(start.x, start.y);
  graphics.lineTo(end.x, end.y);
  graphics.lineStyle(width, coreColor, 0.95);
  graphics.moveTo(start.x, start.y);
  graphics.lineTo(end.x, end.y);
}

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

function createMapLabel(text) {
  return new Text(text, {
    fontFamily: 'Trebuchet MS, Segoe UI, sans-serif',
    fontSize: 12,
    fill: RENDER_PALETTE.text,
    fontWeight: '700',
    stroke: RENDER_PALETTE.textShadow,
    strokeThickness: 4,
  });
}

function createEntityLabel(text) {
  const label = new Text(text, {
    fontFamily: 'Trebuchet MS, Segoe UI, sans-serif',
    fontSize: 11,
    fill: RENDER_PALETTE.text,
    stroke: RENDER_PALETTE.textShadow,
    strokeThickness: 3,
    fontWeight: '700',
  });

  label.anchor.set(0.5, 0);
  label.y = 13;
  return label;
}

function drawShadow(graphic, entity) {
  const width = entity.type === 'cargo' ? 28 : entity.type === 'friendly' ? 18 : 13;
  const height = entity.type === 'cargo' ? 11 : entity.type === 'friendly' ? 8 : 6;
  const alpha = entity.isSinking ? 0.18 : 0.28;

  graphic.clear();
  graphic.beginFill(0x000000, alpha);
  graphic.drawEllipse(0, 3, width, height);
  graphic.endFill();
}

function drawFriendlyShip(graphic, entity) {
  const isAssigned = entity.state === 'intercept' || entity.state === 'engage';

  graphic.clear();
  graphic.lineStyle(isAssigned ? 2.8 : 1.6, isAssigned ? 0xffffff : 0x082033, 0.95);
  graphic.beginFill(RENDER_PALETTE.friendly, 0.98);
  graphic.drawPolygon([0, -14, 9, 9, 3, 6, 0, 11, -3, 6, -9, 9]);
  graphic.endFill();
  graphic.beginFill(0xcffff9, 0.96);
  graphic.drawRoundedRect(-2.5, -4, 5, 8, 2);
  graphic.endFill();
  graphic.beginFill(isAssigned ? 0xffffff : 0x8deed5, 0.85);
  graphic.drawRoundedRect(-4, 7, 8, 3, 1.5);
  graphic.endFill();
}

function drawCargoShip(graphic) {
  graphic.clear();
  graphic.lineStyle(1.5, 0x071726, 0.94);
  graphic.beginFill(RENDER_PALETTE.cargo, 0.95);
  graphic.drawRoundedRect(-16, -6.5, 32, 13, 4);
  graphic.endFill();
  graphic.beginFill(0x7f98a5, 0.95);
  graphic.drawRoundedRect(-5, -10, 10, 5, 2);
  graphic.endFill();
  graphic.beginFill(0xd8edf7, 0.92);
  graphic.drawRoundedRect(-3, -8.5, 6, 2.6, 1);
  graphic.endFill();
}

function drawFishingShip(graphic, entity) {
  const hullColor = getEntityColor(entity);

  graphic.clear();
  graphic.lineStyle(1.25, 0x071726, 0.92);
  graphic.beginFill(hullColor, 0.98);
  graphic.drawPolygon([0, -10, 6.5, 8.5, 0, 4.2, -6.5, 8.5]);
  graphic.endFill();
  graphic.beginFill(0xf9f4d8, 0.82);
  graphic.drawRoundedRect(-1.4, -2.5, 2.8, 4.8, 1);
  graphic.endFill();
}

function drawMarker(graphic, entity, elapsedSec) {
  graphic.clear();
  const pulse = 0.55 + (Math.sin(elapsedSec * 4.5) * 0.45);

  if (entity.classification === 'enemy') {
    graphic.lineStyle(2, 0xffb27a, 0.2 + (pulse * 0.12));
    graphic.drawCircle(0, 0, 14 + (pulse * 4));
    graphic.lineStyle(2.2, RENDER_PALETTE.enemy, 0.94);
    graphic.drawCircle(0, 0, 10.5 + (pulse * 1.2));
  } else if (entity.classification === 'target') {
    graphic.lineStyle(2.1, 0xffc18d, 0.26 + (pulse * 0.18));
    graphic.drawCircle(0, 0, 12.5 + (pulse * 3.5));
    graphic.lineStyle(2.4, RENDER_PALETTE.target, 0.92);
    graphic.drawCircle(0, 0, 9.6 + (pulse * 1.2));
  } else if (entity.classification === 'suspicious') {
    graphic.lineStyle(2, RENDER_PALETTE.suspicious, 0.72 + (pulse * 0.14));
    graphic.drawCircle(0, 0, 9 + (pulse * 3));
  }

  if (entity.type === 'friendly' && (entity.state === 'intercept' || entity.state === 'engage')) {
    graphic.lineStyle(2, RENDER_PALETTE.friendly, 0.9);
    graphic.drawCircle(0, 0, 14);
  }
}

export class PixiRenderer {
  constructor(eventBus) {
    this.eventBus = eventBus;
    this.app = null;
    this.host = null;
    this.geometry = null;
    this.worldGraphics = null;
    this.worldLabels = null;
    this.entityLayer = null;
    this.oceanLayer = new OceanLayer();
    this.wakeTrailLayer = new WakeTrailLayer();
    this.targetIndicatorLayer = new TargetIndicatorLayer();
    this.healthBarLayer = new HealthBarLayer();
    this.selectionOverlay = new SelectionOverlay();
    this.effects = new EffectManager(eventBus);
    this.fpsOverlay = new FpsOverlay();
    this.entityViews = new Map();
    this.unsubscribers = [];
    this.selectedEntityId = null;
    this.latestState = null;
    this.latestRenderEntities = [];
    this.latestRenderEntitiesById = new Map();
    this.lastSize = { width: 0, height: 0 };
    this.elapsedSec = 0;
    this.lastFrameDtSec = 1 / 60;
    this.shipTextures = new Map();
    this.handleCanvasClick = this.handleCanvasClick.bind(this);
  }

  async mount(host, geometry) {
    this.host = host;
    this.geometry = geometry;
    this.app = new Application({
      antialias: true,
      backgroundAlpha: 0,
      autoStart: false,
      resizeTo: host,
    });

    this.host.appendChild(this.app.view);
    this.app.stage.sortableChildren = true;
    this.shipTextures.clear();

    for (const [key, path] of Object.entries(SHIP_SPRITE_PATHS)) {
      this.shipTextures.set(key, Texture.from(path));
    }

    this.worldGraphics = new Graphics();
    this.worldGraphics.zIndex = 1;
    this.oceanLayer.container.zIndex = 0;
    this.wakeTrailLayer.container.zIndex = 2;
    this.targetIndicatorLayer.graphics.zIndex = 3;
    this.entityLayer = new Container();
    this.entityLayer.zIndex = 4;
    this.healthBarLayer.graphics.zIndex = 5;
    this.selectionOverlay.graphics.zIndex = 6;
    this.effects.container.zIndex = 7;
    this.worldLabels = new Container();
    this.worldLabels.zIndex = 8;
    this.fpsOverlay.container.zIndex = 9;

    this.app.stage.addChild(this.oceanLayer.container);
    this.app.stage.addChild(this.worldGraphics);
    this.app.stage.addChild(this.wakeTrailLayer.container);
    this.app.stage.addChild(this.targetIndicatorLayer.graphics);
    this.app.stage.addChild(this.entityLayer);
    this.app.stage.addChild(this.healthBarLayer.graphics);
    this.app.stage.addChild(this.selectionOverlay.graphics);
    this.app.stage.addChild(this.effects.container);
    this.app.stage.addChild(this.worldLabels);
    this.app.stage.addChild(this.fpsOverlay.container);

    this.app.view.addEventListener('click', this.handleCanvasClick);
    this.unsubscribers.push(
      this.eventBus.on('selection-changed', (payload) => {
        this.selectedEntityId = payload.entityId ?? null;
      }),
    );

    this.drawWorld();
  }

  reset() {
    this.selectedEntityId = null;
    this.effects.clear();
    this.wakeTrailLayer.clear();
    this.latestRenderEntities = [];
    this.latestRenderEntitiesById.clear();
  }

  getViewport() {
    return {
      width: this.app.renderer.width,
      height: this.app.renderer.height,
    };
  }

  worldToScreen(point) {
    const viewport = this.getViewport();
    return {
      x: (point.x / this.geometry.widthNm) * viewport.width,
      y: (point.y / this.geometry.heightNm) * viewport.height,
    };
  }

  screenToWorld(point) {
    const viewport = this.getViewport();
    return {
      x: (point.x / viewport.width) * this.geometry.widthNm,
      y: (point.y / viewport.height) * this.geometry.heightNm,
    };
  }

  buildRenderEntities(state, alpha) {
    return [...state.friendlyUnits, ...state.contacts].map((entity) => {
      const interpolated = getInterpolatedEntityState(entity, alpha);
      const screenPoint = this.worldToScreen({ x: interpolated.renderX, y: interpolated.renderY });

      return {
        ...interpolated,
        renderXScreen: screenPoint.x,
        renderYScreen: screenPoint.y,
      };
    });
  }

  drawWorld() {
    if (!this.worldGraphics || !this.worldLabels) {
      return;
    }

    const viewport = this.getViewport();

    if (viewport.width === this.lastSize.width && viewport.height === this.lastSize.height) {
      return;
    }

    this.lastSize = viewport;
    this.worldGraphics.clear();
    this.worldLabels.removeChildren().forEach((child) => child.destroy());

    if (this.geometry.scenarioType === 'offshore') {
      this.drawOffshoreWorld(viewport);
      return;
    }

    const coastX = this.worldToScreen({ x: this.geometry.coastlineXNm, y: 0 }).x;
    const northBorder = this.worldToScreen({ x: 0, y: this.geometry.northBorderYNm }).y;
    const southBorder = this.worldToScreen({ x: 0, y: this.geometry.southBorderYNm }).y;
    const westBorder = this.worldToScreen({ x: this.geometry.westBorderXNm, y: 0 }).x;
    const shippingWest = this.worldToScreen({ x: this.geometry.shippingLane.westXNm, y: 0 }).x;
    const shippingEast = this.worldToScreen({ x: this.geometry.shippingLane.eastXNm, y: 0 }).x;

    for (let index = 0; index < 13; index += 1) {
      const x = (viewport.width / 12) * index;
      this.worldGraphics.lineStyle(1, 0xffffff, 0.035);
      this.worldGraphics.moveTo(x, 0);
      this.worldGraphics.lineTo(x, viewport.height);
    }

    for (let index = 0; index < 10; index += 1) {
      const y = (viewport.height / 10) * index;
      this.worldGraphics.lineStyle(1, 0xffffff, 0.028);
      this.worldGraphics.moveTo(0, y);
      this.worldGraphics.lineTo(viewport.width, y);
    }

    this.worldGraphics.beginFill(RENDER_PALETTE.laneFill, 0.16);
    this.worldGraphics.drawRect(shippingWest, 0, shippingEast - shippingWest, viewport.height);
    this.worldGraphics.endFill();
    this.worldGraphics.lineStyle(1.2, 0xd6f5ff, 0.14);
    this.worldGraphics.moveTo(shippingWest, 0);
    this.worldGraphics.lineTo(shippingWest, viewport.height);
    this.worldGraphics.moveTo(shippingEast, 0);
    this.worldGraphics.lineTo(shippingEast, viewport.height);

    this.worldGraphics.beginFill(RENDER_PALETTE.coastFill, 0.94);
    this.worldGraphics.drawRect(coastX, 0, viewport.width - coastX, viewport.height);
    this.worldGraphics.endFill();
    this.worldGraphics.lineStyle(3, RENDER_PALETTE.coastEdge, 0.42);
    this.worldGraphics.moveTo(coastX, 0);
    this.worldGraphics.lineTo(coastX, viewport.height);

    const fishingPolygon = this.geometry.fishingPolygon.map((point) => this.worldToScreen(point));
    this.worldGraphics.lineStyle(2, RENDER_PALETTE.fishingStroke, 0.82);
    this.worldGraphics.beginFill(RENDER_PALETTE.fishingFill, 0.14);
    this.worldGraphics.drawPolygon(fishingPolygon.flatMap((point) => [point.x, point.y]));
    this.worldGraphics.endFill();

    drawGlowingLine(this.worldGraphics, { x: westBorder, y: northBorder }, { x: coastX, y: northBorder }, RENDER_PALETTE.borderGlow, RENDER_PALETTE.border, 2.4);
    drawGlowingLine(this.worldGraphics, { x: westBorder, y: southBorder }, { x: coastX, y: southBorder }, RENDER_PALETTE.borderGlow, RENDER_PALETTE.border, 2.4);
    drawGlowingLine(this.worldGraphics, { x: westBorder, y: northBorder }, { x: westBorder, y: southBorder }, RENDER_PALETTE.borderGlow, RENDER_PALETTE.border, 2.4);

    for (const line of Object.values(this.geometry.patrolLines)) {
      const start = this.worldToScreen(line.start);
      const end = this.worldToScreen(line.end);
      drawDashedLine(this.worldGraphics, start, end, 16, 8, RENDER_PALETTE.patrolGlow, 3.4, 0.15);
      drawDashedLine(this.worldGraphics, start, end, 16, 8, RENDER_PALETTE.patrol, 1.5, 0.9);
    }

    const labels = [
      { text: 'Fishing Zone', point: this.worldToScreen({ x: this.geometry.coastlineXNm - 1.05, y: (this.geometry.fishingPolygon[0].y + this.geometry.fishingPolygon[2].y) / 2 }) },
      { text: 'Neutral Shipping Lane', point: { x: (shippingWest + shippingEast) / 2, y: viewport.height * 0.11 } },
      { text: 'North Border', point: { x: westBorder + 18, y: northBorder - 18 } },
      { text: 'West Border', point: { x: westBorder + 12, y: (northBorder + southBorder) / 2 } },
      { text: 'South Border', point: { x: westBorder + 18, y: southBorder + 8 } },
      { text: 'Coastline', point: { x: coastX + 24, y: viewport.height * 0.08 } },
    ];

    for (const item of labels) {
      const label = createMapLabel(item.text);
      label.x = item.point.x;
      label.y = item.point.y;
      this.worldLabels.addChild(label);
    }
  }

  drawOffshoreWorld(viewport) {
    const rigPoint = this.worldToScreen(this.geometry.rig);

    for (let index = 0; index < 13; index += 1) {
      const x = (viewport.width / 12) * index;
      this.worldGraphics.lineStyle(1, 0xffffff, 0.03);
      this.worldGraphics.moveTo(x, 0);
      this.worldGraphics.lineTo(x, viewport.height);
    }

    for (let index = 0; index < 10; index += 1) {
      const y = (viewport.height / 10) * index;
      this.worldGraphics.lineStyle(1, 0xffffff, 0.022);
      this.worldGraphics.moveTo(0, y);
      this.worldGraphics.lineTo(viewport.width, y);
    }

    for (const ring of this.geometry.patrolRings ?? []) {
      const radiusX = (ring.radiusNm / this.geometry.widthNm) * viewport.width;
      const radiusY = (ring.radiusNm / this.geometry.heightNm) * viewport.height;
      const color = ring.key === 'security' ? 0x7af2b5 : 0xffffff;

      this.worldGraphics.lineStyle(ring.key === 'security' ? 2.2 : 2.3, color, ring.key === 'security' ? 0.86 : 0.84);
      this.worldGraphics.beginFill(color, ring.key === 'security' ? 0.08 : 0.03);
      this.worldGraphics.drawEllipse(rigPoint.x, rigPoint.y, radiusX, radiusY);
      this.worldGraphics.endFill();
    }

    const radarRadiusX = (this.geometry.sensorRangesNm.radar / this.geometry.widthNm) * viewport.width;
    const radarRadiusY = (this.geometry.sensorRangesNm.radar / this.geometry.heightNm) * viewport.height;
    this.worldGraphics.lineStyle(1.1, 0x7dd7e8, 0.22);
    this.worldGraphics.drawEllipse(rigPoint.x, rigPoint.y, radarRadiusX, radarRadiusY);

    this.worldGraphics.lineStyle(2.2, 0xffffff, 0.95);
    this.worldGraphics.beginFill(0xd9f6ff, 0.95);
    this.worldGraphics.drawPolygon([
      rigPoint.x, rigPoint.y - 16,
      rigPoint.x + 12, rigPoint.y - 2,
      rigPoint.x + 8, rigPoint.y + 16,
      rigPoint.x - 8, rigPoint.y + 16,
      rigPoint.x - 12, rigPoint.y - 2,
    ]);
    this.worldGraphics.endFill();
    this.worldGraphics.lineStyle(1.5, 0x7dd7e8, 0.95);
    this.worldGraphics.moveTo(rigPoint.x, rigPoint.y - 20);
    this.worldGraphics.lineTo(rigPoint.x, rigPoint.y + 16);
    this.worldGraphics.moveTo(rigPoint.x - 8, rigPoint.y + 2);
    this.worldGraphics.lineTo(rigPoint.x + 8, rigPoint.y + 2);

    const scaleMiles = 10;
    const scaleNm = scaleMiles * NAUTICAL_MILES_PER_STATUTE_MILE;
    const scaleWidth = (scaleNm / this.geometry.widthNm) * viewport.width;
    const scaleLeft = viewport.width - scaleWidth - 26;
    const scaleTop = viewport.height - 34;
    const scaleHeight = 8;
    const segmentWidth = scaleWidth / 4;

    this.worldGraphics.lineStyle(1.2, 0xe7edf2, 0.95);
    this.worldGraphics.beginFill(0xf4f6f8, 0.92);
    this.worldGraphics.drawRect(scaleLeft, scaleTop, scaleWidth, scaleHeight);
    this.worldGraphics.endFill();

    for (let index = 0; index < 4; index += 1) {
      this.worldGraphics.beginFill(index % 2 === 0 ? 0x1a1e23 : 0xf4f6f8, 0.95);
      this.worldGraphics.drawRect(scaleLeft + (segmentWidth * index), scaleTop, segmentWidth, scaleHeight);
      this.worldGraphics.endFill();
    }

    for (let index = 0; index <= 4; index += 1) {
      const tickX = scaleLeft + (segmentWidth * index);
      this.worldGraphics.lineStyle(1, 0xe7edf2, 0.95);
      this.worldGraphics.moveTo(tickX, scaleTop);
      this.worldGraphics.lineTo(tickX, scaleTop + scaleHeight);
    }

    const tickLabels = ['0', '2.5', '5', '7.5', '10'];
    tickLabels.forEach((text, index) => {
      const label = createMapLabel(text);
      label.style.fontSize = 10;
      label.x = scaleLeft + (segmentWidth * index) - (index === 0 ? 0 : 8);
      label.y = scaleTop - 16;
      this.worldLabels.addChild(label);
    });

    const scaleLabel = createMapLabel('Miles');
    scaleLabel.x = scaleLeft + (scaleWidth * 0.5) - 16;
    scaleLabel.y = scaleTop + 10;
    this.worldLabels.addChild(scaleLabel);
  }

  ensureEntityView(entity) {
    if (this.entityViews.has(entity.id)) {
      return this.entityViews.get(entity.id);
    }

    const container = new Container();
    container.sortableChildren = true;

    const shadow = new Graphics();
    shadow.zIndex = 0;
    const marker = new Graphics();
    marker.zIndex = 1;
    const shipSprite = new Sprite(Texture.WHITE);
    shipSprite.anchor.set(0.5);
    shipSprite.zIndex = 2;
    shipSprite.visible = false;
    const shipFallback = new Graphics();
    shipFallback.zIndex = 3;
    const label = createEntityLabel(entity.id);
    label.zIndex = 4;

    container.addChild(shadow);
    container.addChild(marker);
    container.addChild(shipSprite);
    container.addChild(shipFallback);
    container.addChild(label);
    this.entityLayer.addChild(container);

    const view = { container, shadow, marker, shipSprite, shipFallback, label };
    this.entityViews.set(entity.id, view);
    return view;
  }

  syncEntityViews(renderEntities) {
    const activeIds = new Set(renderEntities.map((entity) => entity.id));

    for (const entity of renderEntities) {
      const view = this.ensureEntityView(entity);
      const rotation = degToRad(entity.renderHeadingDeg);

      view.container.x = entity.renderXScreen;
      view.container.y = entity.renderYScreen;
      view.container.rotation = rotation;
      view.label.text = entity.id;
      view.label.rotation = -rotation;
      view.marker.rotation = -rotation;

      drawShadow(view.shadow, entity);
      drawMarker(view.marker, entity, this.elapsedSec);

      const spriteKey = entity.spriteVariant ?? (
        entity.type === 'friendly'
          ? 'friendly'
          : entity.type === 'cargo'
            ? 'cargo'
            : 'fishing'
      );
      const spriteTexture = this.shipTextures.get(spriteKey);

      if (spriteTexture) {
        view.shipSprite.texture = spriteTexture;
        view.shipSprite.visible = true;
        view.shipSprite.scale.set(SHIP_SPRITE_SCALES[spriteKey] ?? 0.22);
        view.shipSprite.tint = spriteKey === 'fishing' ? getEntityColor(entity) : 0xffffff;
        view.shipFallback.clear();
        view.shipFallback.visible = false;
      } else {
        view.shipSprite.visible = false;
        view.shipFallback.visible = true;

        if (entity.type === 'friendly') {
          drawFriendlyShip(view.shipFallback, entity);
        } else if (entity.type === 'cargo') {
          drawCargoShip(view.shipFallback);
        } else {
          drawFishingShip(view.shipFallback, entity);
        }
      }

      const sinkOffset = entity.isSinking ? Math.min(5, (entity.smokeLevel ?? 0) * 4) : 0;
      view.shipSprite.y = sinkOffset;
      view.shipSprite.alpha = entity.isSinking ? 0.82 : 1;
      view.shipFallback.y = sinkOffset;
      view.shadow.alpha = entity.isSinking ? 0.45 : 1;
      view.label.alpha = entity.isSinking ? 0.65 : 1;
    }

    if (this.selectedEntityId && !activeIds.has(this.selectedEntityId)) {
      this.selectedEntityId = null;
      this.eventBus.emit('selection-changed', { entityId: null });
    }

    for (const [entityId, view] of this.entityViews.entries()) {
      if (activeIds.has(entityId)) {
        continue;
      }

      view.container.destroy({ children: true });
      this.entityViews.delete(entityId);
    }
  }

  handleCanvasClick(event) {
    if (!this.latestRenderEntities.length) {
      return;
    }

    const rect = this.app.view.getBoundingClientRect();
    const worldPoint = this.screenToWorld({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    });

    let bestEntity = null;
    let bestDistance = Infinity;

    for (const entity of this.latestRenderEntities) {
      const distance = Math.hypot(entity.renderX - worldPoint.x, entity.renderY - worldPoint.y);

      if (distance < bestDistance) {
        bestDistance = distance;
        bestEntity = entity;
      }
    }

    const maxSelectDistance = bestEntity?.type === 'cargo' ? 1.2 : 0.95;
    this.selectedEntityId = bestDistance <= maxSelectDistance ? bestEntity?.id ?? null : null;
    this.eventBus.emit('selection-changed', { entityId: this.selectedEntityId });
  }

  update(dtSec) {
    this.elapsedSec += dtSec;
    this.lastFrameDtSec = dtSec;
  }

  render(state, options = {}) {
    if (!this.app) {
      return;
    }

    this.latestState = state;
    this.drawWorld();

    const alpha = Math.max(0, Math.min(1, options.alpha ?? 1));
    this.latestRenderEntities = this.buildRenderEntities(state, alpha);
    this.latestRenderEntitiesById = new Map(this.latestRenderEntities.map((entity) => [entity.id, entity]));
    const selectedEntity = this.selectedEntityId ? this.latestRenderEntitiesById.get(this.selectedEntityId) ?? null : null;
    const viewport = this.getViewport();

    this.oceanLayer.update({
      viewport,
      geometry: this.geometry,
      worldToScreen: (point) => this.worldToScreen(point),
      elapsedSec: this.elapsedSec,
    });

    this.wakeTrailLayer.update(this.latestRenderEntities, this.lastFrameDtSec);
    this.wakeTrailLayer.draw((point) => this.worldToScreen(point));

    this.targetIndicatorLayer.update({
      state,
      renderEntitiesById: this.latestRenderEntitiesById,
      worldToScreen: (point) => this.worldToScreen(point),
      geometry: this.geometry,
      elapsedSec: this.elapsedSec,
      selectedEntityId: this.selectedEntityId,
    });

    this.syncEntityViews(this.latestRenderEntities);
    this.healthBarLayer.update(this.latestRenderEntities, this.selectedEntityId);
    this.selectionOverlay.update({
      selectedEntity,
      geometry: this.geometry,
      viewport,
      elapsedSec: this.elapsedSec,
    });
    this.effects.update(this.lastFrameDtSec, {
      renderEntitiesById: this.latestRenderEntitiesById,
      worldToScreen: (point) => this.worldToScreen(point),
    });
    this.fpsOverlay.update(options.fps ?? 0, viewport);

    this.app.render();
  }

  destroy() {
    if (this.app?.view) {
      this.app.view.removeEventListener('click', this.handleCanvasClick);
    }

    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers = [];
    this.effects.destroy();
    this.oceanLayer.destroy();
    this.wakeTrailLayer.destroy();
    this.targetIndicatorLayer.destroy();
    this.healthBarLayer.destroy();
    this.selectionOverlay.destroy();
    this.fpsOverlay.destroy();

    for (const view of this.entityViews.values()) {
      view.container.destroy({ children: true });
    }

    this.entityViews.clear();

    if (this.app) {
      this.app.destroy(true, {
        children: true,
        texture: false,
        baseTexture: false,
      });
    }

    this.app = null;
    this.host = null;
    this.latestRenderEntities = [];
    this.latestRenderEntitiesById.clear();
  }
}
