import { angleBetweenVectors, clamp, headingToVector, normalizeVector } from './math.js';

export function pointInPolygon(point, polygon) {
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;

    const intersects = yi > point.y !== yj > point.y
      && point.x < ((xj - xi) * (point.y - yi)) / ((yj - yi) || Number.EPSILON) + xi;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

export function getPolygonBounds(polygon) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const point of polygon) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  return { minX, minY, maxX, maxY };
}

export function randomPointInPolygon(random, polygon) {
  const bounds = getPolygonBounds(polygon);

  for (let attempt = 0; attempt < 300; attempt += 1) {
    const candidate = {
      x: random.range(bounds.minX, bounds.maxX),
      y: random.range(bounds.minY, bounds.maxY),
    };

    if (pointInPolygon(candidate, polygon)) {
      return candidate;
    }
  }

  return {
    x: (bounds.minX + bounds.maxX) * 0.5,
    y: (bounds.minY + bounds.maxY) * 0.5,
  };
}

export function nearestPointOnSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return { ...start };
  }

  const t = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared, 0, 1);

  return {
    x: start.x + dx * t,
    y: start.y + dy * t,
  };
}

export function nearestPointOnPolygon(point, polygon) {
  let bestPoint = polygon[0];
  let bestDistance = Infinity;

  for (let i = 0; i < polygon.length; i += 1) {
    const start = polygon[i];
    const end = polygon[(i + 1) % polygon.length];
    const candidate = nearestPointOnSegment(point, start, end);
    const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y);

    if (distance < bestDistance) {
      bestDistance = distance;
      bestPoint = candidate;
    }
  }

  return bestPoint;
}

export function distanceToPolygon(point, polygon) {
  if (pointInPolygon(point, polygon)) {
    return 0;
  }

  const nearestPoint = nearestPointOnPolygon(point, polygon);
  return Math.hypot(nearestPoint.x - point.x, nearestPoint.y - point.y);
}

function cross(a, b) {
  return a.x * b.y - a.y * b.x;
}

export function rayIntersectsSegment(origin, direction, start, end) {
  const rayVector = direction;
  const segmentVector = {
    x: end.x - start.x,
    y: end.y - start.y,
  };
  const originToStart = {
    x: start.x - origin.x,
    y: start.y - origin.y,
  };
  const denominator = cross(rayVector, segmentVector);

  if (Math.abs(denominator) < 1e-8) {
    return null;
  }

  const t = cross(originToStart, segmentVector) / denominator;
  const u = cross(originToStart, rayVector) / denominator;

  if (t >= 0 && u >= 0 && u <= 1) {
    return {
      distance: t,
      point: {
        x: origin.x + rayVector.x * t,
        y: origin.y + rayVector.y * t,
      },
    };
  }

  return null;
}

export function rayIntersectsPolygon(origin, direction, polygon) {
  for (let i = 0; i < polygon.length; i += 1) {
    const start = polygon[i];
    const end = polygon[(i + 1) % polygon.length];

    if (rayIntersectsSegment(origin, direction, start, end)) {
      return true;
    }
  }

  return false;
}

export function getHeadingToBorderInfo(point, headingDeg, geometry) {
  const direction = headingToVector(headingDeg);
  const { westBorderXNm, coastlineXNm, northBorderYNm, southBorderYNm } = geometry;

  if (direction.y < -1e-6) {
    const distance = (northBorderYNm - point.y) / direction.y;

    if (distance > 0) {
      const intersectionX = point.x + direction.x * distance;

      if (intersectionX >= westBorderXNm && intersectionX <= coastlineXNm) {
        return { hit: true, border: 'north', distanceNm: distance };
      }
    }
  }

  if (direction.y > 1e-6) {
    const distance = (southBorderYNm - point.y) / direction.y;

    if (distance > 0) {
      const intersectionX = point.x + direction.x * distance;

      if (intersectionX >= westBorderXNm && intersectionX <= coastlineXNm) {
        return { hit: true, border: 'south', distanceNm: distance };
      }
    }
  }

  if (direction.x < -1e-6) {
    const distance = (westBorderXNm - point.x) / direction.x;

    if (distance > 0) {
      const intersectionY = point.y + direction.y * distance;

      if (intersectionY >= northBorderYNm && intersectionY <= southBorderYNm) {
        return { hit: true, border: 'west', distanceNm: distance };
      }
    }
  }

  return { hit: false, border: null, distanceNm: Infinity };
}

export function isHeadingBackToPolygon(point, headingDeg, polygon, toleranceDegrees = 35) {
  const direction = headingToVector(headingDeg);

  if (rayIntersectsPolygon(point, direction, polygon)) {
    return true;
  }

  const nearestPoint = nearestPointOnPolygon(point, polygon);
  const vectorToZone = normalizeVector({
    x: nearestPoint.x - point.x,
    y: nearestPoint.y - point.y,
  });

  if (vectorToZone.x === 0 && vectorToZone.y === 0) {
    return true;
  }

  return angleBetweenVectors(direction, vectorToZone) <= toleranceDegrees;
}

export function distanceToNearestProtectedBorder(point, geometry) {
  return Math.min(
    Math.abs(point.y - geometry.northBorderYNm),
    Math.abs(point.y - geometry.southBorderYNm),
    Math.abs(point.x - geometry.westBorderXNm),
  );
}
