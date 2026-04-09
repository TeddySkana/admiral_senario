import {
  angleBetweenVectors,
  clamp,
  degToRad,
  distanceBetween,
  dot,
  headingToPoint,
  headingToVector,
  normalizeAngleDeg,
  vectorLength,
  vectorToHeading,
} from './math.js';
import { knotsToNmPerSecond } from './units.js';

export function nmPerSecondToKnots(value) {
  return value * 3600;
}

export function shortestAngleDeltaDeg(from, to) {
  return ((to - from + 540) % 360) - 180;
}

export function rotateTowardAngleDeg(current, target, maxDeltaDeg) {
  const delta = shortestAngleDeltaDeg(current, target);

  if (Math.abs(delta) <= maxDeltaDeg) {
    return normalizeAngleDeg(target);
  }

  return normalizeAngleDeg(current + clamp(delta, -maxDeltaDeg, maxDeltaDeg));
}

function normalizeVelocity(vector, maxMagnitude) {
  const length = vectorLength(vector);

  if (length <= maxMagnitude || length === 0) {
    return vector;
  }

  const scale = maxMagnitude / length;
  return {
    x: vector.x * scale,
    y: vector.y * scale,
  };
}

function ensureMotionSnapshot(entity) {
  if (entity.prevX == null) {
    entity.prevX = entity.x;
    entity.prevY = entity.y;
    entity.prevHeadingDeg = entity.headingDeg;
    entity.prevCourseDeg = entity.courseDeg ?? entity.headingDeg;
  }
}

export function createMotionProfile({
  speedKnots,
  headingDeg,
  maxSpeedKnots,
  accelerationNmPerSec2,
  decelerationNmPerSec2,
  turnRateDegPerSec,
  forwardDragPerSec,
  lateralDragPerSec,
  turnDriftFactor,
}) {
  const forward = headingToVector(headingDeg);
  const speedNmPerSec = knotsToNmPerSecond(speedKnots);

  return {
    prevX: null,
    prevY: null,
    prevHeadingDeg: headingDeg,
    prevCourseDeg: headingDeg,
    velocityXNmPerSec: forward.x * speedNmPerSec,
    velocityYNmPerSec: forward.y * speedNmPerSec,
    angularVelocityDegPerSec: 0,
    desiredHeadingDeg: headingDeg,
    desiredSpeedKnots: speedKnots,
    maxSpeedKnots,
    accelerationNmPerSec2,
    decelerationNmPerSec2,
    turnRateDegPerSec,
    forwardDragPerSec,
    lateralDragPerSec,
    turnDriftFactor,
    courseDeg: headingDeg,
  };
}

export function savePreviousTransform(entity) {
  ensureMotionSnapshot(entity);
  entity.prevX = entity.x;
  entity.prevY = entity.y;
  entity.prevHeadingDeg = entity.headingDeg;
  entity.prevCourseDeg = entity.courseDeg ?? entity.headingDeg;
}

export function setDesiredMotion(entity, headingDeg, speedKnots) {
  entity.desiredHeadingDeg = normalizeAngleDeg(headingDeg);
  entity.desiredSpeedKnots = clamp(speedKnots, 0, entity.maxSpeedKnots);
}

export function stepEntityKinematics(entity, dtSec) {
  ensureMotionSnapshot(entity);

  const maxTurnDeltaDeg = entity.turnRateDegPerSec * dtSec;
  const previousHeading = entity.headingDeg;
  entity.headingDeg = rotateTowardAngleDeg(entity.headingDeg, entity.desiredHeadingDeg, maxTurnDeltaDeg);
  const actualTurnDeltaDeg = shortestAngleDeltaDeg(previousHeading, entity.headingDeg);
  entity.angularVelocityDegPerSec = dtSec > 0 ? actualTurnDeltaDeg / dtSec : 0;

  const forward = headingToVector(entity.headingDeg);
  const starboard = { x: forward.y, y: -forward.x };
  const velocity = {
    x: entity.velocityXNmPerSec,
    y: entity.velocityYNmPerSec,
  };

  let forwardSpeed = dot(velocity, forward);
  let lateralSpeed = dot(velocity, starboard);
  const desiredForwardSpeed = knotsToNmPerSecond(entity.desiredSpeedKnots);

  const maxForwardIncrease = entity.accelerationNmPerSec2 * dtSec;
  const maxForwardDecrease = entity.decelerationNmPerSec2 * dtSec;
  forwardSpeed += clamp(desiredForwardSpeed - forwardSpeed, -maxForwardDecrease, maxForwardIncrease);

  const turnRadians = degToRad(actualTurnDeltaDeg);
  lateralSpeed += turnRadians * Math.max(forwardSpeed, desiredForwardSpeed * 0.45) * entity.turnDriftFactor;
  lateralSpeed *= Math.max(0, 1 - (entity.lateralDragPerSec * dtSec));

  const forwardDragScale = entity.desiredSpeedKnots < 0.5
    ? Math.max(0, 1 - (entity.forwardDragPerSec * dtSec * 1.5))
    : Math.max(0, 1 - (entity.forwardDragPerSec * dtSec * 0.25));
  forwardSpeed *= forwardDragScale;

  let nextVelocity = {
    x: (forward.x * forwardSpeed) + (starboard.x * lateralSpeed),
    y: (forward.y * forwardSpeed) + (starboard.y * lateralSpeed),
  };
  nextVelocity = normalizeVelocity(nextVelocity, knotsToNmPerSecond(entity.maxSpeedKnots));

  entity.velocityXNmPerSec = nextVelocity.x;
  entity.velocityYNmPerSec = nextVelocity.y;
  entity.x += nextVelocity.x * dtSec;
  entity.y += nextVelocity.y * dtSec;

  const speedNmPerSec = vectorLength(nextVelocity);
  entity.speedKnots = nmPerSecondToKnots(speedNmPerSec);

  if (speedNmPerSec > 1e-5) {
    entity.courseDeg = vectorToHeading(nextVelocity.x, nextVelocity.y);
  } else {
    entity.courseDeg = entity.headingDeg;
  }

  return speedNmPerSec * dtSec;
}

export function steerEntityTowardPoint(entity, target, desiredSpeedKnots, dtSec, options = {}) {
  const distanceNm = distanceBetween(entity, target);

  if (distanceNm <= (options.arrivalRadiusNm ?? 0)) {
    setDesiredMotion(entity, entity.headingDeg, 0);
    return stepEntityKinematics(entity, dtSec);
  }

  let targetSpeedKnots = desiredSpeedKnots;

  if (options.arrivalDistanceNm) {
    const ratio = clamp(distanceNm / options.arrivalDistanceNm, options.minArrivalSpeedFactor ?? 0.28, 1);
    targetSpeedKnots = Math.max(1, desiredSpeedKnots * ratio);
  }

  setDesiredMotion(entity, headingToPoint(entity, target), targetSpeedKnots);
  return stepEntityKinematics(entity, dtSec);
}

export function steerEntityOnHeading(entity, headingDeg, desiredSpeedKnots, dtSec) {
  setDesiredMotion(entity, headingDeg, desiredSpeedKnots);
  return stepEntityKinematics(entity, dtSec);
}

export function getTurnSeverity(entity) {
  const headingVector = headingToVector(entity.headingDeg);
  const courseVector = headingToVector(entity.courseDeg ?? entity.headingDeg);
  return angleBetweenVectors(headingVector, courseVector);
}
