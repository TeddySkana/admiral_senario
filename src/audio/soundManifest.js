import { withBasePath } from '../utils/assets.js';

const FREESOUND_BASE = {
  sfx: withBasePath('audio/sfx'),
  ambient: withBasePath('audio/ambient'),
  music: withBasePath('audio/music'),
};

const manifest = {
  sfx: {
    uiClick: {
      src: [`${FREESOUND_BASE.sfx}/ui-click.mp3`],
      volume: 0.32,
      pool: 12,
    },
    alarmSuspicious: {
      src: [`${FREESOUND_BASE.sfx}/alert-suspicious.mp3`],
      volume: 0.5,
      pool: 8,
    },
    alarmEnemy: {
      src: [`${FREESOUND_BASE.sfx}/alert-enemy.mp3`],
      volume: 0.78,
      pool: 6,
    },
    interceptStarted: {
      src: [`${FREESOUND_BASE.sfx}/intercept-assigned.mp3`],
      volume: 0.58,
      pool: 8,
    },
    weaponFire: {
      src: [`${FREESOUND_BASE.sfx}/weapon-fire.mp3`],
      volume: 0.62,
      pool: 12,
      spatial: true,
    },
    impactHit: {
      src: [`${FREESOUND_BASE.sfx}/impact-hit.mp3`],
      volume: 0.54,
      pool: 10,
      spatial: true,
    },
    explosion: {
      src: [`${FREESOUND_BASE.sfx}/explosion.mp3`],
      volume: 0.68,
      pool: 10,
      spatial: true,
    },
    interceptionSuccess: {
      src: [`${FREESOUND_BASE.sfx}/intercept-success.mp3`],
      volume: 0.46,
      pool: 8,
    },
  },
  ambient: {
    ambientSea: {
      src: [`${FREESOUND_BASE.ambient}/sea-loop.mp3`],
      volume: 0.28,
      loop: true,
      pool: 1,
    },
  },
  music: {
    seasphereTheme: {
      src: [`${FREESOUND_BASE.music}/seasphere-theme.mp3`],
      volume: 0.34,
      loop: true,
      pool: 1,
    },
  },
};

export function getSoundManifest() {
  return manifest;
}
