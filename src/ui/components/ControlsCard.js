import { renderIcon } from './Icon.js';

export class ControlsCard {
  constructor({
    onPlay,
    onPause,
    onReset,
    onBack,
    onMusicToggle,
    onSfxToggle,
    onMusicVolumeChange,
    onSfxVolumeChange,
    onDebugToggle,
    onSpeedChange,
    onUiClick,
  }) {
    this.onPlay = onPlay;
    this.onPause = onPause;
    this.onReset = onReset;
    this.onBack = onBack;
    this.onMusicToggle = onMusicToggle;
    this.onSfxToggle = onSfxToggle;
    this.onMusicVolumeChange = onMusicVolumeChange;
    this.onSfxVolumeChange = onSfxVolumeChange;
    this.onDebugToggle = onDebugToggle;
    this.onSpeedChange = onSpeedChange;
    this.onUiClick = onUiClick;

    this.root = null;
    this.speedButtons = [];
  }

  mount(parent) {
    this.root = document.createElement('section');
    this.root.className = 'panel-card controls-card';
    this.root.innerHTML = `
      <div class="controls-row controls-primary">
        <button class="primary-button" data-action="play">${renderIcon('play')}<span>Play</span></button>
        <button class="secondary-button" data-action="pause">${renderIcon('pause')}<span>Pause</span></button>
        <button class="secondary-button" data-action="reset">${renderIcon('reset')}<span>Reset</span></button>
        <button class="ghost-button" data-action="back">${renderIcon('back')}<span>Back to Setup</span></button>
      </div>
      <div class="controls-row controls-secondary">
        <div class="speed-group">
          <span class="controls-label">${renderIcon('speed')}<strong>Simulation Speed</strong></span>
          <button class="chip-button" data-speed="1">x1</button>
          <button class="chip-button" data-speed="10">x10</button>
          <button class="chip-button" data-speed="60">x60</button>
          <button class="chip-button" data-speed="600">x600</button>
        </div>
        <div class="audio-controls">
          <button class="ghost-button" data-action="music-toggle">${renderIcon('music')}<span>Music ON</span></button>
          <button class="ghost-button" data-action="sfx-toggle">${renderIcon('sfx')}<span>SFX ON</span></button>
          <label class="slider-row">
            <span>Music</span>
            <input type="range" min="0" max="100" value="68" data-action="music-volume" />
          </label>
          <label class="slider-row">
            <span>SFX</span>
            <input type="range" min="0" max="100" value="84" data-action="sfx-volume" />
          </label>
          <button class="ghost-button" data-action="debug-toggle">${renderIcon('debug')}<span>Debug</span></button>
        </div>
      </div>
    `;

    const clickAnd = (callback) => () => {
      this.onUiClick?.();
      callback?.();
    };

    this.root.querySelector('[data-action="play"]').addEventListener('click', clickAnd(this.onPlay));
    this.root.querySelector('[data-action="pause"]').addEventListener('click', clickAnd(this.onPause));
    this.root.querySelector('[data-action="reset"]').addEventListener('click', clickAnd(this.onReset));
    this.root.querySelector('[data-action="back"]').addEventListener('click', clickAnd(this.onBack));
    this.root.querySelector('[data-action="music-toggle"]').addEventListener('click', clickAnd(this.onMusicToggle));
    this.root.querySelector('[data-action="sfx-toggle"]').addEventListener('click', clickAnd(this.onSfxToggle));
    this.root.querySelector('[data-action="debug-toggle"]').addEventListener('click', clickAnd(this.onDebugToggle));

    this.speedButtons = [...this.root.querySelectorAll('[data-speed]')];

    for (const button of this.speedButtons) {
      button.addEventListener('click', clickAnd(() => this.onSpeedChange?.(Number(button.dataset.speed))));
    }

    this.root.querySelector('[data-action="music-volume"]').addEventListener('input', (event) => {
      this.onMusicVolumeChange?.(Number(event.currentTarget.value) / 100);
    });

    this.root.querySelector('[data-action="sfx-volume"]').addEventListener('input', (event) => {
      this.onSfxVolumeChange?.(Number(event.currentTarget.value) / 100);
    });

    parent.appendChild(this.root);
  }

  setSpeed(multiplier) {
    for (const button of this.speedButtons) {
      button.classList.toggle('is-active', Number(button.dataset.speed) === multiplier);
    }
  }

  setAudioState(audioState) {
    if (!this.root || !audioState) {
      return;
    }

    const musicButton = this.root.querySelector('[data-action="music-toggle"]');
    const sfxButton = this.root.querySelector('[data-action="sfx-toggle"]');
    const musicSlider = this.root.querySelector('[data-action="music-volume"]');
    const sfxSlider = this.root.querySelector('[data-action="sfx-volume"]');

    musicButton.querySelector('span').textContent = audioState.musicEnabled ? 'Music ON' : 'Music OFF';
    musicButton.classList.toggle('is-active', audioState.musicEnabled);
    sfxButton.querySelector('span').textContent = audioState.sfxEnabled ? 'SFX ON' : 'SFX OFF';
    sfxButton.classList.toggle('is-active', audioState.sfxEnabled);
    musicSlider.value = Math.round((audioState.musicVolume ?? 0.68) * 100);
    sfxSlider.value = Math.round((audioState.sfxVolume ?? 0.84) * 100);
  }

  destroy() {
    this.root?.remove();
    this.root = null;
    this.speedButtons = [];
  }
}
