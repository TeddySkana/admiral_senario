import { renderIcon } from './Icon.js';

export class HudPanel {
  constructor({
    title,
    subtitle = '',
    className = '',
    icon = null,
    embedded = false,
    hideHeader = false,
  }) {
    this.title = title;
    this.subtitle = subtitle;
    this.className = className;
    this.icon = icon;
    this.embedded = embedded;
    this.hideHeader = hideHeader;
    this.root = null;
    this.contentNode = null;
  }

  mount(parent) {
    this.root = document.createElement('section');
    const baseClass = this.embedded ? 'hud-panel hud-panel-embedded' : 'panel-card hud-panel';
    this.root.className = `${baseClass} ${this.className}`.trim();
    this.root.innerHTML = `
      ${this.hideHeader
    ? ''
    : `<div class="panel-head">
        <div>
          <h3>${this.icon ? `${renderIcon(this.icon)} ` : ''}${this.title}</h3>
          ${this.subtitle ? `<p>${this.subtitle}</p>` : ''}
        </div>
      </div>`}
      <div class="hud-panel-content"></div>
    `;

    this.contentNode = this.root.querySelector('.hud-panel-content');
    parent.appendChild(this.root);
  }

  setContent(html) {
    if (!this.contentNode) {
      return;
    }

    this.contentNode.innerHTML = html;
  }

  destroy() {
    this.root?.remove();
    this.root = null;
    this.contentNode = null;
  }
}
