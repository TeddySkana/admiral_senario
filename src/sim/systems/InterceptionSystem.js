import { distanceToNearestProtectedBorder, getPolygonBounds, pointInPolygon } from '../utils/geometry.js';
import { distanceBetween, headingToVector, travelDistanceNm } from '../utils/math.js';
import { steerEntityTowardPoint } from '../utils/kinematics.js';
import { addTravelForFriendly } from './ContactBehaviorSystem.js';

const PROJECTILE_TRAVEL_SEC = 0.45;
const DAMAGE_TO_SINK_DELAY_SEC = 0.8;
const SINK_REMOVE_DELAY_SEC = 1.6;
const CLOSE_RANGE_PROJECTILE_SEC = 0.12;
const CLOSE_RANGE_SINK_DELAY_SEC = 0.22;
const FISHING_ZONE_CLEARANCE_NM = 0.22;

function predictInterceptPoint(interceptor, target) {
  const straightLineDistance = distanceBetween(interceptor, target);
  const effectiveClosingSpeed = Math.max(interceptor.maxSpeedKnots - target.speedKnots, interceptor.maxSpeedKnots * 0.45);
  const leadTimeSec = Math.min(600, (straightLineDistance / effectiveClosingSpeed) * 3600);
  const targetVector = headingToVector(target.courseDeg ?? target.headingDeg);
  const projectedTravelNm = travelDistanceNm(target.speedKnots, leadTimeSec);

  return {
    x: target.x + (targetVector.x * projectedTravelNm),
    y: target.y + (targetVector.y * projectedTravelNm),
  };
}

function isPointInRect(point, rect) {
  return point.x >= rect.minX && point.x <= rect.maxX && point.y >= rect.minY && point.y <= rect.maxY;
}

function getFishingZoneBufferedRect(geometry, clearanceNm = FISHING_ZONE_CLEARANCE_NM) {
  const bounds = getPolygonBounds(geometry.fishingPolygon);

  return {
    minX: bounds.minX - clearanceNm,
    minY: bounds.minY - clearanceNm,
    maxX: bounds.maxX + clearanceNm,
    maxY: bounds.maxY + clearanceNm,
  };
}

function orientation(a, b, c) {
  const value = ((b.y - a.y) * (c.x - b.x)) - ((b.x - a.x) * (c.y - b.y));

  if (Math.abs(value) < 1e-9) {
    return 0;
  }

  return value > 0 ? 1 : 2;
}

function onSegment(a, b, c) {
  return b.x <= Math.max(a.x, c.x)
    && b.x >= Math.min(a.x, c.x)
    && b.y <= Math.max(a.y, c.y)
    && b.y >= Math.min(a.y, c.y);
}

function segmentsIntersect(startA, endA, startB, endB) {
  const o1 = orientation(startA, endA, startB);
  const o2 = orientation(startA, endA, endB);
  const o3 = orientation(startB, endB, startA);
  const o4 = orientation(startB, endB, endA);

  if (o1 !== o2 && o3 !== o4) {
    return true;
  }

  if (o1 === 0 && onSegment(startA, startB, endA)) {
    return true;
  }

  if (o2 === 0 && onSegment(startA, endB, endA)) {
    return true;
  }

  if (o3 === 0 && onSegment(startB, startA, endB)) {
    return true;
  }

  if (o4 === 0 && onSegment(startB, endA, endB)) {
    return true;
  }

  return false;
}

function segmentIntersectsRect(start, end, rect) {
  if (isPointInRect(start, rect) || isPointInRect(end, rect)) {
    return true;
  }

  const topLeft = { x: rect.minX, y: rect.minY };
  const topRight = { x: rect.maxX, y: rect.minY };
  const bottomLeft = { x: rect.minX, y: rect.maxY };
  const bottomRight = { x: rect.maxX, y: rect.maxY };

  return segmentsIntersect(start, end, topLeft, topRight)
    || segmentsIntersect(start, end, topRight, bottomRight)
    || segmentsIntersect(start, end, bottomRight, bottomLeft)
    || segmentsIntersect(start, end, bottomLeft, topLeft);
}

function buildFishingAvoidanceWaypoint(unit, targetPoint, rect) {
  const margin = 0.08;
  const candidates = [
    { x: rect.minX - margin, y: rect.minY - margin },
    { x: rect.minX - margin, y: rect.maxY + margin },
    { x: rect.maxX + margin, y: rect.minY - margin },
    { x: rect.maxX + margin, y: rect.maxY + margin },
  ];

  let best = null;

  for (const candidate of candidates) {
    const firstLegBlocked = segmentIntersectsRect(unit, candidate, rect);
    const secondLegBlocked = segmentIntersectsRect(candidate, targetPoint, rect);

    if (firstLegBlocked || secondLegBlocked) {
      continue;
    }

    const pathLength = distanceBetween(unit, candidate) + distanceBetween(candidate, targetPoint);

    if (!best || pathLength < best.pathLength) {
      best = { candidate, pathLength };
    }
  }

  if (best) {
    return best.candidate;
  }

  const northWaypoint = { x: rect.minX - margin, y: rect.minY - margin };
  const southWaypoint = { x: rect.minX - margin, y: rect.maxY + margin };
  const northLength = distanceBetween(unit, northWaypoint) + distanceBetween(northWaypoint, targetPoint);
  const southLength = distanceBetween(unit, southWaypoint) + distanceBetween(southWaypoint, targetPoint);

  return northLength <= southLength ? northWaypoint : southWaypoint;
}

function projectPointOutsideRect(point, rect) {
  const westDistance = Math.abs(point.x - rect.minX);
  const eastDistance = Math.abs(rect.maxX - point.x);
  const northDistance = Math.abs(point.y - rect.minY);
  const southDistance = Math.abs(rect.maxY - point.y);
  const minDistance = Math.min(westDistance, eastDistance, northDistance, southDistance);
  const epsilon = 0.04;

  if (minDistance === westDistance) {
    return { x: rect.minX - epsilon, y: point.y };
  }

  if (minDistance === eastDistance) {
    return { x: rect.maxX + epsilon, y: point.y };
  }

  if (minDistance === northDistance) {
    return { x: point.x, y: rect.minY - epsilon };
  }

  return { x: point.x, y: rect.maxY + epsilon };
}

function getNavigationPoint(unit, desiredTargetPoint, geometry) {
  const fishingRect = getFishingZoneBufferedRect(geometry);

  if (pointInPolygon(unit, geometry.fishingPolygon) || isPointInRect(unit, fishingRect)) {
    const egressPoint = projectPointOutsideRect(unit, fishingRect);
    unit.fishingAvoidanceWaypoint = egressPoint;
    return egressPoint;
  }

  if (unit.fishingAvoidanceWaypoint) {
    if (distanceBetween(unit, unit.fishingAvoidanceWaypoint) <= 0.18) {
      unit.fishingAvoidanceWaypoint = null;
    } else {
      return unit.fishingAvoidanceWaypoint;
    }
  }

  if (!segmentIntersectsRect(unit, desiredTargetPoint, fishingRect)) {
    return desiredTargetPoint;
  }

  const waypoint = buildFishingAvoidanceWaypoint(unit, desiredTargetPoint, fishingRect);
  unit.fishingAvoidanceWaypoint = waypoint;
  return waypoint;
}

function enforceFishingZoneExclusion(unit, geometry) {
  if (!pointInPolygon(unit, geometry.fishingPolygon)) {
    return;
  }

  const rect = getFishingZoneBufferedRect(geometry, 0.1);
  const safePoint = projectPointOutsideRect(unit, rect);
  unit.x = safePoint.x;
  unit.y = safePoint.y;
  unit.velocityXNmPerSec *= 0.45;
  unit.velocityYNmPerSec *= 0.45;
  unit.fishingAvoidanceWaypoint = null;
}

function isHostileForEngagement(contact) {
  return contact.classification === 'enemy' || contact.classification === 'target';
}

function findHostileInKillRange(unit, contacts, rangeNm) {
  let closest = null;

  for (const contact of contacts.values()) {
    if (!contact.alive || !isHostileForEngagement(contact) || contact.pendingCombat) {
      continue;
    }

    const distance = distanceBetween(unit, contact);

    if (distance <= rangeNm && (!closest || distance < closest.distance)) {
      closest = { contact, distance };
    }
  }

  return closest?.contact ?? null;
}

export function assignInterceptor(enemy, friendlies, context) {
  const availableUnits = friendlies.filter((unit) => unit.state !== 'intercept' && unit.state !== 'engage');

  if (availableUnits.length === 0) {
    return null;
  }

  let bestCandidate = null;

  for (const unit of availableUnits) {
    const distanceNm = Math.max(0, distanceBetween(unit, enemy) - context.engagementRangeNm);
    const timeHours = distanceNm / unit.maxSpeedKnots;

    if (!bestCandidate || timeHours < bestCandidate.timeHours) {
      bestCandidate = { unit, timeHours };
    }
  }

  if (!bestCandidate) {
    return null;
  }

  bestCandidate.unit.state = 'intercept';
  bestCandidate.unit.targetId = enemy.id;
  bestCandidate.unit.assignedTargetId = enemy.id;
  enemy.assignedInterceptorId = bestCandidate.unit.id;

  context.emit('interceptor-assigned', {
    vesselId: enemy.id,
    interceptorId: bestCandidate.unit.id,
    description: `${bestCandidate.unit.id} was assigned to intercept ${enemy.id}.`,
  });

  return bestCandidate.unit;
}

function estimateInterceptHours(unit, contact, engagementRangeNm) {
  const distanceNm = Math.max(0, distanceBetween(unit, contact) - Math.min(unit.engagementRangeNm ?? 0, engagementRangeNm));
  const speedKnots = Math.max(0.1, unit.maxSpeedKnots ?? unit.cruiseSpeedKnots ?? 1);
  return distanceNm / speedKnots;
}

function releaseAssignedTarget(unit) {
  if (!unit) {
    return;
  }

  unit.targetId = null;
  unit.assignedTargetId = null;
  unit.fishingAvoidanceWaypoint = null;

  if (unit.state === 'intercept' || unit.state === 'engage') {
    unit.state = 'return';
  }
}

function reassignUnitToTarget(unit, target, friendlies, context, reason) {
  if (!unit || !target) {
    return false;
  }

  const previousInterceptorId = target.assignedInterceptorId;

  if (previousInterceptorId && previousInterceptorId !== unit.id) {
    const previousInterceptor = friendlies.find((candidate) => candidate.id === previousInterceptorId);

    if (previousInterceptor?.assignedTargetId === target.id) {
      releaseAssignedTarget(previousInterceptor);
    }
  }

  target.assignedInterceptorId = unit.id;
  unit.state = 'intercept';
  unit.targetId = target.id;
  unit.assignedTargetId = target.id;
  unit.fishingAvoidanceWaypoint = null;

  context.emit('interceptor-assigned', {
    vesselId: target.id,
    interceptorId: unit.id,
    reassigned: Boolean(previousInterceptorId && previousInterceptorId !== unit.id),
    description: previousInterceptorId && previousInterceptorId !== unit.id
      ? `${unit.id} took over interception of ${target.id} (${reason}).`
      : `${unit.id} was assigned to intercept ${target.id} (${reason}).`,
  });

  if (previousInterceptorId && previousInterceptorId !== unit.id) {
    context.emit('interceptor-reassigned', {
      vesselId: target.id,
      interceptorId: unit.id,
      previousInterceptorId,
      description: `${target.id} was reallocated from ${previousInterceptorId} to ${unit.id}.`,
    });
  }

  return true;
}

function findClosestSuspiciousForReassignment(unit, contacts) {
  let best = null;

  for (const contact of contacts) {
    if (
      !contact.alive
      || contact.pendingCombat
      || (contact.classification !== 'suspicious' && contact.classification !== 'target' && contact.classification !== 'enemy')
    ) {
      continue;
    }

    const distanceNm = distanceBetween(unit, contact);

    if (!best || distanceNm < best.distanceNm) {
      best = { contact, distanceNm };
    }
  }

  return best?.contact ?? null;
}

function tryReallocateAfterKill(unit, contacts, friendlies, context) {
  const candidate = findClosestSuspiciousForReassignment(unit, contacts);

  if (!candidate) {
    return false;
  }

  const candidateEtaHours = estimateInterceptHours(unit, candidate, context.engagementRangeNm);

  if (!candidate.assignedInterceptorId) {
    return reassignUnitToTarget(unit, candidate, friendlies, context, 'nearest post-kill handoff');
  }

  if (candidate.assignedInterceptorId === unit.id) {
    return false;
  }

  const currentInterceptor = friendlies.find((friendly) => friendly.id === candidate.assignedInterceptorId);

  if (!currentInterceptor) {
    return reassignUnitToTarget(unit, candidate, friendlies, context, 'previous interceptor unavailable');
  }

  const currentEtaHours = estimateInterceptHours(currentInterceptor, candidate, context.engagementRangeNm);

  if (candidateEtaHours + 0.00025 >= currentEtaHours) {
    return false;
  }

  return reassignUnitToTarget(unit, candidate, friendlies, context, 'closer unit after neutralization');
}

function beginAttack(unit, target, context, timing = {}) {
  const projectileTravelSec = timing.projectileTravelSec ?? PROJECTILE_TRAVEL_SEC;
  const sinkDelaySec = timing.sinkDelaySec ?? DAMAGE_TO_SINK_DELAY_SEC;

  target.pendingCombat = {
    interceptorId: unit.id,
    firedAtSec: context.state.timeSec,
    impactAtSec: context.state.timeSec + projectileTravelSec,
    sinkAtSec: context.state.timeSec + projectileTravelSec + sinkDelaySec,
    impactPoint: { x: target.x, y: target.y },
  };

  unit.state = 'engage';

  context.emit('weapon-fired', {
    vesselId: target.id,
    interceptorId: unit.id,
    x: unit.x,
    y: unit.y,
    targetX: target.x,
    targetY: target.y,
    durationSec: projectileTravelSec,
    description: `${unit.id} opened fire on ${target.id}.`,
  });

  context.emit('interceptor-in-range', {
    vesselId: target.id,
    interceptorId: unit.id,
    description: `${unit.id} reached engagement range against ${target.id}.`,
  });
}

export function updateInterceptions(friendlies, contacts, dtSec, context) {
  const activeContacts = new Map(contacts.filter((contact) => contact.alive).map((contact) => [contact.id, contact]));

  for (const unit of friendlies) {
    const nearbyEnemy = findHostileInKillRange(unit, activeContacts, unit.engagementRangeNm);

    if (nearbyEnemy && !nearbyEnemy.pendingCombat) {
      unit.assignedTargetId = nearbyEnemy.id;
      unit.targetId = nearbyEnemy.id;
      nearbyEnemy.assignedInterceptorId = nearbyEnemy.assignedInterceptorId ?? unit.id;

      beginAttack(unit, nearbyEnemy, context, {
        projectileTravelSec: CLOSE_RANGE_PROJECTILE_SEC,
        sinkDelaySec: CLOSE_RANGE_SINK_DELAY_SEC,
      });
    }

    if (unit.state !== 'intercept' && unit.state !== 'engage') {
      unit.fishingAvoidanceWaypoint = null;
      continue;
    }

    const target = activeContacts.get(unit.assignedTargetId);

    if (!target) {
      unit.state = 'return';
      unit.targetId = null;
      unit.assignedTargetId = null;
      unit.fishingAvoidanceWaypoint = null;
      continue;
    }

    if (target.classification === 'neutral') {
      if (target.assignedInterceptorId === unit.id) {
        target.assignedInterceptorId = null;
      }

      releaseAssignedTarget(unit);
      continue;
    }

    if (unit.state === 'engage') {
      const engagePoint = getNavigationPoint(unit, target, context.geometry);
      const traveled = steerEntityTowardPoint(unit, engagePoint, Math.min(unit.cruiseSpeedKnots, 8), dtSec, {
        arrivalDistanceNm: 0.2,
        minArrivalSpeedFactor: 0.2,
      });
      enforceFishingZoneExclusion(unit, context.geometry);
      addTravelForFriendly(unit, traveled);
      continue;
    }

    const interceptPoint = predictInterceptPoint(unit, target);
    const navPoint = getNavigationPoint(unit, interceptPoint, context.geometry);
    const traveled = steerEntityTowardPoint(unit, navPoint, unit.maxSpeedKnots, dtSec, {
      arrivalDistanceNm: 1.2,
      minArrivalSpeedFactor: 0.45,
    });
    enforceFishingZoneExclusion(unit, context.geometry);
    addTravelForFriendly(unit, traveled);

    if (distanceBetween(unit, target) <= context.engagementRangeNm && !target.pendingCombat) {
      beginAttack(unit, target, context);
    }
  }
}

export function resolveCombatStates(friendlies, contacts, context) {
  const activeFriendlies = new Map(friendlies.map((unit) => [unit.id, unit]));

  for (const target of contacts) {
    if (!target.pendingCombat) {
      if (target.isSinking && target.removalAtSec != null && context.state.timeSec >= target.removalAtSec) {
        context.queueRemoval(target.id);
      }
      continue;
    }

    const combat = target.pendingCombat;

    if (!combat.impactResolved && context.state.timeSec >= combat.impactAtSec) {
      combat.impactResolved = true;
      target.health = Math.max(1, target.maxHealth * 0.35);
      target.smokeLevel = 0.55;
      target.desiredSpeedKnots = 0;
      target.velocityXNmPerSec *= 0.45;
      target.velocityYNmPerSec *= 0.45;

      context.emit('impact', {
        vesselId: target.id,
        interceptorId: combat.interceptorId,
        x: combat.impactPoint.x,
        y: combat.impactPoint.y,
        description: `${combat.interceptorId} scored a hit on ${target.id}.`,
      });

      context.emit('ship-damaged', {
        vesselId: target.id,
        interceptorId: combat.interceptorId,
        x: target.x,
        y: target.y,
        health: target.health,
        maxHealth: target.maxHealth,
        description: `${target.id} was heavily damaged.`,
      });
    }

    if (!combat.sunk && context.state.timeSec >= combat.sinkAtSec) {
      combat.sunk = true;
      target.health = 0;
      target.smokeLevel = 1;
      target.alive = false;
      target.isSinking = true;
      target.removalAtSec = context.state.timeSec + SINK_REMOVE_DELAY_SEC;
      target.desiredSpeedKnots = 0;
      target.velocityXNmPerSec *= 0.18;
      target.velocityYNmPerSec *= 0.18;

      const unit = activeFriendlies.get(combat.interceptorId);

      if (unit) {
        unit.interceptCount += 1;
        releaseAssignedTarget(unit);
        tryReallocateAfterKill(unit, contacts, friendlies, context);
      }

      context.emit('interception-success', {
        vesselId: target.id,
        interceptorId: combat.interceptorId,
        x: target.x,
        y: target.y,
        description: `${combat.interceptorId} completed a successful interception on ${target.id}.`,
      });

      context.emit('ship-sunk', {
        vesselId: target.id,
        interceptorId: combat.interceptorId,
        x: target.x,
        y: target.y,
        description: `${target.id} is sinking.`,
      });

      context.emit('vessel-neutralized', {
        vesselId: target.id,
        interceptorId: combat.interceptorId,
        x: target.x,
        y: target.y,
        borderDistanceNm: distanceToNearestProtectedBorder(target, context.geometry),
        description: `${target.id} was neutralized by ${combat.interceptorId}.`,
      });
    }

    if (target.isSinking && target.removalAtSec != null && context.state.timeSec >= target.removalAtSec) {
      context.queueRemoval(target.id);
    }
  }
}
