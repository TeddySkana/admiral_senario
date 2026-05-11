import {
  cloneOffshoreScenarioConfig,
  defaultOffshoreScenario,
  deriveOffshoreGeometry,
  getOffshoreDerivedMetrics,
  getOffshoreMissionDurationSeconds,
  getReserveActivationSeconds,
} from '../config/offshoreScenario.js';
import { createSeededRandom } from '../utils/random.js';
import {
  angleBetweenVectors,
  clamp,
  distanceBetween,
  headingToPoint,
  headingToVector,
  normalizeAngleDeg,
} from '../utils/math.js';
import {
  hoursToSeconds,
  knotsToMetersPerSecond,
  metersToNauticalMiles,
  metersToYards,
  minutesToSeconds,
  nauticalMilesToMeters,
  yardsToNauticalMiles,
  yardsToMeters,
} from '../utils/units.js';
import {
  applyOffshoreMotion,
  createOffshoreMotionState,
  distanceBetweenCapsules,
  nauticalPointToMeters,
  saveOffshorePreviousTransform,
  setOffshoreDesiredMotion,
  syncOffshoreVesselGeometry,
} from './VesselPhysics.js';
import { createProbabilityDecisionProvider } from './decisionProvider.js';
import {
  createInitialInterceptionStatus,
  offshoreInterceptionConfig,
  OFFSHORE_INTERCEPTION_STATES,
} from './interceptionConfig.js';
import {
  calculateZigzagAngleDeg,
  stepInterceptionStateMachine,
} from './interceptionStateMachine.js';

function pointOnCircle(center, radiusMeters, angleDeg) {
  const vector = headingToVector(angleDeg);
  return {
    x: center.x + (vector.x * radiusMeters),
    y: center.y + (vector.y * radiusMeters),
  };
}

function normalizeSignedAngle(angleDeg) {
  return ((angleDeg + 540) % 360) - 180;
}

function orbitAngleFromCenter(center, point) {
  return normalizeAngleDeg((Math.atan2(point.x - center.x, -(point.y - center.y)) * 180) / Math.PI);
}

function distanceMeters(a, b) {
  return Math.hypot((b.xMeters ?? b.x) - (a.xMeters ?? a.x), (b.yMeters ?? b.y) - (a.yMeters ?? a.y));
}

function formatDistanceNm(distanceMetersValue) {
  return metersToNauticalMiles(distanceMetersValue);
}

function isInsideBounds(pointMeters, widthNm, heightNm, paddingNm = 0.6) {
  const minMeters = nauticalMilesToMeters(paddingNm);
  const maxXMeters = nauticalMilesToMeters(widthNm - paddingNm);
  const maxYMeters = nauticalMilesToMeters(heightNm - paddingNm);

  return pointMeters.x >= minMeters
    && pointMeters.x <= maxXMeters
    && pointMeters.y >= minMeters
    && pointMeters.y <= maxYMeters;
}

function createFriendlyUnit({ id, role, positionMeters, headingDeg, config, availableAtSec = 0 }) {
  const motionState = createOffshoreMotionState({
    headingDeg,
    speedKnots: availableAtSec > 0 ? 0 : config.ownForces.cruiseSpeedKnots,
    maxSpeedKnots: config.ownForces.maxSpeedKnots,
    lengthMeters: config.ownForces.lengthMeters,
    widthMeters: config.ownForces.widthMeters,
    positionMeters,
    accelerationMps2: config.physics.accelerationMps2,
    brakingMps2: config.physics.brakingMps2,
    turnRateDegPerSec: config.physics.turnRateDegPerSec,
  });

  const unit = {
    id,
    label: id,
    type: 'friendly',
    visualStyle: 'offshoreCraft',
    spriteVariant: 'friendly',
    role,
    roleLabel: role === 'dynamic'
      ? 'Dynamic Patrol'
      : role === 'static'
        ? 'Inner Ring Guard'
        : 'Reserve Patrol',
    patrolPattern: role === 'dynamic' ? 'dynamic' : role === 'static' ? 'inner' : 'reserve',
    platform: config.ownForces.platformLabel,
    classification: 'friendly',
    state: availableAtSec > 0 ? 'standby' : 'patrol',
    homePositionMeters: { ...positionMeters },
    homeHeadingDeg: headingDeg,
    assignedTargetId: null,
    availableAtSec,
    available: availableAtSec === 0,
    launched: availableAtSec === 0,
    alive: true,
    fuelCapacityLiters: config.ownForces.fuelLiters,
    fuelLitersRemaining: config.ownForces.fuelLiters,
    enduranceSec: hoursToSeconds(config.ownForces.enduranceHours),
    enduranceRemainingSec: hoursToSeconds(config.ownForces.enduranceHours),
    maxOperationalRangeNm: config.ownForces.maximumRangeNm,
    remainingOperationalRangeNm: config.ownForces.maximumRangeNm,
    distanceTraveledNm: 0,
    engagementRangeNm: yardsToNauticalMiles(config.ownForces.weapon.rangeYards),
    fireCooldownSec: 0,
    maxHealth: 100,
    health: 100,
    sensorClass: config.ownForces.vesselClass,
    weaponLabel: config.ownForces.weapon.name,
    navigationLabel: config.ownForces.navigation,
    destroyedAtSec: null,
    missionScorePenalty: 0,
    pendingCommand: null,
    ...motionState,
  };

  syncOffshoreVesselGeometry(unit);
  return unit;
}

function createThreatUnit({ id, positionMeters, headingDeg, config }) {
  const motionState = createOffshoreMotionState({
    headingDeg,
    speedKnots: config.threats.initialApproachSpeedKnots,
    maxSpeedKnots: config.threats.attackSpeedKnots,
    lengthMeters: config.ownForces.lengthMeters,
    widthMeters: config.ownForces.widthMeters,
    positionMeters,
    accelerationMps2: config.physics.accelerationMps2 * 1.1,
    brakingMps2: config.physics.brakingMps2,
    turnRateDegPerSec: config.physics.threatTurnRateDegPerSec,
  });

  const contact = {
    id,
    label: id,
    type: 'threat',
    visualStyle: 'offshoreThreat',
    spriteVariant: 'fishing',
    contactTypeLabel: config.threats.classLabel,
    classification: 'neutral',
    state: 'patrol',
    detected: false,
    identified: false,
    firedUpon: false,
    evasionMode: null,
    zigzagSign: 1,
    zigzagTimerSec: 0,
    assignedInterceptorId: null,
    hostileTimerSec: 0,
    alive: true,
    maxHealth: 100,
    health: 100,
    outcome: null,
    attackStartSec: 0,
    attackActivated: false,
    orbitDirection: 1,
    spawnRadiusMeters: 0,
    loiterMode: 'orbit',
    loiterOrbitAngleDeg: 0,
    loiterPhaseDeg: 0,
    loiterAmplitudeMeters: 0,
    loiterWaypointMeters: null,
    loiterRetargetAtSec: 0,
    interception: createInitialInterceptionStatus(),
    pendingCommand: null,
    resolutionEventsEmitted: false,
    destroyedAtSec: null,
    ...motionState,
  };

  syncOffshoreVesselGeometry(contact);
  return contact;
}

function resetDestroyedEntityMotion(entity) {
  entity.velocityXMps = 0;
  entity.velocityYMps = 0;
  entity.driftXMps = 0;
  entity.driftYMps = 0;
  entity.speedKnots = 0;
  entity.desiredSpeedKnots = 0;
}

function hasEffectiveWeaponWindow(unit, config) {
  return unit.speedKnots >= config.ownForces.weapon.effectiveSpeedMinKnots
    && unit.speedKnots <= config.ownForces.weapon.effectiveSpeedMaxKnots;
}

function canTraverseToTarget(unit, target, traverseDegreesPerSide) {
  const headingVector = headingToVector(unit.headingDeg);
  const targetVector = {
    x: target.xMeters - unit.startPointMeters.x,
    y: target.yMeters - unit.startPointMeters.y,
  };

  return angleBetweenVectors(headingVector, targetVector) <= traverseDegreesPerSide;
}

export class OffshoreSimulationEngine {
  constructor(config = defaultOffshoreScenario, eventBus, options = {}) {
    this.config = cloneOffshoreScenarioConfig(config);
    this.eventBus = eventBus ?? { emit() {} };
    this.geometry = deriveOffshoreGeometry(this.config);
    this.metrics = getOffshoreDerivedMetrics(this.config);
    this.random = createSeededRandom(this.config.randomSeed);
    this.decisionProviderFactory = options.createDecisionProvider
      ?? ((random) => createProbabilityDecisionProvider(random));
    this.decisionProvider = this.decisionProviderFactory(this.random);
    this.nextEventId = 1;
    this.nextThreatNumber = 1;
    this.metricsSampleAccumulatorSec = 0;
    this.reserveAvailableNotified = false;
    this.missionStatusAnnounced = false;
    this.state = this.createEmptyState();
    this.initializeScenario();
  }

  createEmptyState() {
    return {
      timeSec: 0,
      paused: false,
      missionStatus: 'active',
      missionScore: 100,
      friendlyUnits: [],
      contacts: [],
      eventLog: [],
      offshore: {
        reserveAvailable: false,
        reserveLaunched: false,
        protectedAreaBreached: false,
        rig: {
          x: this.geometry?.rig?.x ?? 0,
          y: this.geometry?.rig?.y ?? 0,
          label: this.geometry?.rig?.label ?? 'Strategic Rig',
        },
      },
      metricsHistory: {
        classifications: [],
        closestEnemyDistance: [],
      },
    };
  }

  initializeScenario() {
    this.geometry = deriveOffshoreGeometry(this.config);
    this.metrics = getOffshoreDerivedMetrics(this.config);
    this.random = createSeededRandom(this.config.randomSeed);
    this.decisionProvider = this.decisionProviderFactory(this.random);
    this.nextThreatNumber = 1;
    this.nextEventId = 1;
    this.metricsSampleAccumulatorSec = 0;
    this.reserveAvailableNotified = false;
    this.missionStatusAnnounced = false;
    this.state = this.createEmptyState();

    this.spawnFriendlies();
    this.spawnThreats();
    this.sampleMetrics(true);
  }

  getRigPointMeters() {
    return nauticalPointToMeters(this.geometry.rig);
  }

  spawnFriendlies() {
    const rigMeters = this.getRigPointMeters();
    const staticAnchor = pointOnCircle(rigMeters, this.metrics.safetyRadiusMeters, 90);
    const dynamicAnchor = pointOnCircle(rigMeters, this.metrics.dynamicPatrolRadiusMeters, 0);
    const reserveAnchor = pointOnCircle(rigMeters, this.metrics.safetyRadiusMeters * 1.7, 135);

    this.state.friendlyUnits.push(
      createFriendlyUnit({
        id: 'BS 401',
        role: 'dynamic',
        positionMeters: dynamicAnchor,
        headingDeg: 90,
        config: this.config,
      }),
      createFriendlyUnit({
        id: 'BS 402',
        role: 'static',
        positionMeters: staticAnchor,
        headingDeg: 270,
        config: this.config,
      }),
      createFriendlyUnit({
        id: 'BS 403',
        role: 'reserve',
        positionMeters: reserveAnchor,
        headingDeg: 315,
        config: this.config,
        availableAtSec: getReserveActivationSeconds(this.config),
      }),
    );
  }

  spawnThreats() {
    const rigMeters = this.getRigPointMeters();
    const threatCount = this.random.int(this.config.threats.countMin, this.config.threats.countMax);
    const threats = [];

    for (let index = 0; index < threatCount; index += 1) {
      const angle = this.random.range(0, 360);
      const radius = this.random.range(
        this.metrics.threatSpawnRadiusMinMeters,
        this.metrics.threatSpawnRadiusMaxMeters,
      );
      const positionMeters = pointOnCircle(rigMeters, radius, angle);
      const threat = createThreatUnit({
        id: `TH-${String(this.nextThreatNumber).padStart(2, '0')}`,
        positionMeters,
        headingDeg: headingToPoint(
          { x: metersToNauticalMiles(positionMeters.x), y: metersToNauticalMiles(positionMeters.y) },
          this.geometry.rig,
        ),
        config: this.config,
      });

      threat.orbitDirection = this.random.chance(0.5) ? 1 : -1;
      threat.spawnRadiusMeters = radius;
      threat.loiterMode = 'orbit';
      threat.loiterOrbitAngleDeg = angle;
      threat.loiterPhaseDeg = this.random.range(0, 360);
      threat.loiterAmplitudeMeters = 0;
      threat.loiterWaypointMeters = null;
      threat.loiterRetargetAtSec = 0;
      this.nextThreatNumber += 1;
      threats.push(threat);
    }

    this.assignThreatAttackSchedule(threats);
    this.state.contacts.push(...threats);
  }

  assignThreatAttackSchedule(threats) {
    if (threats.length === 0) {
      return;
    }

    const synchronizedAttack = this.random.chance(0.5);

    if (synchronizedAttack) {
      const attackAtSec = minutesToSeconds(this.random.range(
        this.config.threats.synchronizedAttackWindowMinutes.min,
        this.config.threats.synchronizedAttackWindowMinutes.max,
      ));

      for (const threat of threats) {
        threat.attackStartSec = attackAtSec;
      }

      return;
    }

    const [firstThreat, secondThreat] = threats;
    firstThreat.attackStartSec = minutesToSeconds(this.random.range(
      this.config.threats.staggeredAttackWindowsMinutes.firstMin,
      this.config.threats.staggeredAttackWindowsMinutes.firstMax,
    ));

    if (secondThreat) {
      secondThreat.attackStartSec = minutesToSeconds(this.random.range(
        this.config.threats.staggeredAttackWindowsMinutes.secondMin,
        this.config.threats.staggeredAttackWindowsMinutes.secondMax,
      ));
    }

    for (const threat of threats.slice(2)) {
      threat.attackStartSec = firstThreat.attackStartSec;
    }
  }

  emit(type, payload = {}) {
    const event = {
      id: this.nextEventId,
      timeSec: this.state.timeSec,
      type,
      ...payload,
    };

    this.nextEventId += 1;
    this.state.eventLog.unshift(event);
    this.state.eventLog = this.state.eventLog.slice(0, 300);
    this.eventBus.emit(type, event);
  }

  pause() {
    if (this.state.paused) {
      return;
    }

    this.state.paused = true;
    this.emit('simulation-paused', { description: 'Simulation paused.' });
  }

  resume() {
    if (!this.state.paused) {
      return;
    }

    this.state.paused = false;
    this.emit('simulation-resumed', { description: 'Simulation resumed.' });
  }

  reset() {
    this.initializeScenario();
    this.emit('simulation-reset', {
      description: 'Offshore mission reset to its initial seeded state.',
    });
  }

  destroy() {}

  getClassificationCounts() {
    const counts = {
      neutral: 0,
      suspicious: 0,
      enemy: 0,
      target: 0,
    };

    for (const contact of this.state.contacts) {
      if (!contact.alive) {
        continue;
      }

      if (contact.classification === 'enemy') {
        counts.enemy += 1;
      } else if (contact.classification === 'suspicious') {
        counts.suspicious += 1;
      } else {
        counts.neutral += 1;
      }
    }

    return counts;
  }

  getClosestEnemyDistanceNm() {
    const liveThreats = this.state.contacts.filter((contact) => contact.alive);

    if (liveThreats.length === 0) {
      return null;
    }

    const rigMeters = this.getRigPointMeters();
    return Math.min(...liveThreats.map((contact) => (
      Math.max(0, formatDistanceNm(distanceMeters(contact, rigMeters) - this.metrics.safetyRadiusMeters))
    )));
  }

  getReserveUnit() {
    return this.state.friendlyUnits.find((unit) => unit.id === 'BS 403') ?? null;
  }

  getLiveThreats() {
    return this.state.contacts.filter((contact) => contact.alive);
  }

  hasAnyDetectedThreat() {
    return this.state.contacts.some((contact) => contact.alive && contact.detected);
  }

  isValidPreAttackLoiterPoint(pointMeters) {
    if (!isInsideBounds(pointMeters, this.geometry.widthNm, this.geometry.heightNm)) {
      return false;
    }

    return distanceMeters({
      xMeters: pointMeters.x,
      yMeters: pointMeters.y,
    }, this.getRigPointMeters()) > this.metrics.dynamicPatrolRadiusMeters;
  }

  keepThreatOutsideOuterRing(contact) {
    if (contact.attackActivated) {
      return;
    }

    const rigMeters = this.getRigPointMeters();
    const dx = contact.xMeters - rigMeters.x;
    const dy = contact.yMeters - rigMeters.y;
    const distanceFromRig = Math.hypot(dx, dy);
    const minimumRadius = this.metrics.dynamicPatrolRadiusMeters + 45;

    if (distanceFromRig >= minimumRadius || distanceFromRig === 0) {
      return;
    }

    const scale = minimumRadius / distanceFromRig;
    contact.xMeters = rigMeters.x + (dx * scale);
    contact.yMeters = rigMeters.y + (dy * scale);
    syncOffshoreVesselGeometry(contact);
  }

  getThreatClassificationFromProcedure(contact) {
    const state = contact.interception?.state ?? OFFSHORE_INTERCEPTION_STATES.PATROL;

    if (
      state === OFFSHORE_INTERCEPTION_STATES.PATROL
      || state === OFFSHORE_INTERCEPTION_STATES.RETURN_TO_PATROL_NON_THREAT
    ) {
      return 'neutral';
    }

    if (
      state === OFFSHORE_INTERCEPTION_STATES.SUSPICIOUS_TARGET_DETECTED
      || state === OFFSHORE_INTERCEPTION_STATES.RADIO_CHALLENGE
    ) {
      return 'suspicious';
    }

    return 'enemy';
  }

  mapProcedureStateToUiState(contact) {
    const state = contact.interception?.state ?? OFFSHORE_INTERCEPTION_STATES.PATROL;
    return state.toLowerCase();
  }

  getDefenderForContact(contact) {
    return contact.interception?.assignedDefenderId
      ? this.state.friendlyUnits.find((unit) => unit.id === contact.interception.assignedDefenderId) ?? null
      : null;
  }

  selectDefenderForThreat(threat, reservedDefenderIds = new Set()) {
    const candidates = this.state.friendlyUnits.filter((unit) => (
      unit.alive
      && unit.available
      && (unit.id !== 'BS 403' || unit.launched)
      && !reservedDefenderIds.has(unit.id)
      && !unit.assignedTargetId
    ));

    if (candidates.length === 0) {
      return null;
    }

    const rolePriority = {
      dynamic: 0,
      reserve: 1,
      static: 2,
    };

    return [...candidates].sort((left, right) => {
      const priorityDelta = (rolePriority[left.role] ?? 99) - (rolePriority[right.role] ?? 99);

      if (priorityDelta !== 0) {
        return priorityDelta;
      }

      return distanceMeters(left, threat) - distanceMeters(right, threat);
    })[0];
  }

  buildInterceptionSnapshot(contact, defender) {
    const rigMeters = this.getRigPointMeters();
    const targetRangeToRigYards = metersToYards(distanceMeters(contact, rigMeters));
    const targetRangeToDefenderYards = defender ? metersToYards(distanceMeters(contact, defender)) : Infinity;
    const defenderRangeToRigYards = defender ? metersToYards(distanceMeters(defender, rigMeters)) : Infinity;
    const targetVector = defender ? {
      x: contact.xMeters - defender.startPointMeters.x,
      y: contact.yMeters - defender.startPointMeters.y,
    } : { x: 0, y: 0 };
    const rigVector = defender ? {
      x: rigMeters.x - defender.startPointMeters.x,
      y: rigMeters.y - defender.startPointMeters.y,
    } : { x: 0, y: 0 };
    const headingVector = defender ? headingToVector(defender.headingDeg) : { x: 0, y: -1 };
    const bowToTargetAngleDeg = defender ? angleBetweenVectors(headingVector, targetVector) : 180;
    const bowToRigAngleDeg = defender ? angleBetweenVectors(headingVector, rigVector) : 180;
    const collisionDetected = defender
      ? distanceBetweenCapsules(defender, contact) <= this.config.physics.collisionDistanceMeters
      : false;

    return {
      timeSec: this.state.timeSec,
      targetId: contact.id,
      defenderId: defender?.id ?? null,
      targetRangeToRigYards,
      targetRangeToDefenderYards,
      defenderRangeToRigYards,
      bowToTargetAngleDeg,
      bowToRigAngleDeg,
      targetSpeedKnots: contact.speedKnots,
      insideProtectedArea: targetRangeToRigYards <= this.config.world.safetyRadiusYards,
      collisionDetected,
    };
  }

  describeProcedureEvent(eventType, contact, defender, extra = {}) {
    const defenderId = defender?.id ?? contact.interception?.assignedDefenderId ?? 'Defender';

    switch (eventType) {
      case 'target_detected':
        return `${contact.id} detected by the rig array and assigned to ${defenderId}.`;
      case 'radio_challenge_started':
        return `${defenderId} started a radio challenge against ${contact.id}.`;
      case 'target_answered_radio':
        return `${contact.id} answered the radio challenge.`;
      case 'target_cleared_non_threat':
        return `${contact.id} cleared as non-threat. ${defenderId} is returning to patrol.`;
      case 'returned_to_patrol':
        return `${defenderId} returned to the 3000-yard patrol ring.`;
      case 'target_did_not_answer_radio':
        return `${contact.id} did not answer the radio challenge.`;
      case 'intercept_started':
        return `${defenderId} began the formal interception at 40 knots.`;
      case 'signaling_lights_and_flares_active':
        return `${defenderId} activated signaling lights and flares during the approach.`;
      case 'zigzag_started':
        return `${defenderId} began zigzag approach on ${contact.id} at ${Math.round(extra.zigzagAngleDeg ?? 0)} degrees.`;
      case 'warning_flare_fired':
        return `${defenderId} fired a warning flare ${extra.sideDeg < 0 ? 'left' : 'right'} of bow.`;
      case 'operator_approval_requested':
        return `${defenderId} requested operator approval for violent interception.`;
      case 'operator_approval_granted':
        return `Operator approved violent interception for ${defenderId}.`;
      case 'operator_approval_denied':
        return `Operator denied violent interception approval for ${defenderId}.`;
      case 'mag_fire_blocked_unsafe_rig_line':
        return `${defenderId} blocked MAG fire because the rig is in the unsafe line of fire.`;
      case 'mag_fired':
        return `${defenderId} fired destructive MAG at ${contact.id}.`;
      case 'target_neutralized':
        return `${contact.id} neutralized. ${defenderId} is returning to the 3000-yard patrol ring.`;
      case 'mag_failed':
        return `${defenderId} MAG fire failed to stop ${contact.id}.`;
      case 'ram_pursuit_started':
        return `${defenderId} entered maximum-speed ram pursuit on ${contact.id}.`;
      case 'collision_occurred':
        return `${defenderId} collided with ${contact.id} during the ram attempt.`;
      case 'mission_failed_protected_area_penetrated':
        return `${contact.id} penetrated the protected area. Mission failed.`;
      default:
        return `${eventType} for ${contact.id}.`;
    }
  }

  emitProcedureEvents(contact, defender, procedureEvents) {
    for (const procedureEvent of procedureEvents) {
      this.emit(procedureEvent.type, {
        vesselId: contact.id,
        targetId: contact.id,
        defenderId: defender?.id ?? contact.interception?.assignedDefenderId ?? null,
        sideDeg: procedureEvent.sideDeg,
        zigzagAngleDeg: procedureEvent.zigzagAngleDeg,
        x: contact.x,
        y: contact.y,
        description: this.describeProcedureEvent(procedureEvent.type, contact, defender, procedureEvent),
      });
    }
  }

  releaseDefenderAssignment(contact) {
    const defenderId = contact.interception?.assignedDefenderId ?? contact.assignedInterceptorId;

    if (!defenderId) {
      contact.assignedInterceptorId = null;
      return;
    }

    const defender = this.state.friendlyUnits.find((unit) => unit.id === defenderId) ?? null;

    if (defender && defender.assignedTargetId === contact.id) {
      defender.assignedTargetId = null;
      defender.pendingCommand = null;
      defender.patrolPattern = defender.role === 'dynamic' ? 'dynamic' : defender.role === 'reserve' ? 'reserve' : 'inner';
    }

    contact.assignedInterceptorId = null;
    if (contact.interception) {
      contact.interception.assignedDefenderId = null;
    }
  }

  markThreatDestroyed(contact, outcome) {
    contact.outcome = outcome;
    contact.alive = false;
    contact.health = 0;
    contact.destroyedAtSec ??= this.state.timeSec;
    resetDestroyedEntityMotion(contact);
    this.releaseDefenderAssignment(contact);
  }

  updateInterceptionProcedures() {
    const reservedDefenderIds = new Set();
    const orderedThreats = [...this.state.contacts].sort((left, right) => (
      distanceMeters(left, this.getRigPointMeters()) - distanceMeters(right, this.getRigPointMeters())
    ));

    for (const contact of orderedThreats) {
      if (!contact.alive || contact.outcome === 'cleared-non-threat') {
        continue;
      }

      if (!contact.interception) {
        contact.interception = createInitialInterceptionStatus();
      }

      let defender = this.getDefenderForContact(contact);
      const detectionRangeMeters = yardsToMeters(offshoreInterceptionConfig.detectionRangeYards);
      const withinDetectionRange = distanceMeters(contact, this.getRigPointMeters()) <= detectionRangeMeters;

      if (!defender && withinDetectionRange) {
        defender = this.selectDefenderForThreat(contact, reservedDefenderIds);

        if (defender) {
          defender.assignedTargetId = contact.id;
          contact.interception.assignedDefenderId = defender.id;
        }
      }

      if (defender) {
        reservedDefenderIds.add(defender.id);
      }

      const snapshot = this.buildInterceptionSnapshot(contact, defender);
      const result = stepInterceptionStateMachine({
        status: contact.interception,
        snapshot,
        decisionProvider: this.decisionProvider,
        config: offshoreInterceptionConfig,
      });

      contact.interception = result.status;
      contact.pendingCommand = result.command;
      this.emitProcedureEvents(contact, defender, result.events);

      contact.detected = !result.command.targetCleared
        && result.status.state !== OFFSHORE_INTERCEPTION_STATES.PATROL;
      contact.identified = contact.detected;
      contact.classification = this.getThreatClassificationFromProcedure(contact);
      contact.state = this.mapProcedureStateToUiState(contact);

      if (result.command.targetCleared) {
        contact.outcome = 'cleared-non-threat';
        contact.classification = 'neutral';
        this.releaseDefenderAssignment(contact);
      }

      if (result.command.targetNeutralized) {
        this.markThreatDestroyed(contact, 'clean-stop');
      }

      if (defender) {
        defender.pendingCommand = result.command;

        if (result.command.returnToPatrol) {
          defender.assignedTargetId = null;
          defender.pendingCommand = result.command;
          defender.patrolPattern = 'dynamic';
          contact.assignedInterceptorId = null;
        } else {
          contact.assignedInterceptorId = defender.id;
        }
      }

      if (result.command.missionFailed) {
        this.state.offshore.protectedAreaBreached = true;
      }
    }
  }

  updateReserveAvailability() {
    const reserve = this.getReserveUnit();

    if (!reserve || reserve.available || this.state.timeSec < reserve.availableAtSec) {
      return;
    }

    reserve.available = true;
    this.state.offshore.reserveAvailable = true;

    if (!this.reserveAvailableNotified) {
      this.reserveAvailableNotified = true;
      this.emit('reserve-launch-available', {
        description: 'BS 403 is now available for launch after the 5-minute standby window.',
      });
    }
  }

  maybeLaunchReserve() {
    const reserve = this.getReserveUnit();

    if (!reserve || !reserve.available || reserve.launched || !reserve.alive) {
      return;
    }

    const actionableThreats = this.getLiveThreats().filter((contact) => contact.detected || contact.attackActivated);
    const engagingUnits = this.state.friendlyUnits.filter((unit) => unit.alive && unit.assignedTargetId).length;
    const immediateThreat = actionableThreats.some((contact) => {
      const rigMeters = this.getRigPointMeters();
      return distanceMeters(contact, rigMeters) <= (this.metrics.dynamicPatrolRadiusMeters * 1.6);
    });

    if (
      actionableThreats.length === 0
      || (actionableThreats.length <= engagingUnits && !immediateThreat)
    ) {
      return;
    }

    reserve.launched = true;
    reserve.state = 'patrol';
    reserve.desiredSpeedKnots = this.config.ownForces.cruiseSpeedKnots;
    this.state.offshore.reserveLaunched = true;
    this.state.missionScore = Math.max(0, this.state.missionScore - 10);
    this.emit('reserve-launched', {
      description: 'BS 403 launched from reserve to reinforce rig defense.',
    });
  }

  evaluateThreatDetection(contact) {
    const rigMeters = this.getRigPointMeters();
    const distanceToRigMeters = distanceMeters(contact, rigMeters);
    const ranges = this.geometry.sensorRangesNm;
    const radarRangeMeters = nauticalMilesToMeters(ranges.radar);
    const identificationRangeMeters = nauticalMilesToMeters(ranges.opticalIdentification);

    if (!contact.detected && distanceToRigMeters <= radarRangeMeters) {
      contact.detected = true;
      contact.classification = 'suspicious';
      contact.state = 'detecting';
      this.emit('threat-detected', {
        vesselId: contact.id,
        description: `${contact.id} detected by the rig array at ${formatDistanceNm(distanceToRigMeters).toFixed(2)} nm from the rig.`,
      });
      this.emit('vessel-suspicious', {
        vesselId: contact.id,
        description: `${contact.id} is approaching the offshore rig and is under active surveillance.`,
      });
    }

    if (contact.detected && !contact.identified && distanceToRigMeters <= identificationRangeMeters) {
      contact.identified = true;
      contact.classification = 'enemy';
      contact.state = 'tracking';
      this.emit('hostile-identified', {
        vesselId: contact.id,
        description: `${contact.id} identified as a hostile fast boat inside the optical ID envelope.`,
      });
      this.emit('vessel-enemy', {
        vesselId: contact.id,
        description: `${contact.id} declared hostile and assigned for interception.`,
      });
    }
  }

  assignInterceptors() {
    const liveThreats = this.getLiveThreats();

    for (const unit of this.state.friendlyUnits) {
      if (!unit.alive || (unit.id === 'BS 403' && !unit.launched)) {
        unit.assignedTargetId = null;
      }
    }

    for (const threat of liveThreats.filter((contact) => contact.detected)) {
      const candidates = this.state.friendlyUnits.filter((unit) => (
        unit.alive
        && (unit.id !== 'BS 403' || unit.launched)
      ));

      if (candidates.length === 0) {
        continue;
      }

      const selected = [...candidates].sort((left, right) => (
        distanceMeters(left, threat) - distanceMeters(right, threat)
      ))[0];

      if (!selected) {
        continue;
      }

      if (selected.assignedTargetId !== threat.id) {
        selected.assignedTargetId = threat.id;
        threat.assignedInterceptorId = selected.id;
        this.emit('interceptor-assigned', {
          vesselId: selected.id,
          targetId: threat.id,
          description: `${selected.id} assigned to intercept ${threat.id}.`,
        });
      }
    }
  }

  updateFriendlyFuel(unit, dtSec) {
    const burnRatePerHour = this.config.ownForces.fuelBurnLitersPerHourAtCruise
      * Math.max(0, unit.speedKnots / Math.max(1, this.config.ownForces.cruiseSpeedKnots));
    const burnedLiters = burnRatePerHour * (dtSec / 3600);
    unit.fuelLitersRemaining = Math.max(0, unit.fuelLitersRemaining - burnedLiters);
    unit.enduranceRemainingSec = Math.max(0, unit.enduranceRemainingSec - dtSec);
    unit.remainingOperationalRangeNm = Math.max(0, unit.maxOperationalRangeNm - unit.distanceTraveledNm);

    if (unit.fuelLitersRemaining <= 0 || unit.enduranceRemainingSec <= 0) {
      unit.state = 'holding';
      unit.desiredSpeedKnots = 0;
    }
  }

  updateDynamicPatrol(unit, dtSec) {
    this.updateStationKeeping(unit, dtSec);
  }

  updateStationKeeping(unit, dtSec) {
    const homePointNm = {
      x: metersToNauticalMiles(unit.homePositionMeters.x),
      y: metersToNauticalMiles(unit.homePositionMeters.y),
    };
    const distanceToHomeMeters = Math.hypot(
      unit.xMeters - unit.homePositionMeters.x,
      unit.yMeters - unit.homePositionMeters.y,
    );
    const headingToHomeDeg = headingToPoint(unit, homePointNm);
    const holdRadiusMeters = unit.role === 'static' ? 8 : 16;

    unit.state = 'patrol';
    if (distanceToHomeMeters <= holdRadiusMeters) {
      setOffshoreDesiredMotion(unit, unit.homeHeadingDeg, 0);
      unit.xMeters = unit.homePositionMeters.x;
      unit.yMeters = unit.homePositionMeters.y;
      unit.headingDeg = unit.homeHeadingDeg;
      unit.desiredHeadingDeg = unit.homeHeadingDeg;
      unit.velocityXMps = 0;
      unit.velocityYMps = 0;
      unit.driftXMps = 0;
      unit.driftYMps = 0;
      unit.speedKnots = 0;
      unit.desiredSpeedKnots = 0;
      syncOffshoreVesselGeometry(unit);
    } else {
      setOffshoreDesiredMotion(unit, headingToHomeDeg, this.config.ownForces.cruiseSpeedKnots);
      unit.distanceTraveledNm += applyOffshoreMotion(unit, dtSec, this.config.environment, this.config.physics);
    }
  }

  updateInnerRingPatrol(unit, dtSec) {
    this.updateStationKeeping(unit, dtSec);
  }

  updateStaticGuard(unit, dtSec) {
    const rigMeters = this.getRigPointMeters();
    const anchor = pointOnCircle(rigMeters, this.metrics.safetyRadiusMeters, 90);
    const anchorNm = { x: metersToNauticalMiles(anchor.x), y: metersToNauticalMiles(anchor.y) };
    const distanceToAnchorNm = distanceBetween(unit, anchorNm);

    unit.state = 'patrol';
    if (distanceToAnchorNm > 0.03) {
      setOffshoreDesiredMotion(unit, headingToPoint(unit, anchorNm), 8);
    } else {
      setOffshoreDesiredMotion(unit, headingToPoint(unit, this.geometry.rig), 0);
    }

    unit.distanceTraveledNm += applyOffshoreMotion(unit, dtSec, this.config.environment, this.config.physics);
  }

  updateIntercept(unit, threat, dtSec) {
    const distanceToThreatMeters = distanceMeters(unit, threat);
    const weaponRangeMeters = this.metrics.weaponRangeMeters;
    const shouldSetFiringWindow = distanceToThreatMeters <= weaponRangeMeters * 1.2;
    const desiredSpeed = shouldSetFiringWindow ? 10 : Math.min(unit.maxSpeedKnots, 38);

    unit.state = shouldSetFiringWindow ? 'firing' : 'intercepting';
    setOffshoreDesiredMotion(unit, headingToPoint(unit, threat), desiredSpeed);
    unit.distanceTraveledNm += applyOffshoreMotion(unit, dtSec, this.config.environment, this.config.physics);
  }

  applyInterceptCommand(unit, target, dtSec, command) {
    const distanceYards = metersToYards(distanceMeters(unit, target));
    const speedKnots = distanceYards <= command.maintainSafetyRangeYards
      ? 0
      : command.defenderSpeedKnots;

    setOffshoreDesiredMotion(unit, headingToPoint(unit, target), speedKnots);
    unit.state = 'intercept_40_knots';
    unit.distanceTraveledNm += applyOffshoreMotion(unit, dtSec, this.config.environment, this.config.physics);
  }

  applyZigzagCommand(unit, target, dtSec, command) {
    const baseHeading = headingToPoint(unit, target);
    setOffshoreDesiredMotion(unit, normalizeAngleDeg(baseHeading + command.headingOffsetDeg), command.defenderSpeedKnots);
    unit.state = 'zigzag_approach';
    unit.distanceTraveledNm += applyOffshoreMotion(unit, dtSec, this.config.environment, this.config.physics);
  }

  applyFacingTargetCommand(unit, target, dtSec, command) {
    setOffshoreDesiredMotion(unit, headingToPoint(unit, target), command.defenderSpeedKnots);
    unit.state = command.maneuver.replaceAll('-', '_');
    unit.distanceTraveledNm += applyOffshoreMotion(unit, dtSec, this.config.environment, this.config.physics);
  }

  updateReserveHold(unit, dtSec) {
    unit.state = unit.available ? 'ready' : 'standby';
    setOffshoreDesiredMotion(unit, unit.headingDeg, 0);
    unit.distanceTraveledNm += applyOffshoreMotion(unit, dtSec, this.config.environment, this.config.physics);
  }

  updateFriendlies(dtSec) {
    const anyDetectedThreat = this.hasAnyDetectedThreat();

    for (const unit of this.state.friendlyUnits) {
      if (!unit.alive) {
        resetDestroyedEntityMotion(unit);
        syncOffshoreVesselGeometry(unit);
        continue;
      }

      unit.fireCooldownSec = Math.max(0, unit.fireCooldownSec - dtSec);

      if (this.config.environment.seaState >= 4) {
        unit.state = 'holding';
        setOffshoreDesiredMotion(unit, unit.headingDeg, 0);
        unit.distanceTraveledNm += applyOffshoreMotion(unit, dtSec, this.config.environment, this.config.physics);
        this.updateFriendlyFuel(unit, dtSec);
        continue;
      }

      if (unit.id === 'BS 403' && !unit.launched) {
        this.updateReserveHold(unit, dtSec);
        this.updateFriendlyFuel(unit, dtSec);
        continue;
      }

      const target = unit.assignedTargetId
        ? this.state.contacts.find((contact) => contact.id === unit.assignedTargetId && contact.alive)
        : null;
      const command = unit.pendingCommand;

      if (unit.assignedTargetId && !target) {
        unit.assignedTargetId = null;
      }

      if (command?.returnToPatrol) {
        this.updateDynamicPatrol(unit, dtSec);
      } else if (command?.maneuver === 'intercept' && target) {
        this.applyInterceptCommand(unit, target, dtSec, command);
      } else if (command?.maneuver === 'zigzag' && target) {
        this.applyZigzagCommand(unit, target, dtSec, command);
      } else if (command?.maneuver === 'warning-flares' && target) {
        this.applyFacingTargetCommand(unit, target, dtSec, command);
      } else if (command?.maneuver === 'reposition-for-mag' && target) {
        this.applyFacingTargetCommand(unit, target, dtSec, command);
      } else if (command?.maneuver === 'close-after-mag-fail' && target) {
        this.applyFacingTargetCommand(unit, target, dtSec, command);
      } else if (command?.maneuver === 'ram' && target) {
        this.applyFacingTargetCommand(unit, target, dtSec, command);
      } else if (command?.maneuver === 'hold-and-track' && target) {
        setOffshoreDesiredMotion(unit, headingToPoint(unit, target), 0);
        unit.distanceTraveledNm += applyOffshoreMotion(unit, dtSec, this.config.environment, this.config.physics);
      } else if (unit.role === 'dynamic') {
        this.updateDynamicPatrol(unit, dtSec);
      } else if (unit.role === 'static') {
        this.updateInnerRingPatrol(unit, dtSec);
      } else if (unit.role === 'reserve') {
        this.updateReserveHold(unit, dtSec);
      } else {
        this.updateStaticGuard(unit, dtSec);
      }

      this.updateFriendlyFuel(unit, dtSec);
      unit.pendingCommand = null;
    }
  }

  updateThreats(dtSec) {
    const rigMeters = this.getRigPointMeters();

    for (const contact of this.state.contacts) {
      if (!contact.alive) {
        resetDestroyedEntityMotion(contact);
        syncOffshoreVesselGeometry(contact);
        continue;
      }

      if (contact.detected) {
        contact.hostileTimerSec += dtSec;
      }

      if (!contact.attackActivated && this.state.timeSec >= contact.attackStartSec) {
        contact.attackActivated = true;
        this.emit('target_attack_started', {
          vesselId: contact.id,
          description: `${contact.id} transitioned from covert maneuver to direct attack toward the rig.`,
        });
      }

      if (contact.outcome === 'cleared-non-threat') {
        const escapeHeading = headingToPoint(contact, {
          x: this.geometry.widthNm - 1,
          y: contact.y < this.geometry.rig.y ? 1 : this.geometry.heightNm - 1,
        });

        setOffshoreDesiredMotion(contact, escapeHeading, this.config.threats.initialApproachSpeedKnots);
        applyOffshoreMotion(contact, dtSec, this.config.environment, this.config.physics);
        continue;
      }

      let desiredHeading;
      let desiredSpeed;

      if (!contact.attackActivated) {
        desiredHeading = contact.headingDeg;
        desiredSpeed = 0;
        if (contact.interception.state === OFFSHORE_INTERCEPTION_STATES.PATROL) {
          contact.state = 'patrol';
        }
      } else {
        desiredHeading = headingToPoint(contact, this.geometry.rig);
        desiredSpeed = this.config.threats.attackSpeedKnots;
        if (contact.interception.state === OFFSHORE_INTERCEPTION_STATES.PATROL) {
          contact.state = 'attack_run';
        }
      }

      if (contact.firedUpon && contact.evasionMode === 'zigzag') {
        contact.state = 'zigzagging';
        contact.zigzagTimerSec += dtSec;

        if (contact.zigzagTimerSec >= this.config.threats.zigzagLegSeconds) {
          contact.zigzagTimerSec = 0;
          contact.zigzagSign *= -1;
        }

        desiredHeading = normalizeAngleDeg(desiredHeading + (this.config.threats.zigzagAngleDeg * contact.zigzagSign));
        desiredSpeed = this.config.threats.evasiveSpeedKnots;
      }

      setOffshoreDesiredMotion(contact, desiredHeading, desiredSpeed);
      applyOffshoreMotion(contact, dtSec, this.config.environment, this.config.physics);
      this.keepThreatOutsideOuterRing(contact);

      if (distanceMeters(contact, rigMeters) <= this.metrics.safetyRadiusMeters) {
        this.state.offshore.protectedAreaBreached = true;
      }
    }
  }

  resolveFiring() {
    for (const contact of this.state.contacts) {
      if (
        contact.interception?.state !== OFFSHORE_INTERCEPTION_STATES.TARGET_NEUTRALIZED
        || contact.resolutionEventsEmitted
      ) {
        continue;
      }

      const defender = this.getDefenderForContact(contact);

      if (defender) {
        this.emit('weapon-fired', {
          vesselId: defender.id,
          targetId: contact.id,
          x: defender.x,
          y: defender.y,
          description: `${defender.id} fired destructive MAG at ${contact.id}.`,
        });
      }

      this.emit('impact', {
        vesselId: contact.id,
        x: contact.x,
        y: contact.y,
        description: `${contact.id} was hit and stopped before reaching the rig.`,
      });
      this.emit('vessel-neutralized', {
        vesselId: contact.id,
        x: contact.x,
        y: contact.y,
        description: `${contact.id} neutralized without sinking the vessel.`,
      });
      this.emit('interception-success', {
        vesselId: defender?.id ?? null,
        targetId: contact.id,
        description: `${defender?.id ?? 'Defender'} completed a clean interception against ${contact.id}.`,
      });
      contact.resolutionEventsEmitted = true;
    }
  }

  resolveCollisions() {
    for (const unit of this.state.friendlyUnits) {
      if (!unit.alive || !unit.pendingCommand?.ramIntentActive) {
        continue;
      }

      for (const threat of this.state.contacts) {
        if (!threat.alive || threat.id !== unit.assignedTargetId) {
          continue;
        }

        const capsuleGap = distanceBetweenCapsules(unit, threat);

        if (capsuleGap > this.config.physics.collisionDistanceMeters) {
          continue;
        }

        unit.alive = false;
        unit.state = 'collision_resolution';
        unit.health = 0;
        unit.destroyedAtSec = this.state.timeSec;
        resetDestroyedEntityMotion(unit);

        threat.state = 'collision_resolution';
        this.markThreatDestroyed(threat, 'collision');
        threat.interception = {
          ...threat.interception,
          state: OFFSHORE_INTERCEPTION_STATES.COLLISION_RESOLUTION,
        };

        this.state.missionScore = Math.max(0, this.state.missionScore - 35);
        this.emit('collision_occurred', {
          vesselId: unit.id,
          targetId: threat.id,
          x: threat.x,
          y: threat.y,
          description: `${unit.id} collided with ${threat.id} during the ram attempt.`,
        });
        this.emit('collision-event', {
          vesselId: unit.id,
          targetId: threat.id,
          x: threat.x,
          y: threat.y,
          description: `${unit.id} collided with ${threat.id}. The threat was stopped, but the defending vessel was also lost.`,
        });
      }
    }
  }

  cleanupResolvedThreats() {
    const retentionSec = this.config.simulation.destroyedThreatRetentionSeconds ?? 60;

    this.state.contacts = this.state.contacts.filter((contact) => (
      contact.alive
      || contact.destroyedAtSec == null
      || (this.state.timeSec - contact.destroyedAtSec) < retentionSec
    ));
  }

  resolveMissionState() {
    if (this.state.offshore.protectedAreaBreached && this.state.missionStatus === 'active') {
      this.state.missionStatus = 'failed';
      this.state.missionScore = 0;
      this.state.paused = true;
      this.emit('protected-area-penetrated', {
        description: 'A hostile vessel penetrated the 500-yard protected area around the rig.',
      });
      this.emit('mission-failure', {
        description: 'Mission failed: the rig protected area was penetrated.',
      });
      return;
    }

    if (
      this.state.timeSec >= getOffshoreMissionDurationSeconds(this.config)
      && this.state.missionStatus === 'active'
    ) {
      this.state.missionStatus = 'success';
      this.state.paused = true;
      this.emit('mission-success', {
        description: 'Mission success: no hostile vessel penetrated the protected area during the 11-hour mission.',
      });
    }
  }

  sampleMetrics(force = false) {
    this.metricsSampleAccumulatorSec += force === true ? 5 : 0;

    if (!force && this.metricsSampleAccumulatorSec < 5) {
      return;
    }

    this.metricsSampleAccumulatorSec = 0;
    const counts = this.getClassificationCounts();
    const closestEnemyDistance = this.getClosestEnemyDistanceNm();

    this.state.metricsHistory.classifications.push({
      timeSec: this.state.timeSec,
      ...counts,
    });
    this.state.metricsHistory.closestEnemyDistance.push({
      timeSec: this.state.timeSec,
      distanceNm: closestEnemyDistance,
    });
    this.state.metricsHistory.classifications = this.state.metricsHistory.classifications.slice(-180);
    this.state.metricsHistory.closestEnemyDistance = this.state.metricsHistory.closestEnemyDistance.slice(-180);
  }

  update(dtSec) {
    if (this.state.paused) {
      return;
    }

    this.state.timeSec += dtSec;

    if (this.config.environment.seaState >= 4 && !this.missionStatusAnnounced) {
      this.missionStatusAnnounced = true;
      this.emit('sea-state-warning', {
        description: 'Sea state 4+ encountered. Units are holding position and awaiting operator acknowledgement.',
      });
    }

    for (const entity of [...this.state.friendlyUnits, ...this.state.contacts]) {
      saveOffshorePreviousTransform(entity);
    }

    this.updateReserveAvailability();
    this.updateInterceptionProcedures();
    this.maybeLaunchReserve();
    this.updateThreats(dtSec);
    this.updateFriendlies(dtSec);
    this.resolveFiring();
    this.resolveCollisions();
    this.resolveMissionState();
    this.cleanupResolvedThreats();
    this.sampleMetrics();
  }
}
