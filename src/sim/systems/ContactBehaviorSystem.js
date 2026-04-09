import { nearestPointOnPolygon, pointInPolygon, randomPointInPolygon } from '../utils/geometry.js';
import { clamp, distanceBetween, normalizeVector } from '../utils/math.js';
import { steerEntityOnHeading, steerEntityTowardPoint } from '../utils/kinematics.js';

const WAYPOINT_EPSILON_NM = 0.22;
const WANDER_RETARGET_MIN_SEC = 20;
const WANDER_RETARGET_MAX_SEC = 85;
const AVOIDANCE_RADIUS_NM = 0.75;
const AVOIDANCE_WEIGHT = 1.35;
const ATTACK_TARGET_REACHED_NM = 0.3;

function getAttackModeStepChance(chancePerMinute, dtSec) {
  const normalized = clamp(chancePerMinute, 0, 1);
  return 1 - ((1 - normalized) ** (dtSec / 60));
}

function buildWestAttackTarget(geometry, random) {
  return {
    x: geometry.westBorderXNm - random.range(0.1, 0.5),
    y: random.range(geometry.northBorderYNm + 0.5, geometry.southBorderYNm - 0.5),
  };
}

function resetWanderTarget(boat, context) {
  boat.wanderWaypoint = randomPointInPolygon(context.random, context.geometry.fishingPolygon);
  boat.retargetTimerSec = context.random.range(WANDER_RETARGET_MIN_SEC, WANDER_RETARGET_MAX_SEC);
}

function computeAvoidanceVector(boat, context) {
  let pushX = 0;
  let pushY = 0;

  for (const contact of context.state.contacts) {
    if (contact.id === boat.id || contact.type !== 'fishing' || !contact.alive) {
      continue;
    }

    const dx = boat.x - contact.x;
    const dy = boat.y - contact.y;
    const distance = Math.hypot(dx, dy);

    if (distance <= 1e-5 || distance >= AVOIDANCE_RADIUS_NM) {
      continue;
    }

    const proximity = (AVOIDANCE_RADIUS_NM - distance) / AVOIDANCE_RADIUS_NM;
    const influence = proximity * proximity;
    pushX += (dx / distance) * influence;
    pushY += (dy / distance) * influence;
  }

  return { x: pushX, y: pushY };
}

function steerRandomWalk(boat, dtSec, context) {
  const { config, geometry } = context;
  const { fishingSpeedMinKnots, fishingSpeedMaxKnots } = config.spawnBehavior;
  const insideZone = pointInPolygon(boat, geometry.fishingPolygon);
  boat.insideFishingZone = insideZone;

  if (!insideZone) {
    const nearestAllowedPoint = nearestPointOnPolygon(boat, geometry.fishingPolygon);
    steerEntityTowardPoint(boat, nearestAllowedPoint, Math.max(fishingSpeedMinKnots + 1.2, boat.speedKnots), dtSec, {
      arrivalDistanceNm: 0.5,
      minArrivalSpeedFactor: 0.4,
    });
    return;
  }

  boat.retargetTimerSec -= dtSec;

  if (
    !boat.wanderWaypoint
    || distanceBetween(boat, boat.wanderWaypoint) < WAYPOINT_EPSILON_NM
    || boat.retargetTimerSec <= 0
  ) {
    resetWanderTarget(boat, context);
  }

  const toWaypoint = normalizeVector({
    x: boat.wanderWaypoint.x - boat.x,
    y: boat.wanderWaypoint.y - boat.y,
  });
  const avoidance = computeAvoidanceVector(boat, context);
  const avoidanceMagnitude = Math.hypot(avoidance.x, avoidance.y);
  const avoidanceVector = normalizeVector(avoidance);
  const blendedDirection = normalizeVector({
    x: toWaypoint.x + (avoidanceVector.x * AVOIDANCE_WEIGHT),
    y: toWaypoint.y + (avoidanceVector.y * AVOIDANCE_WEIGHT),
  });

  const previewPoint = {
    x: boat.x + (blendedDirection.x * 1.25),
    y: boat.y + (blendedDirection.y * 1.25),
  };
  const steeringTarget = (avoidanceMagnitude > 0.02 && pointInPolygon(previewPoint, geometry.fishingPolygon))
    ? previewPoint
    : boat.wanderWaypoint;
  const cruiseTarget = clamp(
    boat.speedKnots * (0.95 + (context.random.next() * 0.14)),
    fishingSpeedMinKnots,
    fishingSpeedMaxKnots,
  );

  steerEntityTowardPoint(boat, steeringTarget, cruiseTarget, dtSec, {
    arrivalDistanceNm: 0.65,
    minArrivalSpeedFactor: 0.3,
  });
}

function steerAttackMode(boat, dtSec, context) {
  if (!boat.attackTarget || distanceBetween(boat, boat.attackTarget) <= ATTACK_TARGET_REACHED_NM) {
    boat.behaviorMode = 'wander';
    boat.modeTimerSec = 0;
    resetWanderTarget(boat, context);
    return;
  }

  steerEntityTowardPoint(boat, boat.attackTarget, boat.hostileSpeedKnots, dtSec, {
    arrivalDistanceNm: 0.95,
    minArrivalSpeedFactor: 0.75,
  });
}

export function maybePromoteFishingAttacker(dtSec, context) {
  const candidates = context.state.contacts.filter((contact) => (
    contact.type === 'fishing'
    && contact.alive
    && contact.behaviorMode !== 'attack'
    && !contact.pendingCombat
    && !contact.assignedInterceptorId
  ));

  if (candidates.length === 0) {
    return;
  }

  const activeAttacker = context.state.contacts.some((contact) => (
    contact.type === 'fishing'
    && contact.alive
    && contact.behaviorMode === 'attack'
  ));

  if (activeAttacker) {
    return;
  }

  const chancePerMinute = context.config.spawnBehavior.attackModeChancePerMinute;
  const rollThreshold = getAttackModeStepChance(chancePerMinute, dtSec);

  if (context.random.next() > rollThreshold) {
    return;
  }

  const attacker = context.random.pick(candidates);
  attacker.behaviorMode = 'attack';
  attacker.modeTimerSec = 0;
  attacker.attackTarget = buildWestAttackTarget(context.geometry, context.random);
  attacker.targetDueToRepeat = false;

  context.emit('contact-attack-mode', {
    vesselId: attacker.id,
    description: `${attacker.id} switched to attack mode and is heading toward the west border.`,
  });
}

export function addTravelForFriendly(entity, distanceNm) {
  entity.distanceTraveledNm += distanceNm;
  entity.remainingOperationalRangeNm = Math.max(0, entity.operationalRangeNm - entity.distanceTraveledNm);
}

export function updateFishingBoatBehavior(boat, dtSec, context) {
  if (!boat.alive) {
    return;
  }

  boat.modeTimerSec += dtSec;

  if (boat.behaviorMode === 'attack') {
    steerAttackMode(boat, dtSec, context);
    return;
  }

  steerRandomWalk(boat, dtSec, context);
}

export function updateCargoBehavior(ship, dtSec, context) {
  if (!ship.alive) {
    return;
  }

  steerEntityOnHeading(ship, ship.desiredHeadingDeg ?? ship.headingDeg, ship.desiredSpeedKnots ?? ship.speedKnots, dtSec);

  const { shippingLane, heightNm } = context.geometry;

  if (ship.y < -1) {
    ship.y = heightNm + 1;
    ship.x = context.random.range(shippingLane.westXNm + 0.2, shippingLane.eastXNm - 0.2);
    ship.prevX = ship.x;
    ship.prevY = ship.y;
  }

  if (ship.y > heightNm + 1) {
    ship.y = -1;
    ship.x = context.random.range(shippingLane.westXNm + 0.2, shippingLane.eastXNm - 0.2);
    ship.prevX = ship.x;
    ship.prevY = ship.y;
  }
}
