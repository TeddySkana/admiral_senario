import { cloneScenarioConfig, deriveScenarioGeometry, getEngagementRangeNm, PATROL_LINE_KEYS } from './config/defaultScenario.js';
import { createCargoShip } from './entities/cargoShip.js';
import { createFishingBoat } from './entities/fishingBoat.js';
import { createFriendlyBoat } from './entities/friendly.js';
import { updateContactClassifications } from './systems/ClassificationSystem.js';
import { maybePromoteFishingAttacker, updateCargoBehavior, updateFishingBoatBehavior } from './systems/ContactBehaviorSystem.js';
import { assignInterceptor, resolveCombatStates, updateInterceptions } from './systems/InterceptionSystem.js';
import { updateFriendlyPatrolBoat } from './systems/PatrolSystem.js';
import { distanceToNearestProtectedBorder, randomPointInPolygon } from './utils/geometry.js';
import { savePreviousTransform, steerEntityOnHeading } from './utils/kinematics.js';
import { createSeededRandom } from './utils/random.js';

function buildWestAttackTarget(geometry, random) {
  return {
    x: geometry.westBorderXNm - random.range(0.1, 0.45),
    y: random.range(geometry.northBorderYNm + 0.5, geometry.southBorderYNm - 0.5),
  };
}

function describePatrolLine(key) {
  return `${key} patrol line`;
}

export class SimulationEngine {
  constructor(config, eventBus) {
    this.config = cloneScenarioConfig(config);
    this.eventBus = eventBus;
    this.geometry = deriveScenarioGeometry(this.config);
    this.engagementRangeNm = getEngagementRangeNm(this.config);
    this.random = createSeededRandom(this.config.randomSeed);
    this.nextEventId = 1;
    this.nextContactNumber = 1;
    this.nextFriendlyNumber = 1;
    this.pendingRemovalIds = new Set();
    this.metricsSampleAccumulatorSec = 0;
    this.state = this.createEmptyState();
    this.initializeScenario();
  }

  createEmptyState() {
    return {
      timeSec: 0,
      paused: false,
      friendlyUnits: [],
      contacts: [],
      eventLog: [],
      metricsHistory: {
        classifications: [],
        closestEnemyDistance: [],
      },
    };
  }

  initializeScenario() {
    this.state = this.createEmptyState();
    this.geometry = deriveScenarioGeometry(this.config);
    this.random = createSeededRandom(this.config.randomSeed);
    this.pendingRemovalIds.clear();
    this.metricsSampleAccumulatorSec = 0;
    this.nextEventId = 1;
    this.nextContactNumber = 1;
    this.nextFriendlyNumber = 1;

    this.spawnFriendlies();
    this.spawnFishingBoats();
    this.spawnCargoTraffic();
    this.sampleMetrics(true);
  }

  spawnFriendlies() {
    const count = Math.max(3, this.config.dvora.friendlyBoatCount);

    for (let index = 0; index < count; index += 1) {
      const patrolLineKey = PATROL_LINE_KEYS[index % PATROL_LINE_KEYS.length];
      const line = this.geometry.patrolLines[patrolLineKey];
      const unit = createFriendlyBoat({
        id: `DV-${String(this.nextFriendlyNumber).padStart(2, '0')}`,
        patrolLineKey,
        line,
        config: this.config,
        startFraction: [0.2, 0.55, 0.85][index % 3],
      });

      this.nextFriendlyNumber += 1;
      this.state.friendlyUnits.push(unit);
      this.emit('vessel-detected', {
        vesselId: unit.id,
        description: `${unit.id} entered the simulation on the ${describePatrolLine(patrolLineKey)}.`,
      });
    }
  }

  spawnFishingBoats() {
    const { fishingBoatCount } = this.config.contacts;
    const {
      fishingSpeedMinKnots,
      fishingSpeedMaxKnots,
      hostileSpeedMinKnots,
      hostileSpeedMaxKnots,
    } = this.config.spawnBehavior;

    for (let index = 0; index < fishingBoatCount; index += 1) {
      const position = randomPointInPolygon(this.random, this.geometry.fishingPolygon);
      const homePoint = randomPointInPolygon(this.random, this.geometry.fishingPolygon);
      const wanderWaypoint = randomPointInPolygon(this.random, this.geometry.fishingPolygon);
      const contact = createFishingBoat({
        id: `FB-${String(this.nextContactNumber).padStart(2, '0')}`,
        position,
        homePoint,
        wanderWaypoint,
        attackTarget: buildWestAttackTarget(this.geometry, this.random),
        speedKnots: this.random.range(fishingSpeedMinKnots, fishingSpeedMaxKnots),
        hostileSpeedKnots: this.random.range(hostileSpeedMinKnots, hostileSpeedMaxKnots),
      });

      this.nextContactNumber += 1;
      this.state.contacts.push(contact);
      this.emit('vessel-detected', {
        vesselId: contact.id,
        description: `${contact.id} was detected inside the fishing zone.`,
      });
    }
  }

  spawnCargoTraffic() {
    if (!this.config.spawnBehavior.enableNeutralLaneTraffic) {
      return;
    }

    for (let index = 0; index < this.config.contacts.cargoShipCount; index += 1) {
      const headingDeg = index % 2 === 0 ? 180 : 0;
      const contact = createCargoShip({
        id: `NV-${String(this.nextContactNumber).padStart(2, '0')}`,
        x: this.random.range(this.geometry.shippingLane.westXNm + 0.25, this.geometry.shippingLane.eastXNm - 0.25),
        y: index % 2 === 0 ? this.random.range(0.2, 4.5) : this.random.range(this.geometry.heightNm - 4.5, this.geometry.heightNm - 0.2),
        headingDeg,
        speedKnots: this.random.range(this.config.spawnBehavior.cargoSpeedMinKnots, this.config.spawnBehavior.cargoSpeedMaxKnots),
      });

      this.nextContactNumber += 1;
      this.state.contacts.push(contact);
      this.emit('vessel-detected', {
        vesselId: contact.id,
        description: `${contact.id} was detected in the west neutral shipping lane.`,
      });
    }
  }

  createContext() {
    return {
      config: this.config,
      geometry: this.geometry,
      random: this.random,
      state: this.state,
      engagementRangeNm: this.engagementRangeNm,
      emit: (type, payload) => this.emit(type, payload),
      queueRemoval: (id) => this.pendingRemovalIds.add(id),
    };
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
    this.state.eventLog = this.state.eventLog.slice(0, 250);
    this.eventBus.emit(type, event);
  }

  pause() {
    if (this.state.paused) {
      return;
    }

    this.state.paused = true;
    this.emit('simulation-paused', {
      description: 'Simulation paused.',
    });
  }

  resume() {
    if (!this.state.paused) {
      return;
    }

    this.state.paused = false;
    this.emit('simulation-resumed', {
      description: 'Simulation resumed.',
    });
  }

  reset() {
    this.initializeScenario();
    this.emit('simulation-reset', {
      description: 'Simulation reset to its initial seeded state.',
    });
  }

  update(dtSec) {
    if (this.state.paused) {
      return;
    }

    this.state.timeSec += dtSec;
    const context = this.createContext();

    for (const entity of [...this.state.friendlyUnits, ...this.state.contacts]) {
      savePreviousTransform(entity);
    }

    maybePromoteFishingAttacker(dtSec, context);

    for (const contact of this.state.contacts) {
      if (contact.type === 'fishing') {
        updateFishingBoatBehavior(contact, dtSec, context);
      }

      if (contact.type === 'cargo') {
        updateCargoBehavior(contact, dtSec, context);
      }
    }

    updateContactClassifications(this.state.contacts, dtSec, context);

    for (const contact of this.state.contacts) {
      if (
        (contact.classification === 'enemy' || contact.classification === 'target')
        && contact.alive
        && !contact.assignedInterceptorId
      ) {
        assignInterceptor(contact, this.state.friendlyUnits, context);
      }
    }

    for (const unit of this.state.friendlyUnits) {
      updateFriendlyPatrolBoat(unit, dtSec, context);
    }

    updateInterceptions(this.state.friendlyUnits, this.state.contacts, dtSec, context);
    resolveCombatStates(this.state.friendlyUnits, this.state.contacts, context);

    for (const contact of this.state.contacts) {
      if (contact.isSinking && contact.removalAtSec != null) {
        steerEntityOnHeading(contact, contact.headingDeg, 0, dtSec);
      }
    }

    this.cleanupRemovedContacts();
    this.sampleMetrics(dtSec);
  }

  cleanupRemovedContacts() {
    if (this.pendingRemovalIds.size === 0) {
      return;
    }

    this.state.contacts = this.state.contacts.filter((contact) => !this.pendingRemovalIds.has(contact.id));
    this.pendingRemovalIds.clear();
  }

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
      } else if (contact.classification === 'target') {
        counts.target += 1;
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
    const enemies = this.state.contacts.filter((contact) => (
      contact.classification === 'enemy' || contact.classification === 'target'
    ));

    if (enemies.length === 0) {
      return null;
    }

    return Math.min(...enemies.map((enemy) => distanceToNearestProtectedBorder(enemy, this.geometry)));
  }

  sampleMetrics(dtSec = 0) {
    this.metricsSampleAccumulatorSec += dtSec;

    if (dtSec !== 0 && this.metricsSampleAccumulatorSec < 5) {
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

  destroy() {
    this.pendingRemovalIds.clear();
  }
}
