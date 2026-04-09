import { Container, Graphics } from 'pixi.js';
import { RENDER_PALETTE } from './RenderPalette.js';

export class OceanBackdrop {
  constructor() {
    this.container = new Container();
    this.graphics = new Graphics();
    this.container.addChild(this.graphics);
  }

  update({ viewport, geometry, worldToScreen, elapsedSec }) {
    const graphics = this.graphics;
    graphics.clear();

    const coastX = worldToScreen({ x: geometry.coastlineXNm, y: 0 }).x;
    const shippingWest = worldToScreen({ x: geometry.shippingLane.westXNm, y: 0 }).x;
    const shippingEast = worldToScreen({ x: geometry.shippingLane.eastXNm, y: 0 }).x;

    for (let band = 0; band < 10; band += 1) {
      const baseY = ((band * (viewport.height / 8)) + (elapsedSec * (10 + band))) % (viewport.height + 80) - 40;
      const amplitude = 8 + (band * 1.2);
      const bandAlpha = 0.05 + (band * 0.006);

      graphics.lineStyle(1.1, band % 2 === 0 ? RENDER_PALETTE.oceanBright : 0x7fcbef, bandAlpha);
      graphics.moveTo(0, baseY);

      for (let x = 0; x <= coastX; x += 22) {
        const waveY = baseY + Math.sin((x * 0.018) + (elapsedSec * 0.9) + band) * amplitude;
        graphics.lineTo(x, waveY);
      }
    }

    for (let stripe = 0; stripe < 7; stripe += 1) {
      const localY = ((stripe * 44) + (elapsedSec * 18)) % (viewport.height + 40) - 20;
      graphics.beginFill(0xbbe7ff, 0.025);
      graphics.drawRoundedRect(shippingWest, localY, shippingEast - shippingWest, 18, 6);
      graphics.endFill();
    }
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
