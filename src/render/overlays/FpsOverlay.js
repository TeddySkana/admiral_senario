import { Container, Graphics, Text } from 'pixi.js';

export class FpsOverlay {
  constructor() {
    this.container = new Container();
    this.background = new Graphics();
    this.label = new Text('FPS', {
      fontFamily: 'Trebuchet MS, Segoe UI, sans-serif',
      fontSize: 10,
      fill: 0x95b8cb,
      fontWeight: '700',
      letterSpacing: 1.8,
    });
    this.value = new Text('0', {
      fontFamily: 'Trebuchet MS, Segoe UI, sans-serif',
      fontSize: 16,
      fill: 0xeaf8ff,
      fontWeight: '700',
    });

    this.label.x = 12;
    this.label.y = 8;
    this.value.x = 12;
    this.value.y = 20;

    this.container.addChild(this.background, this.label, this.value);
  }

  update(fps, viewport) {
    const clampedFps = Number.isFinite(fps) ? Math.max(0, fps) : 0;
    const rounded = Math.round(clampedFps);
    const valueColor = clampedFps < 24 ? 0xff7f7f : clampedFps < 45 ? 0xf6c562 : 0x7af2b5;

    this.value.text = `${rounded}`;
    this.value.style.fill = valueColor;

    this.background.clear();
    this.background.lineStyle(1, 0x7fa0b8, 0.32);
    this.background.beginFill(0x04111b, 0.82);
    this.background.drawRoundedRect(0, 0, 84, 52, 12);
    this.background.endFill();
    this.background.beginFill(valueColor, 0.08);
    this.background.drawRoundedRect(0, 0, 84, 52, 12);
    this.background.endFill();

    this.container.x = Math.max(0, viewport.width - 96);
    this.container.y = 12;
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
