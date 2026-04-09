export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function lerp(start, end, amount) {
  return start + (end - start) * amount;
}

export function degToRad(degrees) {
  return (degrees * Math.PI) / 180;
}

export function radToDeg(radians) {
  return (radians * 180) / Math.PI;
}

export function normalizeAngleDeg(angle) {
  return ((angle % 360) + 360) % 360;
}

export function headingToVector(headingDeg) {
  const radians = degToRad(headingDeg);
  return {
    x: Math.sin(radians),
    y: -Math.cos(radians),
  };
}

export function vectorToHeading(x, y) {
  return normalizeAngleDeg(radToDeg(Math.atan2(x, -y)));
}

export function headingToPoint(from, to) {
  return vectorToHeading(to.x - from.x, to.y - from.y);
}

export function distanceBetween(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function dot(a, b) {
  return a.x * b.x + a.y * b.y;
}

export function vectorLength(vector) {
  return Math.hypot(vector.x, vector.y);
}

export function normalizeVector(vector) {
  const length = vectorLength(vector);

  if (length === 0) {
    return { x: 0, y: 0 };
  }

  return {
    x: vector.x / length,
    y: vector.y / length,
  };
}

export function angleBetweenVectors(a, b) {
  const normalizedA = normalizeVector(a);
  const normalizedB = normalizeVector(b);
  const cosine = clamp(dot(normalizedA, normalizedB), -1, 1);
  return radToDeg(Math.acos(cosine));
}

export function movePoint(point, headingDeg, distanceNm) {
  const vector = headingToVector(headingDeg);
  return {
    x: point.x + vector.x * distanceNm,
    y: point.y + vector.y * distanceNm,
  };
}

export function travelDistanceNm(speedKnots, dtSec) {
  return (speedKnots * dtSec) / 3600;
}

export function advancePoint(point, headingDeg, speedKnots, dtSec) {
  const distanceNm = travelDistanceNm(speedKnots, dtSec);
  return {
    ...movePoint(point, headingDeg, distanceNm),
    distanceNm,
  };
}

export function moveEntityTowardPoint(entity, target, speedKnots, dtSec) {
  const distanceToTarget = distanceBetween(entity, target);

  if (distanceToTarget === 0) {
    entity.speedKnots = speedKnots;
    return 0;
  }

  const travelNm = Math.min(distanceToTarget, travelDistanceNm(speedKnots, dtSec));
  entity.headingDeg = headingToPoint(entity, target);
  entity.speedKnots = speedKnots;

  const nextPosition = movePoint(entity, entity.headingDeg, travelNm);
  entity.x = nextPosition.x;
  entity.y = nextPosition.y;

  return travelNm;
}
