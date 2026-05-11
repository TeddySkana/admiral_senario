import test from 'node:test';
import assert from 'node:assert/strict';
import { OffshoreSimulationEngine } from './OffshoreSimulationEngine.js';
import { cloneOffshoreScenarioConfig, defaultOffshoreScenario, getReserveActivationSeconds } from '../config/offshoreScenario.js';
import { createDeterministicDecisionProvider } from './decisionProvider.js';
import { OFFSHORE_INTERCEPTION_STATES } from './interceptionConfig.js';
import { minutesToSeconds, yardsToMeters } from '../utils/units.js';

function makeCollectingBus() {
  const events = [];
  return {
    events,
    emit(type, payload) {
      events.push({ type, ...payload });
    },
  };
}

function makeEngine({
  configOverrides = {},
  providerOptions = {},
} = {}) {
  const config = cloneOffshoreScenarioConfig(defaultOffshoreScenario);
  Object.assign(config, configOverrides);
  config.randomSeed = 'offshore-procedure-test-seed';
  const bus = makeCollectingBus();
  const engine = new OffshoreSimulationEngine(
    config,
    bus,
    {
      createDecisionProvider: () => createDeterministicDecisionProvider(providerOptions),
    },
  );
  return { engine, bus, config };
}

function countEvents(events, type) {
  return events.filter((event) => event.type === type).length;
}

test('Reserve stays unavailable until 5 simulated minutes elapse, then emits availability once', () => {
  const { engine, bus, config } = makeEngine();
  const reserve = engine.getReserveUnit();
  const activationSec = getReserveActivationSeconds(config);

  engine.update(activationSec - 1);
  assert.equal(reserve.available, false);
  assert.equal(countEvents(bus.events, 'reserve-launch-available'), 0);

  engine.update(1);
  assert.equal(reserve.available, true);
  assert.equal(engine.state.offshore.reserveAvailable, true);
  assert.equal(countEvents(bus.events, 'reserve-launch-available'), 1);
});

test('Reserve launches when available and threat pressure near the rig requires reinforcement', () => {
  const { engine, bus } = makeEngine();
  const reserve = engine.getReserveUnit();
  const rig = engine.getRigPointMeters();
  const pressureThreat = engine.state.contacts[0];

  engine.state.timeSec = reserve.availableAtSec;
  engine.updateReserveAvailability();
  pressureThreat.xMeters = rig.x + engine.metrics.dynamicPatrolRadiusMeters;
  pressureThreat.yMeters = rig.y;
  pressureThreat.attackActivated = true;

  engine.maybeLaunchReserve();

  assert.equal(reserve.launched, true);
  assert.equal(engine.state.offshore.reserveLaunched, true);
  assert.equal(countEvents(bus.events, 'reserve-launched'), 1);
});

test('Offshore attack schedule can synchronize both threats between 5 and 15 minutes', () => {
  const { engine } = makeEngine();
  const threats = [{}, {}];

  engine.random = {
    chance: () => true,
    range: (min, max) => (min + max) / 2,
  };

  engine.assignThreatAttackSchedule(threats);

  assert.equal(threats[0].attackStartSec, minutesToSeconds(10));
  assert.equal(threats[1].attackStartSec, minutesToSeconds(10));
});

test('Offshore attack schedule can stagger threats across the new 5-10 and 15-20 minute windows', () => {
  const { engine } = makeEngine();
  const threats = [{}, {}];
  const ranges = [];

  engine.random = {
    chance: () => false,
    range: (min, max) => {
      ranges.push([min, max]);
      return min;
    },
  };

  engine.assignThreatAttackSchedule(threats);

  assert.deepEqual(ranges, [
    [5, 10],
    [15, 20],
  ]);
  assert.equal(threats[0].attackStartSec, minutesToSeconds(5));
  assert.equal(threats[1].attackStartSec, minutesToSeconds(15));
});

test('Threats spawn and hold position before their attack window', () => {
  const { engine } = makeEngine();

  for (const contact of engine.state.contacts) {
    const startX = contact.xMeters;
    const startY = contact.yMeters;

    engine.update(60);

    assert.equal(contact.attackActivated, false);
    assert.ok(Math.abs(contact.xMeters - startX) < 2);
    assert.ok(Math.abs(contact.yMeters - startY) < 2);
  }
});

test('Two suspicious fast boats keep independent interception assignments in offshore mode', () => {
  const { engine } = makeEngine({
    providerOptions: {
      doesTargetAnswerRadio: false,
    },
  });
  const rig = engine.getRigPointMeters();

  engine.state.contacts[0].xMeters = rig.x + yardsToMeters(11800);
  engine.state.contacts[0].yMeters = rig.y;
  engine.state.contacts[1].xMeters = rig.x;
  engine.state.contacts[1].yMeters = rig.y + yardsToMeters(11700);

  engine.updateInterceptionProcedures();

  const [first, second] = engine.state.contacts;
  assert.equal(first.interception.state, OFFSHORE_INTERCEPTION_STATES.SUSPICIOUS_TARGET_DETECTED);
  assert.equal(second.interception.state, OFFSHORE_INTERCEPTION_STATES.SUSPICIOUS_TARGET_DETECTED);
  assert.notEqual(first.interception, second.interception);
  const assignedDefenders = [first.interception.assignedDefenderId, second.interception.assignedDefenderId].sort();
  assert.deepEqual(assignedDefenders, ['BS 401', 'BS 402']);
});

test('Clean MAG neutralization events are emitted once even if resolveFiring is called repeatedly', () => {
  const { engine, bus } = makeEngine();
  const contact = engine.state.contacts[0];

  contact.interception = {
    ...contact.interception,
    state: OFFSHORE_INTERCEPTION_STATES.TARGET_NEUTRALIZED,
    assignedDefenderId: 'BS 401',
  };

  engine.resolveFiring();
  engine.resolveFiring();

  assert.equal(countEvents(bus.events, 'weapon-fired'), 1);
  assert.equal(countEvents(bus.events, 'interception-success'), 1);
  assert.equal(contact.resolutionEventsEmitted, true);
});

test('Destroyed threats stay visible for one minute and then get removed while freeing the patrol vessel', () => {
  const { engine } = makeEngine();
  const contact = engine.state.contacts[0];
  const defender = engine.state.friendlyUnits.find((unit) => unit.id === 'BS 401');

  defender.assignedTargetId = contact.id;
  contact.interception.assignedDefenderId = defender.id;
  engine.markThreatDestroyed(contact, 'clean-stop');

  assert.equal(defender.assignedTargetId, null);
  assert.equal(contact.destroyedAtSec, 0);

  engine.state.timeSec = 59;
  engine.cleanupResolvedThreats();
  assert.ok(engine.state.contacts.some((item) => item.id === contact.id));

  engine.state.timeSec = 60;
  engine.cleanupResolvedThreats();
  assert.equal(engine.state.contacts.some((item) => item.id === contact.id), false);
});

test('Dynamic patrol vessel falls back to station-keeping when its handled target is already gone', () => {
  const { engine } = makeEngine();
  const defender = engine.state.friendlyUnits.find((unit) => unit.id === 'BS 401');
  const removedTargetId = engine.state.contacts[0].id;
  const startPosition = { x: defender.xMeters, y: defender.yMeters };

  defender.assignedTargetId = removedTargetId;
  engine.state.contacts = engine.state.contacts.filter((contact) => contact.id !== removedTargetId);

  engine.updateFriendlies(1);

  assert.equal(defender.assignedTargetId, null);
  assert.equal(defender.state, 'patrol');
  assert.ok(Math.abs(defender.xMeters - startPosition.x) < 1);
  assert.ok(Math.abs(defender.yMeters - startPosition.y) < 1);
});

test('Dynamic patrol vessel holds its assigned station before handling attacks', () => {
  const { engine } = makeEngine();
  const defender = engine.state.friendlyUnits.find((unit) => unit.id === 'BS 401');
  const startPosition = { x: defender.xMeters, y: defender.yMeters };

  for (let index = 0; index < 240; index += 1) {
    engine.update(1);
  }

  assert.ok(Math.abs(defender.xMeters - startPosition.x) < 12);
  assert.ok(Math.abs(defender.yMeters - startPosition.y) < 12);
  assert.equal(defender.assignedTargetId, null);
});

test('Friendly vessels return to their original stations after an intercept command clears', () => {
  const { engine } = makeEngine();
  const defender = engine.state.friendlyUnits.find((unit) => unit.id === 'BS 401');
  const target = engine.state.contacts[0];
  const station = { ...defender.homePositionMeters };

  defender.assignedTargetId = target.id;
  engine.applyInterceptCommand(defender, target, 10, {
    defenderSpeedKnots: 40,
    maintainSafetyRangeYards: 500,
  });

  engine.markThreatDestroyed(target, 'clean-stop');

  for (let index = 0; index < 180; index += 1) {
    engine.updateFriendlies(1);
  }

  assert.ok(Math.abs(defender.xMeters - station.x) < 20);
  assert.ok(Math.abs(defender.yMeters - station.y) < 20);
  assert.equal(defender.assignedTargetId, null);
});
