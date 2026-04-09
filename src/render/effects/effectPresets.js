export function createExplosionConfig(x, y) {
  return {
    alpha: {
      list: [
        { value: 0.98, time: 0 },
        { value: 0, time: 1 },
      ],
      isStepped: false,
    },
    scale: {
      list: [
        { value: 0.28, time: 0 },
        { value: 1.3, time: 1 },
      ],
      isStepped: false,
    },
    color: {
      list: [
        { value: 'fff4b8', time: 0 },
        { value: 'ff9b54', time: 0.35 },
        { value: '622816', time: 1 },
      ],
      isStepped: false,
    },
    speed: {
      list: [
        { value: 180, time: 0 },
        { value: 22, time: 1 },
      ],
      isStepped: false,
    },
    startRotation: { min: 0, max: 360 },
    rotationSpeed: { min: 0, max: 120 },
    lifetime: { min: 0.35, max: 0.7 },
    frequency: 0.004,
    emitterLifetime: 0.12,
    maxParticles: 90,
    pos: { x, y },
    addAtBack: false,
    spawnType: 'circle',
    spawnCircle: { x: 0, y: 0, r: 12 },
  };
}

export function createSmokeConfig(x, y, intensity = 0.7) {
  return {
    alpha: {
      list: [
        { value: 0.2 + (intensity * 0.15), time: 0 },
        { value: 0, time: 1 },
      ],
      isStepped: false,
    },
    scale: {
      list: [
        { value: 0.28, time: 0 },
        { value: 1.2 + (intensity * 0.4), time: 1 },
      ],
      isStepped: false,
    },
    color: {
      list: [
        { value: '7b8288', time: 0 },
        { value: '383f46', time: 1 },
      ],
      isStepped: false,
    },
    speed: {
      list: [
        { value: 24 + (intensity * 12), time: 0 },
        { value: 8, time: 1 },
      ],
      isStepped: false,
    },
    acceleration: { x: 0, y: -10 },
    startRotation: { min: 0, max: 360 },
    rotationSpeed: { min: -25, max: 25 },
    lifetime: { min: 1.3, max: 2.3 },
    frequency: Math.max(0.08, 0.18 - (intensity * 0.08)),
    emitterLifetime: -1,
    maxParticles: 80,
    pos: { x, y },
    addAtBack: false,
    spawnType: 'circle',
    spawnCircle: { x: 0, y: 0, r: 5 + (intensity * 4) },
  };
}

export function createSplashConfig(x, y) {
  return {
    alpha: {
      list: [
        { value: 0.82, time: 0 },
        { value: 0, time: 1 },
      ],
      isStepped: false,
    },
    scale: {
      list: [
        { value: 0.16, time: 0 },
        { value: 0.78, time: 1 },
      ],
      isStepped: false,
    },
    color: {
      list: [
        { value: 'f6ffff', time: 0 },
        { value: '84d4e8', time: 0.55 },
        { value: '2b6a7f', time: 1 },
      ],
      isStepped: false,
    },
    speed: {
      list: [
        { value: 120, time: 0 },
        { value: 18, time: 1 },
      ],
      isStepped: false,
    },
    startRotation: { min: 235, max: 305 },
    rotationSpeed: { min: 0, max: 0 },
    lifetime: { min: 0.25, max: 0.5 },
    frequency: 0.003,
    emitterLifetime: 0.09,
    maxParticles: 56,
    pos: { x, y },
    addAtBack: false,
    spawnType: 'burst',
    particlesPerWave: 16,
    particleSpacing: 0,
    angleStart: 0,
  };
}

export function createFlashConfig(x, y) {
  return {
    alpha: {
      list: [
        { value: 0.98, time: 0 },
        { value: 0, time: 1 },
      ],
      isStepped: false,
    },
    scale: {
      list: [
        { value: 0.18, time: 0 },
        { value: 0.48, time: 1 },
      ],
      isStepped: false,
    },
    color: {
      list: [
        { value: 'fff5be', time: 0 },
        { value: 'ff9b54', time: 1 },
      ],
      isStepped: false,
    },
    speed: {
      list: [
        { value: 42, time: 0 },
        { value: 6, time: 1 },
      ],
      isStepped: false,
    },
    startRotation: { min: 0, max: 360 },
    rotationSpeed: { min: 0, max: 0 },
    lifetime: { min: 0.1, max: 0.18 },
    frequency: 0.002,
    emitterLifetime: 0.04,
    maxParticles: 20,
    pos: { x, y },
    addAtBack: false,
    spawnType: 'circle',
    spawnCircle: { x: 0, y: 0, r: 3 },
  };
}
