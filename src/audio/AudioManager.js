import { Howl, Howler } from 'howler';
import { getSoundManifest } from './soundManifest.js';

const STORAGE_KEY = 'skana-audio-state';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function loadState() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return null;
    }

    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveState(state) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Session persistence is best-effort.
  }
}

export class AudioManager {
  constructor(eventBus, config) {
    this.eventBus = eventBus;
    this.config = config;
    this.manifest = getSoundManifest();
    this.sfx = new Map();
    this.ambient = new Map();
    this.music = new Map();
    this.activeAmbientIds = new Map();
    this.currentMusicName = null;
    this.currentMusicId = null;
    this.screenActive = false;
    this.unsubscribers = [];
    this.state = {
      musicEnabled: true,
      sfxEnabled: true,
      musicVolume: 0.68,
      sfxVolume: 0.84,
      currentMusic: 'seasphereTheme',
      ...loadState(),
    };

    Howler.autoUnlock = true;
    Howler.volume(1);

    this.initializeHowls();
    this.bindEvents();
    this.emitState();
  }

  initializeHowls() {
    for (const [name, config] of Object.entries(this.manifest.sfx)) {
      this.sfx.set(name, {
        config,
        howl: new Howl({
          src: config.src,
          volume: config.volume,
          pool: config.pool ?? 8,
          preload: true,
        }),
      });
    }

    for (const [name, config] of Object.entries(this.manifest.ambient)) {
      this.ambient.set(name, {
        config,
        howl: new Howl({
          src: config.src,
          volume: config.volume,
          loop: true,
          pool: 1,
          preload: true,
        }),
      });
    }

    for (const [name, config] of Object.entries(this.manifest.music)) {
      this.music.set(name, {
        config,
        howl: new Howl({
          src: config.src,
          volume: config.volume,
          loop: true,
          pool: 1,
          preload: true,
        }),
      });
    }
  }

  getDefaultMusicName() {
    if (this.state.currentMusic && this.music.has(this.state.currentMusic)) {
      return this.state.currentMusic;
    }

    return this.music.keys().next().value ?? null;
  }

  bindEvents() {
    this.unsubscribers.push(
      this.eventBus.on('vessel-suspicious', () => this.playSfx('alarmSuspicious')),
      this.eventBus.on('vessel-enemy', () => this.playSfx('alarmEnemy')),
      this.eventBus.on('vessel-target', () => this.playSfx('alarmEnemy')),
      this.eventBus.on('interceptor-assigned', () => this.playSfx('interceptStarted')),
      this.eventBus.on('interceptor-reassigned', () => this.playSfx('interceptStarted')),
      this.eventBus.on('weapon-fired', (event) => this.playSfx('weaponFire', { position: { x: event.x, y: event.y } })),
      this.eventBus.on('impact', (event) => this.playSfx('impactHit', { position: { x: event.x, y: event.y } })),
      this.eventBus.on('vessel-neutralized', (event) => this.playSfx('explosion', { position: { x: event.x, y: event.y } })),
      this.eventBus.on('interception-success', () => this.playSfx('interceptionSuccess')),
      this.eventBus.on('ui-click', () => this.playSfx('uiClick', { volumeMultiplier: 0.8 })),
    );
  }

  computePan(position) {
    if (!position || !Number.isFinite(position.x) || !this.config?.world?.widthNm) {
      return 0;
    }

    return clamp(((position.x / this.config.world.widthNm) * 2) - 1, -1, 1);
  }

  persist() {
    saveState(this.state);
    this.emitState();
  }

  emitState() {
    this.eventBus.emit('audio-state-changed', this.getState());
  }

  getState() {
    return {
      ...this.state,
      screenActive: this.screenActive,
    };
  }

  playSfx(name, options = {}) {
    if (!this.state.sfxEnabled) {
      return null;
    }

    const entry = this.sfx.get(name);

    if (!entry) {
      return null;
    }

    const id = entry.howl.play();
    const volume = entry.config.volume * this.state.sfxVolume * (options.volumeMultiplier ?? 1);
    entry.howl.volume(volume, id);

    if (entry.config.spatial) {
      entry.howl.stereo(this.computePan(options.position), id);
    }

    if (options.rate) {
      entry.howl.rate(options.rate, id);
    }

    return id;
  }

  playAmbient(name) {
    if (!this.state.sfxEnabled || this.activeAmbientIds.has(name)) {
      return;
    }

    const entry = this.ambient.get(name);

    if (!entry) {
      return;
    }

    const id = entry.howl.play();
    entry.howl.volume(entry.config.volume * this.state.sfxVolume, id);
    this.activeAmbientIds.set(name, id);
  }

  stopAmbient(name) {
    if (name) {
      const id = this.activeAmbientIds.get(name);
      const entry = this.ambient.get(name);

      if (entry && id != null) {
        entry.howl.stop(id);
      }

      this.activeAmbientIds.delete(name);
      return;
    }

    for (const [ambientName, id] of this.activeAmbientIds.entries()) {
      this.ambient.get(ambientName)?.howl.stop(id);
    }

    this.activeAmbientIds.clear();
  }

  playMusic(name = this.getDefaultMusicName()) {
    this.state.currentMusic = name ?? this.state.currentMusic;

    if (!this.state.musicEnabled) {
      this.persist();
      return;
    }

    if (this.currentMusicName === name && this.currentMusicId != null) {
      return;
    }

    this.stopMusic();

    const entry = this.music.get(name);

    if (!entry) {
      return;
    }

    this.currentMusicName = name;
    this.currentMusicId = entry.howl.play();
    entry.howl.volume(entry.config.volume * this.state.musicVolume, this.currentMusicId);
    this.persist();
  }

  stopMusic() {
    if (!this.currentMusicName || this.currentMusicId == null) {
      this.currentMusicName = null;
      this.currentMusicId = null;
      return;
    }

    this.music.get(this.currentMusicName)?.howl.stop(this.currentMusicId);
    this.currentMusicName = null;
    this.currentMusicId = null;
  }

  enterSimulation() {
    this.screenActive = true;
    this.playAmbient('ambientSea');

    if (this.state.musicEnabled) {
      this.playMusic(this.getDefaultMusicName());
    } else {
      this.persist();
    }
  }

  leaveSimulation() {
    this.screenActive = false;
    this.stopAmbient();
    this.stopMusic();
    this.persist();
  }

  toggleMusic() {
    const wasEnabled = this.state.musicEnabled;

    if (wasEnabled && this.state.sfxEnabled) {
      this.playSfx('uiClick', { volumeMultiplier: 0.7 });
    }

    this.setMusicEnabled(!this.state.musicEnabled);

    if (!wasEnabled && this.state.musicEnabled) {
      this.playSfx('uiClick', { volumeMultiplier: 0.7 });
    }
  }

  toggleSfx() {
    const nextValue = !this.state.sfxEnabled;

    if (nextValue) {
      this.state.sfxEnabled = true;
      this.playAmbient('ambientSea');
      this.playSfx('uiClick', { volumeMultiplier: 0.8 });
      this.persist();
      return;
    }

    this.playSfx('uiClick', { volumeMultiplier: 0.8 });
    this.state.sfxEnabled = false;
    this.stopAmbient();
    this.persist();
  }

  setMusicEnabled(enabled) {
    this.state.musicEnabled = Boolean(enabled);

    if (!this.state.musicEnabled) {
      this.stopMusic();
    } else if (this.screenActive) {
      this.playMusic(this.state.currentMusic);
    }

    this.persist();
  }

  setSfxEnabled(enabled) {
    this.state.sfxEnabled = Boolean(enabled);

    if (!this.state.sfxEnabled) {
      this.stopAmbient();
    } else if (this.screenActive) {
      this.playAmbient('ambientSea');
    }

    this.persist();
  }

  setMusicVolume(value) {
    this.state.musicVolume = clamp(Number(value), 0, 1);

    if (this.currentMusicName && this.currentMusicId != null) {
      const entry = this.music.get(this.currentMusicName);
      entry?.howl.volume(entry.config.volume * this.state.musicVolume, this.currentMusicId);
    }

    this.persist();
  }

  setSfxVolume(value) {
    this.state.sfxVolume = clamp(Number(value), 0, 1);

    for (const [name, id] of this.activeAmbientIds.entries()) {
      const entry = this.ambient.get(name);
      entry?.howl.volume(entry.config.volume * this.state.sfxVolume, id);
    }

    this.persist();
  }

  destroy() {
    this.leaveSimulation();
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers = [];

    for (const entry of [...this.sfx.values(), ...this.ambient.values(), ...this.music.values()]) {
      entry.howl.unload();
    }
  }
}
