import {
  clamp,
  headingToPoint,
  headingToVector,
  normalizeAngleDeg,
  normalizeVector,
} from '../utils/math.js';
import {
  knotsToMetersPerSecond,
  metersPerSecondToKnots,
  metersToNauticalMiles,
  nauticalMilesToMeters,
} from '../utils/units.js';

function shortestAngleDeltaDeg(from, to) {
  return ((to - from + 540) % 360) - 180;
}

function nearestPointOnSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = (dx * dx) + (dy * dy);

  if (lengthSquared === 0) {
    return { ...start };
  }

  const t = clamp((((point.x - start.x) * dx) + ((point.y - start.y) * dy)) / lengthSquared, 0, 1);
  return {
    x: start.x + (dx * t),
    y: start.y + (dy * t),
  };
}

function distancePointToSegment(point, start, end) {
  const nearest = nearestPointOnSegment(point, start, end);
  return Math.hypot(point.x - nearest.x, point.y - nearest.y);
}

export function distanceBetweenCapsules(a, b) {
  return Math.min(
    distancePointToSegment(a.startPointMeters, b.startPointMeters, b.endPointMeters),
    distancePointToSegment(a.endPointMeters, b.startPointMeters, b.endPointMeters),
    distancePointToSegment(b.startPointMeters, a.startPointMeters, a.endPointMeters),
    distancePointToSegment(b.endPointMeters, a.startPointMeters, a.endPointMeters),
  ) - ((a.widthMeters + b.widthMeters) * 0.5);
}

export function createOffshoreMotionState({
  headingDeg,
  speedKnots,
  maxSpeedKnots,
  lengthMeters,
  widthMeters,
  positionMeters,
  accelerationMps2,
  brakingMps2,
  turnRateDegPerSec,
}) {
  const velocity = headingToVector(headingDeg);
  const speedMps = knotsToMetersPerSecond(speedKnots);

  return {
    xMeters: positionMeters.x,
    yMeters: positionMeters.y,
    prevXMeters: positionMeters.x,
    prevYMeters: positionMeters.y,
    headingDeg,
    prevHeadingDeg: headingDeg,
    desiredHeadingDeg: headingDeg,
    speedKnots,
    desiredSpeedKnots: speedKnots,
    maxSpeedKnots,
    velocityXMps: velocity.x * speedMps,
    velocityYMps: velocity.y * speedMps,
    driftXMps: 0,
    driftYMps: 0,
    angularVelocityDegPerSec: 0,
    accelerationMps2,
    brakingMps2,
    turnRateDegPerSec,
    lengthMeters,
    widthMeters,
    x: metersToNauticalMiles(positionMeters.x),
    y: metersToNauticalMiles(positionMeters.y),
    prevX: metersToNauticalMiles(positionMeters.x),
    prevY: metersToNauticalMiles(positionMeters.y),
    courseDeg: headingDeg,
    prevCourseDeg: headingDeg,
    startPointMeters: { ...positionMeters },
    endPointMeters: { ...positionMeters },
    startPointNm: { x: metersToNauticalMiles(positionMeters.x), y: metersToNauticalMiles(positionMeters.y) },
    endPointNm: { x: metersToNauticalMiles(positionMeters.x), y: metersToNauticalMiles(positionMeters.y) },
  };
}

export function syncOffshoreVesselGeometry(entity) {
  const forward = headingToVector(entity.headingDeg);
  const halfLength = entity.lengthMeters * 0.5;

  entity.startPointMeters = {
    x: entity.xMeters + (forward.x * halfLength),
    y: entity.yMeters + (forward.y * halfLength),
  };
  entity.endPointMeters = {
    x: entity.xMeters - (forward.x * halfLength),
    y: entity.yMeters - (forward.y * halfLength),
  };
  entity.x = metersToNauticalMiles(entity.xMeters);
  entity.y = metersToNauticalMiles(entity.yMeters);
  entity.startPointNm = {
    x: metersToNauticalMiles(entity.startPointMeters.x),
    y: metersToNauticalMiles(entity.startPointMeters.y),
  };
  entity.endPointNm = {
    x: metersToNauticalMiles(entity.endPointMeters.x),
    y: metersToNauticalMiles(entity.endPointMeters.y),
  };
}

export function saveOffshorePreviousTransform(entity) {
  entity.prevXMeters = entity.xMeters;
  entity.prevYMeters = entity.yMeters;
  entity.prevHeadingDeg = entity.headingDeg;
  entity.prevCourseDeg = entity.courseDeg ?? entity.headingDeg;
  entity.prevX = entity.x;
  entity.prevY = entity.y;
}

export function setOffshoreDesiredMotion(entity, headingDeg, speedKnots) {
  entity.desiredHeadingDeg = normalizeAngleDeg(headingDeg);
  entity.desiredSpeedKnots = clamp(speedKnots, 0, entity.maxSpeedKnots);
}

export function getWaveSpeedFactor(entityHeadingDeg, waveDirectionDeg) {
  const delta = Math.abs(shortestAngleDeltaDeg(waveDirectionDeg, entityHeadingDeg));
  return 1 - (0.5 * (delta / 180));
}

export function applyOffshoreMotion(entity, dtSec, environment, options = {}) {
  const maxTurnDelta = entity.turnRateDegPerSec * dtSec;
  const angleDelta = shortestAngleDeltaDeg(entity.headingDeg, entity.desiredHeadingDeg);
  const actualTurn = clamp(angleDelta, -maxTurnDelta, maxTurnDelta);
  entity.headingDeg = normalizeAngleDeg(entity.headingDeg + actualTurn);
  entity.angularVelocityDegPerSec = dtSec > 0 ? actualTurn / dtSec : 0;

  const waveFactor = getWaveSpeedFactor(entity.headingDeg, environment.waveDirectionDeg ?? 0);
  const seaStateFactor = environment.seaState >= 4 ? 0.2 : 1;
  const maxAllowedKnots = entity.maxSpeedKnots * waveFactor * seaStateFactor;
  const desiredSpeedKnots = Math.min(entity.desiredSpeedKnots, maxAllowedKnots);
  const desiredSpeedMps = knotsToMetersPerSecond(desiredSpeedKnots);
  const currentSpeedMps = Math.hypot(entity.velocityXMps, entity.velocityYMps);
  const deltaSpeed = desiredSpeedMps - currentSpeedMps;
  const maxSpeedDelta = (deltaSpeed >= 0 ? entity.accelerationMps2 : entity.brakingMps2) * dtSec;
  const nextSpeedMps = currentSpeedMps + clamp(deltaSpeed, -Math.abs(maxSpeedDelta), Math.abs(maxSpeedDelta));

  const headingVector = headingToVector(entity.headingDeg);
  const windVector = headingToVector(environment.windDirectionDeg ?? 0);
  const driftTargetXMps = windVector.x * knotsToMetersPerSecond(environment.windKnots ?? 0) * (options.windDriftFactor ?? 0.05);
  const driftTargetYMps = windVector.y * knotsToMetersPerSecond(environment.windKnots ?? 0) * (options.windDriftFactor ?? 0.05);
  const waveDriftXMps = windVector.x * (environment.waveHeightMeters ?? 0) * (options.waveDriftFactor ?? 0.02);
  const waveDriftYMps = windVector.y * (environment.waveHeightMeters ?? 0) * (options.waveDriftFactor ?? 0.02);

  entity.driftXMps += (driftTargetXMps + waveDriftXMps - entity.driftXMps) * Math.min(1, dtSec * 0.65);
  entity.driftYMps += (driftTargetYMps + waveDriftYMps - entity.driftYMps) * Math.min(1, dtSec * 0.65);

  entity.velocityXMps = (headingVector.x * nextSpeedMps) + entity.driftXMps;
  entity.velocityYMps = (headingVector.y * nextSpeedMps) + entity.driftYMps;
  entity.xMeters += entity.velocityXMps * dtSec;
  entity.yMeters += entity.velocityYMps * dtSec;
  entity.speedKnots = metersPerSecondToKnots(Math.hypot(entity.velocityXMps, entity.velocityYMps));
  entity.courseDeg = headingToPoint({ x: 0, y: 0 }, normalizeVector({
    x: entity.velocityXMps,
    y: entity.velocityYMps,
  }));

  syncOffshoreVesselGeometry(entity);
  return metersToNauticalMiles(Math.hypot(entity.velocityXMps, entity.velocityYMps) * dtSec);
}

export function metersPointToNm(point) {
  return {
    x: metersToNauticalMiles(point.x),
    y: metersToNauticalMiles(point.y),
  };
}

export function nauticalPointToMeters(point) {
  return {
    x: nauticalMilesToMeters(point.x),
    y: nauticalMilesToMeters(point.y),
  };
}
