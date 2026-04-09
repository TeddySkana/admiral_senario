import { lerp } from '../../sim/utils/math.js';
import { shortestAngleDeltaDeg } from '../../sim/utils/kinematics.js';

export function interpolateAngleDeg(from, to, alpha) {
  return from + (shortestAngleDeltaDeg(from, to) * alpha);
}

export function getInterpolatedEntityState(entity, alpha) {
  const safeAlpha = Math.max(0, Math.min(1, alpha));
  const x = lerp(entity.prevX ?? entity.x, entity.x, safeAlpha);
  const y = lerp(entity.prevY ?? entity.y, entity.y, safeAlpha);
  const headingDeg = interpolateAngleDeg(entity.prevHeadingDeg ?? entity.headingDeg, entity.headingDeg, safeAlpha);
  const courseDeg = interpolateAngleDeg(entity.prevCourseDeg ?? entity.courseDeg ?? entity.headingDeg, entity.courseDeg ?? entity.headingDeg, safeAlpha);

  return {
    ...entity,
    renderX: x,
    renderY: y,
    renderHeadingDeg: headingDeg,
    renderCourseDeg: courseDeg,
  };
}
