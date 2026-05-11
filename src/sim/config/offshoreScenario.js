import {
  hoursToSeconds,
  minutesToSeconds,
  nauticalMilesToMeters,
  yardsToMeters,
  yardsToNauticalMiles,
} from '../utils/units.js';

export const defaultOffshoreScenario = {
  meta: {
    scenarioId: 'offshore-rig',
    mode: 'offshore',
    title: 'Offshore Rig Protection',
    subtitle: 'Protect strategic offshore infrastructure',
  },
  simulation: {
    initialSpeedMultiplier: 1,
    fixedStepSeconds: 1 / 20,
    missionDurationHours: 11,
    reserveAvailableAfterMinutes: 5,
    destroyedThreatRetentionSeconds: 60,
  },
  world: {
    widthNm: 20,
    heightNm: 20,
    coastlineXNm: 32,
    westBorderXNm: 0,
    northBorderYNm: 0,
    southBorderYNm: 20,
    rigDistanceFromShoreNm: 32,
    rigPositionNm: {
      x: 10,
      y: 10,
    },
    safetyRadiusYards: 500,
    dynamicPatrolRadiusYards: 3000,
    threatSpawnRadiusYardsMin: 14000,
    threatSpawnRadiusYardsMax: 18500,
  },
  environment: {
    seaState: 1,
    waveHeightMeters: 0,
    windKnots: 1,
    windDirectionDeg: 45,
    waveDirectionDeg: 0,
    opticalMode: 'day',
  },
  ownForces: {
    platformLabel: 'Skana USV',
    vesselClass: 'small',
    lengthMeters: 6,
    widthMeters: 2,
    heightMeters: 2,
    weightKg: 1600,
    payloadKg: 600,
    fuelLiters: 1000,
    enduranceHours: 11,
    maxSpeedKnots: 50,
    cruiseSpeedKnots: 22,
    maximumRangeNm: 300,
    fuelBurnLitersPerHourAtCruise: 40,
    navigation: 'Protected GPS',
    weapon: {
      name: 'MAG',
      mount: 'Bow mounted',
      traverseDegreesPerSide: 300,
      rangeYards: 2000,
      effectiveSpeedMinKnots: 7,
      effectiveSpeedMaxKnots: 12,
      hitProbability: 0.5,
      cadenceSeconds: 3,
    },
  },
  sensors: {
    detectionSystemLabel: 'Rig Detection Array',
    vesselClasses: {
      small: {
        maxLengthMeters: 12,
        radarDetectionYards: 12000,
        dayCamera: {
          detectionYards: 7000,
          recognitionYards: 6000,
          identificationYards: 4000,
        },
        nightCamera: {
          detectionYards: 5000,
          recognitionYards: 4000,
          identificationYards: 2000,
        },
      },
      medium: {
        maxLengthMeters: null,
        radarDetectionYards: null,
        dayCamera: {
          detectionYards: null,
          recognitionYards: null,
          identificationYards: null,
        },
        nightCamera: {
          detectionYards: null,
          recognitionYards: null,
          identificationYards: null,
        },
      },
      large: {
        maxLengthMeters: null,
        radarDetectionYards: null,
        dayCamera: {
          detectionYards: null,
          recognitionYards: null,
          identificationYards: null,
        },
        nightCamera: {
          detectionYards: null,
          recognitionYards: null,
          identificationYards: null,
        },
      },
    },
  },
  threats: {
    countMin: 2,
    countMax: 2,
    initialApproachSpeedKnots: 5,
    attackSpeedKnots: 45,
    evasiveSpeedKnots: 20,
    zigzagProbability: 0.8,
    zigzagAngleDeg: 30,
    zigzagLegSeconds: 18,
    classLabel: 'Fast Boat',
    loiterAngularSpeedDegPerSec: 4,
    synchronizedAttackWindowMinutes: {
      min: 5,
      max: 15,
    },
    staggeredAttackWindowsMinutes: {
      firstMin: 5,
      firstMax: 10,
      secondMin: 15,
      secondMax: 20,
    },
  },
  physics: {
    accelerationMps2: 0.23,
    brakingMps2: 0.3,
    turnRateDegPerSec: 18,
    threatTurnRateDegPerSec: 24,
    windDriftFactor: 0.05,
    waveDriftFactor: 0.02,
    dynamicPatrolClockwise: true,
    interceptStandOffYards: 500,
    collisionDistanceMeters: 18,
  },
  randomSeed: 'skana-offshore-rig',
};

export function cloneOffshoreScenarioConfig(config = defaultOffshoreScenario) {
  return JSON.parse(JSON.stringify(config));
}

export function isOffshoreScenario(config) {
  return config?.meta?.scenarioId === 'offshore-rig' || config?.meta?.mode === 'offshore';
}

export function deriveOffshoreGeometry(config) {
  const rig = {
    ...config.world.rigPositionNm,
    label: 'Strategic Rig',
  };
  const safetyRadiusNm = yardsToNauticalMiles(config.world.safetyRadiusYards);
  const dynamicPatrolRadiusNm = yardsToNauticalMiles(config.world.dynamicPatrolRadiusYards);
  const weaponRangeNm = yardsToNauticalMiles(config.ownForces.weapon.rangeYards);
  const detectionProfile = config.sensors.vesselClasses.small;
  const opticalProfile = config.environment.opticalMode === 'night'
    ? detectionProfile.nightCamera
    : detectionProfile.dayCamera;

  return {
    scenarioType: 'offshore',
    widthNm: config.world.widthNm,
    heightNm: config.world.heightNm,
    coastlineXNm: config.world.coastlineXNm,
    westBorderXNm: config.world.westBorderXNm,
    northBorderYNm: config.world.northBorderYNm,
    southBorderYNm: config.world.southBorderYNm,
    rig,
    protectedAreaRadiusNm: safetyRadiusNm,
    dynamicPatrolRadiusNm,
    patrolLines: {},
    fishingPolygon: [],
    shippingLane: {
      westXNm: 0,
      eastXNm: 0,
      northYNm: 0,
      southYNm: 0,
    },
    patrolRings: [
      {
        key: 'security',
        label: '500 yd Security Ring',
        radiusNm: safetyRadiusNm,
      },
      {
        key: 'dynamic',
        label: '3000 yd Dynamic Ring',
        radiusNm: dynamicPatrolRadiusNm,
      },
    ],
    sensorRangesNm: {
      radar: yardsToNauticalMiles(detectionProfile.radarDetectionYards),
      opticalDetection: yardsToNauticalMiles(opticalProfile.detectionYards),
      opticalRecognition: yardsToNauticalMiles(opticalProfile.recognitionYards),
      opticalIdentification: yardsToNauticalMiles(opticalProfile.identificationYards),
      weapon: weaponRangeNm,
    },
    operationalAreaPolygon: [
      { x: config.world.westBorderXNm, y: config.world.northBorderYNm },
      { x: config.world.coastlineXNm, y: config.world.northBorderYNm },
      { x: config.world.coastlineXNm, y: config.world.southBorderYNm },
      { x: config.world.westBorderXNm, y: config.world.southBorderYNm },
    ],
  };
}

export function getOffshoreMissionDurationSeconds(config) {
  return hoursToSeconds(config.simulation.missionDurationHours);
}

export function getReserveActivationSeconds(config) {
  return minutesToSeconds(config.simulation.reserveAvailableAfterMinutes);
}

export function getOffshoreDerivedMetrics(config) {
  return {
    safetyRadiusMeters: yardsToMeters(config.world.safetyRadiusYards),
    dynamicPatrolRadiusMeters: yardsToMeters(config.world.dynamicPatrolRadiusYards),
    threatSpawnRadiusMinMeters: yardsToMeters(config.world.threatSpawnRadiusYardsMin),
    threatSpawnRadiusMaxMeters: yardsToMeters(config.world.threatSpawnRadiusYardsMax),
    rigDistanceFromShoreMeters: nauticalMilesToMeters(config.world.rigDistanceFromShoreNm),
    weaponRangeMeters: yardsToMeters(config.ownForces.weapon.rangeYards),
  };
}
