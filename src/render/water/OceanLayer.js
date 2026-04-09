import { Container, Graphics, Texture, TilingSprite } from 'pixi.js';
import { RENDER_PALETTE } from '../RenderPalette.js';

function createWaterPatternTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 160;
  const context = canvas.getContext('2d');

  context.fillStyle = '#0a2940';
  context.fillRect(0, 0, canvas.width, canvas.height);

  for (let row = 0; row < 9; row += 1) {
    const y = 10 + (row * 18);
    context.strokeStyle = row % 2 === 0 ? 'rgba(130, 206, 235, 0.12)' : 'rgba(70, 135, 170, 0.11)';
    context.lineWidth = 2;
    context.beginPath();

    for (let x = -10; x <= canvas.width + 10; x += 6) {
      const waveY = y + Math.sin((x * 0.08) + row) * (2 + (row * 0.1));

      if (x === -10) {
        context.moveTo(x, waveY);
      } else {
        context.lineTo(x, waveY);
      }
    }

    context.stroke();
  }

  for (let index = 0; index < 24; index += 1) {
    const x = (index * 31) % canvas.width;
    const y = (index * 53) % canvas.height;
    context.fillStyle = 'rgba(255, 255, 255, 0.03)';
    context.beginPath();
    context.arc(x, y, 1.2, 0, Math.PI * 2);
    context.fill();
  }

  return Texture.from(canvas);
}

function createFoamTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 96;
  const context = canvas.getContext('2d');

  context.clearRect(0, 0, canvas.width, canvas.height);

  for (let row = 0; row < 7; row += 1) {
    context.strokeStyle = row % 2 === 0 ? 'rgba(218, 244, 255, 0.12)' : 'rgba(156, 222, 245, 0.08)';
    context.lineWidth = 2;
    context.beginPath();

    for (let x = -8; x <= canvas.width + 8; x += 8) {
      const y = 12 + (row * 13) + Math.sin((x * 0.12) + (row * 0.9)) * 3;

      if (x === -8) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
    }

    context.stroke();
  }

  return Texture.from(canvas);
}

export class OceanLayer {
  constructor() {
    this.container = new Container();
    this.baseGraphics = new Graphics();
    this.waveGraphics = new Graphics();
    this.lowPattern = null;
    this.highPattern = null;
    this.waterTexture = null;
    this.foamTexture = null;
    this.viewport = { width: 0, height: 0 };

    this.container.addChild(this.baseGraphics);
    this.container.addChild(this.waveGraphics);
  }

  mount() {
    if (!this.waterTexture) {
      this.waterTexture = createWaterPatternTexture();
      this.foamTexture = createFoamTexture();
    }

    if (!this.lowPattern) {
      this.lowPattern = new TilingSprite(this.waterTexture, 1, 1);
      this.lowPattern.alpha = 0.32;
      this.container.addChildAt(this.lowPattern, 1);
    }

    if (!this.highPattern) {
      this.highPattern = new TilingSprite(this.foamTexture, 1, 1);
      this.highPattern.alpha = 0.22;
      this.container.addChildAt(this.highPattern, 2);
    }
  }

  resize(viewport) {
    if (!this.lowPattern || !this.highPattern) {
      return;
    }

    if (viewport.width === this.viewport.width && viewport.height === this.viewport.height) {
      return;
    }

    this.viewport = { ...viewport };
    this.lowPattern.width = viewport.width;
    this.lowPattern.height = viewport.height;
    this.highPattern.width = viewport.width;
    this.highPattern.height = viewport.height;
  }

  update({ viewport, geometry, worldToScreen, elapsedSec }) {
    this.mount();
    this.resize(viewport);

    const coastX = worldToScreen({ x: geometry.coastlineXNm, y: 0 }).x;
    const shippingWest = worldToScreen({ x: geometry.shippingLane.westXNm, y: 0 }).x;
    const shippingEast = worldToScreen({ x: geometry.shippingLane.eastXNm, y: 0 }).x;

    this.lowPattern.tilePosition.x = elapsedSec * 18;
    this.lowPattern.tilePosition.y = elapsedSec * 10;
    this.lowPattern.tileScale.set(1.8, 1.2);

    this.highPattern.tilePosition.x = -elapsedSec * 10;
    this.highPattern.tilePosition.y = elapsedSec * 16;
    this.highPattern.tileScale.set(2.2, 1.7);

    this.baseGraphics.clear();
    this.baseGraphics.beginFill(RENDER_PALETTE.oceanDeep, 1);
    this.baseGraphics.drawRect(0, 0, viewport.width, viewport.height);
    this.baseGraphics.endFill();

    for (let band = 0; band < 5; band += 1) {
      const bandHeight = viewport.height / 5;
      const y = band * bandHeight;
      const alpha = 0.08 + (band * 0.015);
      const color = band % 2 === 0 ? RENDER_PALETTE.oceanMid : RENDER_PALETTE.oceanBright;
      this.baseGraphics.beginFill(color, alpha);
      this.baseGraphics.drawRect(0, y, coastX, bandHeight + 2);
      this.baseGraphics.endFill();
    }

    this.baseGraphics.beginFill(0xffffff, 0.025);
    this.baseGraphics.drawRoundedRect(shippingWest, 0, shippingEast - shippingWest, viewport.height, 18);
    this.baseGraphics.endFill();

    this.baseGraphics.beginFill(0xffffff, 0.035);
    this.baseGraphics.drawRoundedRect(coastX - 120, 0, 120, viewport.height, 20);
    this.baseGraphics.endFill();

    this.waveGraphics.clear();

    for (let band = 0; band < 11; band += 1) {
      const baseY = ((band * (viewport.height / 9)) + (elapsedSec * (9 + band))) % (viewport.height + 120) - 60;
      const amplitude = 5 + (band * 0.8);
      const bandAlpha = 0.035 + (band * 0.005);
      const color = band % 2 === 0 ? 0x7fd0f1 : 0xc6f3ff;
      this.waveGraphics.lineStyle(1.2, color, bandAlpha);
      this.waveGraphics.moveTo(0, baseY);

      for (let x = 0; x <= coastX; x += 18) {
        const waveY = baseY + Math.sin((x * 0.022) + (elapsedSec * 0.85) + (band * 0.7)) * amplitude;
        this.waveGraphics.lineTo(x, waveY);
      }
    }

    for (let stripe = 0; stripe < 8; stripe += 1) {
      const localY = ((stripe * 52) + (elapsedSec * 12)) % (viewport.height + 42) - 21;
      this.waveGraphics.beginFill(0xd6f5ff, 0.025);
      this.waveGraphics.drawRoundedRect(shippingWest, localY, shippingEast - shippingWest, 16, 10);
      this.waveGraphics.endFill();
    }
  }

  destroy() {
    this.container.destroy({ children: true });
    this.waterTexture?.destroy(true);
    this.foamTexture?.destroy(true);
  }
}
