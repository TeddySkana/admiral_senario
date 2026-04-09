import { lerp } from '../utils/math.js';
import { yardsToNauticalMiles } from '../utils/units.js';

export const PATROL_LINE_KEYS = ['north', 'west', 'south'];

export const defaultScenario = {
  world: {
    widthNm: 24,
    heightNm: 18,
    coastlineXNm: 22,
    westBorderXNm: 4,
    northBorderYNm: 1.5,
    southBorderYNm: 16.5,
    shippingLaneWestXNm: 0.8,
    shippingLaneEastXNm: 3.1,
  },
  simulation: {
    initialSpeedMultiplier: 1,
    fixedStepSeconds: 1 / 20,
  },
  contacts: {
    fishingBoatCount: 9,
    cargoShipCount: 2,
  },
  dvora: {
    friendlyBoatCount: 3,
    friendlyBoatType: 'Dvora',
    maxSpeedKnots: 50,
    cruiseSpeedKnots: 17,
    maxOperationalRangeNm: 1200,
    engagementRangeNm: 7.5,
  },
  classification: {
    suspiciousSpeedThresholdKnots: 5,
    hostileHeadingDurationMinutes: 5,
    homeHeadingToleranceDegrees: 35,
    suspiciousEscalationThreshold: 10,
  },
  environment: {
    seaState: 1,
    waveHeightMeters: 0,
    windKnots: 1,
  },
  fishingZone: {
    depthNm: 2,
    northInsetNm: 3.5,
    southInsetNm: 3.5,
  },
  patrolOffsetsNm: {
    north: 1,
    west: 1,
    south: 1,
  },
  randomSeed: 'skana-admirals-one',
  spawnBehavior: {
    attackModeChancePerMinute: 0.08,
    fishingSpeedMinKnots: 2,
    fishingSpeedMaxKnots: 9,
    hostileSpeedMinKnots: 8,
    hostileSpeedMaxKnots: 14,
    cargoSpeedMinKnots: 12,
    cargoSpeedMaxKnots: 18,
    enableNeutralLaneTraffic: true,
  },
};

export function cloneScenarioConfig(config = defaultScenario) {
  return JSON.parse(JSON.stringify(config));
}

export function deriveScenarioGeometry(config) {
  const { world, fishingZone, patrolOffsetsNm } = config;
  const fishingWestXNm = Math.max(world.westBorderXNm + 1.5, world.coastlineXNm - fishingZone.depthNm);
  const fishingNorthYNm = world.northBorderYNm + fishingZone.northInsetNm;
  const fishingSouthYNm = world.southBorderYNm - fishingZone.southInsetNm;

  const fishingPolygon = [
    { x: fishingWestXNm, y: fishingNorthYNm },
    { x: world.coastlineXNm, y: fishingNorthYNm },
    { x: world.coastlineXNm, y: fishingSouthYNm },
    { x: fishingWestXNm, y: fishingSouthYNm },
  ];

  return {
    widthNm: world.widthNm,
    heightNm: world.heightNm,
    coastlineXNm: world.coastlineXNm,
    westBorderXNm: world.westBorderXNm,
    northBorderYNm: world.northBorderYNm,
    southBorderYNm: world.southBorderYNm,
    fishingPolygon,
    shippingLane: {
      westXNm: world.shippingLaneWestXNm,
      eastXNm: world.shippingLaneEastXNm,
      northYNm: 0.8,
      southYNm: world.heightNm - 0.8,
    },
    patrolLines: {
      north: {
        key: 'north',
        start: { x: world.westBorderXNm + 0.4, y: world.northBorderYNm + patrolOffsetsNm.north },
        end: { x: world.coastlineXNm - 0.4, y: world.northBorderYNm + patrolOffsetsNm.north },
      },
      west: {
        key: 'west',
        start: { x: world.westBorderXNm + patrolOffsetsNm.west, y: world.northBorderYNm + 0.4 },
        end: { x: world.westBorderXNm + patrolOffsetsNm.west, y: world.southBorderYNm - 0.4 },
      },
      south: {
        key: 'south',
        start: { x: world.coastlineXNm - 0.4, y: world.southBorderYNm - patrolOffsetsNm.south },
        end: { x: world.westBorderXNm + 0.4, y: world.southBorderYNm - patrolOffsetsNm.south },
      },
    },
    operationalAreaPolygon: [
      { x: world.westBorderXNm, y: world.northBorderYNm },
      { x: world.coastlineXNm, y: world.northBorderYNm },
      { x: world.coastlineXNm, y: world.southBorderYNm },
      { x: world.westBorderXNm, y: world.southBorderYNm },
    ],
  };
}

export function getEngagementRangeNm(config) {
  if (Number.isFinite(config?.dvora?.engagementRangeNm) && config.dvora.engagementRangeNm > 0) {
    return config.dvora.engagementRangeNm;
  }

  if (Number.isFinite(config?.dvora?.engagementRangeYards)) {
    return yardsToNauticalMiles(config.dvora.engagementRangeYards);
  }

  return 7.5;
}

export function getLinePoint(line, t) {
  return {
    x: lerp(line.start.x, line.end.x, t),
    y: lerp(line.start.y, line.end.y, t),
  };
}
