import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateZigzagAngleDeg,
  createInterceptionCommand,
  isMagUnsafeTowardRig,
  isTargetWithinMagEnvelope,
  stepInterceptionStateMachine,
} from './interceptionStateMachine.js';
import {
  createInitialInterceptionStatus,
  offshoreInterceptionConfig,
  OFFSHORE_INTERCEPTION_STATES,
} from './interceptionConfig.js';
import { createDeterministicDecisionProvider } from './decisionProvider.js';

function makeRigAtOrigin() {
  return { x: 0, y: 0 };
}

function makeTargetAtRangeFromRig(rangeYards, bearingDegrees = 0) {
  return {
    rangeYards,
    bearingDegrees,
  };
}

function makeDefenderAtRangeFromTarget(rangeYards, headingMode = 'toward-target') {
  return {
    rangeYards,
    headingMode,
  };
}

function makeDecisionProvider(options = {}) {
  return createDeterministicDecisionProvider(options);
}

function makeSnapshot(overrides = {}) {
  return {
    timeSec: 0,
    targetId: 'TH-01',
    defenderId: 'BS 401',
    targetRangeToRigYards: 12000,
    targetRangeToDefenderYards: 6000,
    defenderRangeToRigYards: 3000,
    bowToTargetAngleDeg: 0,
    bowToRigAngleDeg: 180,
    targetSpeedKnots: 45,
    insideProtectedArea: false,
    collisionDetected: false,
    ...overrides,
  };
}

function expectEvent(events, type) {
  const event = events.find((item) => item.type === type);
  assert.ok(event, `Expected event ${type}`);
  return event;
}

function expectNoEvent(events, type) {
  assert.equal(events.some((item) => item.type === type), false, `Did not expect event ${type}`);
}

function stepUntilState({
  initialStatus,
  snapshot,
  provider,
  targetState,
  maxSteps = 6,
}) {
  let status = initialStatus;
  let currentSnapshot = { ...snapshot };
  let lastResult = null;

  for (let index = 0; index < maxSteps; index += 1) {
    lastResult = stepInterceptionStateMachine({
      status,
      snapshot: currentSnapshot,
      decisionProvider: provider,
      config: offshoreInterceptionConfig,
    });

    status = lastResult.status;
    currentSnapshot = {
      ...currentSnapshot,
      timeSec: currentSnapshot.timeSec + 5,
    };

    if (status.state === targetState) {
      return lastResult;
    }
  }

  assert.fail(`Failed to reach state ${targetState}. Last state: ${lastResult?.status?.state}`);
}

test('Detection starts the procedure and assigns the defender', () => {
  const rig = makeRigAtOrigin();
  const target = makeTargetAtRangeFromRig(12000);
  const defender = makeDefenderAtRangeFromTarget(7000);

  assert.ok(rig);
  assert.ok(target);
  assert.ok(defender);

  const result = stepInterceptionStateMachine({
    status: createInitialInterceptionStatus(),
    snapshot: makeSnapshot({
      targetRangeToRigYards: 12000,
      targetRangeToDefenderYards: 7000,
    }),
    decisionProvider: makeDecisionProvider(),
    config: offshoreInterceptionConfig,
  });

  assert.equal(result.status.state, OFFSHORE_INTERCEPTION_STATES.SUSPICIOUS_TARGET_DETECTED);
  assert.equal(result.status.assignedDefenderId, 'BS 401');
  expectEvent(result.events, 'target_detected');
});

test('Radio answer branch clears the target and returns to patrol', () => {
  const result = stepInterceptionStateMachine({
    status: createInitialInterceptionStatus({
      state: OFFSHORE_INTERCEPTION_STATES.RADIO_CHALLENGE,
      assignedDefenderId: 'BS 401',
    }),
    snapshot: makeSnapshot({
      targetRangeToRigYards: 9000,
      targetRangeToDefenderYards: 6500,
    }),
    decisionProvider: makeDecisionProvider({
      doesTargetAnswerRadio: true,
    }),
    config: offshoreInterceptionConfig,
  });

  assert.equal(result.status.state, OFFSHORE_INTERCEPTION_STATES.RETURN_TO_PATROL_NON_THREAT);
  expectEvent(result.events, 'target_cleared_non_threat');
  expectEvent(result.events, 'returned_to_patrol');
  assert.equal(result.command.returnToPatrol, true);
  assert.equal(result.command.targetCleared, true);
  expectNoEvent(result.events, 'mag_fired');
  expectNoEvent(result.events, 'ram_pursuit_started');
});

test('Radio no-answer branch starts the 40-knot intercept with signaling', () => {
  const result = stepInterceptionStateMachine({
    status: createInitialInterceptionStatus({
      state: OFFSHORE_INTERCEPTION_STATES.RADIO_CHALLENGE,
      assignedDefenderId: 'BS 401',
    }),
    snapshot: makeSnapshot({
      targetRangeToRigYards: 8000,
      targetRangeToDefenderYards: 6200,
    }),
    decisionProvider: makeDecisionProvider({
      doesTargetAnswerRadio: false,
    }),
    config: offshoreInterceptionConfig,
  });

  assert.equal(result.status.state, OFFSHORE_INTERCEPTION_STATES.INTERCEPT_40_KNOTS);
  expectEvent(result.events, 'intercept_started');
  assert.equal(result.command.defenderSpeedKnots, offshoreInterceptionConfig.initialInterceptSpeedKnots);
  assert.equal(result.command.headingMode, 'target');
  assert.equal(result.command.signalingActive, true);
});

test('Initial intercept preserves the 500-yard safety range command', () => {
  const result = stepInterceptionStateMachine({
    status: createInitialInterceptionStatus({
      state: OFFSHORE_INTERCEPTION_STATES.APPROACH_TO_5000,
      assignedDefenderId: 'BS 401',
    }),
    snapshot: makeSnapshot({
      targetRangeToDefenderYards: 7000,
    }),
    decisionProvider: makeDecisionProvider(),
    config: offshoreInterceptionConfig,
  });

  assert.equal(result.command.maintainSafetyRangeYards, offshoreInterceptionConfig.safetyRangeFromTargetYards);
  assert.equal(result.command.defenderSpeedKnots, 40);
});

test('At 5000 yards zigzag starts with valid angle and alternating intercept heading', () => {
  const result = stepInterceptionStateMachine({
    status: createInitialInterceptionStatus({
      state: OFFSHORE_INTERCEPTION_STATES.APPROACH_TO_5000,
      assignedDefenderId: 'BS 401',
    }),
    snapshot: makeSnapshot({
      targetRangeToDefenderYards: 5000,
      targetSpeedKnots: 18,
    }),
    decisionProvider: makeDecisionProvider(),
    config: offshoreInterceptionConfig,
  });

  assert.equal(result.status.state, OFFSHORE_INTERCEPTION_STATES.ZIGZAG_APPROACH);
  assert.equal(result.command.defenderSpeedKnots, offshoreInterceptionConfig.zigzagSpeedKnots);
  assert.equal(result.command.zigzagEnabled, true);
  assert.ok(result.status.zigzagAngleDeg >= 30 && result.status.zigzagAngleDeg <= 60);
  assert.ok(Math.abs(result.command.headingOffsetDeg) >= 30 && Math.abs(result.command.headingOffsetDeg) <= 60);
  expectEvent(result.events, 'zigzag_started');
});

test('Zigzag angle stays within 30-60 degrees for slow and fast targets', () => {
  const slowAngle = calculateZigzagAngleDeg(5, offshoreInterceptionConfig);
  const fastAngle = calculateZigzagAngleDeg(45, offshoreInterceptionConfig);

  assert.ok(slowAngle >= 30 && slowAngle <= 60);
  assert.ok(fastAngle >= 30 && fastAngle <= 60);
  assert.ok(fastAngle > slowAngle);
  assert.ok(fastAngle < 90);
});

test('At 2000 yards warning flares alternate left and right at 30 knots', () => {
  const status = createInitialInterceptionStatus({
    state: OFFSHORE_INTERCEPTION_STATES.WARNING_FLARES,
    assignedDefenderId: 'BS 401',
    nextWarningFlareSideDeg: -30,
  });

  const first = stepInterceptionStateMachine({
    status,
    snapshot: makeSnapshot({
      timeSec: 20,
      targetRangeToDefenderYards: 1800,
    }),
    decisionProvider: makeDecisionProvider(),
    config: offshoreInterceptionConfig,
  });

  const second = stepInterceptionStateMachine({
    status: first.status,
    snapshot: makeSnapshot({
      timeSec: 25,
      targetRangeToDefenderYards: 1800,
    }),
    decisionProvider: makeDecisionProvider(),
    config: offshoreInterceptionConfig,
  });

  assert.equal(first.command.defenderSpeedKnots, offshoreInterceptionConfig.warningFlarePhaseSpeedKnots);
  assert.equal(first.command.warningFlareSideDeg, -30);
  assert.equal(second.command.warningFlareSideDeg, 30);
  expectEvent(first.events, 'warning_flare_fired');
  expectEvent(second.events, 'warning_flare_fired');
});

test('At 1000 yards operator approval is explicitly requested and destructive fire waits', () => {
  const result = stepInterceptionStateMachine({
    status: createInitialInterceptionStatus({
      state: OFFSHORE_INTERCEPTION_STATES.APPROACH_TO_1000,
      assignedDefenderId: 'BS 401',
    }),
    snapshot: makeSnapshot({
      targetRangeToDefenderYards: 1000,
    }),
    decisionProvider: makeDecisionProvider(),
    config: offshoreInterceptionConfig,
  });

  assert.equal(result.status.state, OFFSHORE_INTERCEPTION_STATES.WAITING_FOR_OPERATOR_APPROVAL);
  assert.equal(result.command.requestOperatorApproval, true);
  expectEvent(result.events, 'operator_approval_requested');
  assert.equal(result.command.magFireRequested, false);
});

test('Operator approval can remain pending without destructive fire when no decision is injected yet', () => {
  const result = stepInterceptionStateMachine({
    status: createInitialInterceptionStatus({
      state: OFFSHORE_INTERCEPTION_STATES.WAITING_FOR_OPERATOR_APPROVAL,
      assignedDefenderId: 'BS 401',
    }),
    snapshot: makeSnapshot({
      targetRangeToDefenderYards: 1000,
    }),
    decisionProvider: makeDecisionProvider({
      isOperatorApprovalGranted: null,
    }),
    config: offshoreInterceptionConfig,
  });

  assert.equal(result.status.state, OFFSHORE_INTERCEPTION_STATES.WAITING_FOR_OPERATOR_APPROVAL);
  assert.equal(result.status.operatorApprovalResolved, false);
  assert.equal(result.command.operatorApprovalPending, true);
  expectNoEvent(result.events, 'mag_fired');
});

test('Operator approval denied prevents destructive MAG fire', () => {
  const result = stepInterceptionStateMachine({
    status: createInitialInterceptionStatus({
      state: OFFSHORE_INTERCEPTION_STATES.WAITING_FOR_OPERATOR_APPROVAL,
      assignedDefenderId: 'BS 401',
    }),
    snapshot: makeSnapshot({
      targetRangeToDefenderYards: 1000,
    }),
    decisionProvider: makeDecisionProvider({
      isOperatorApprovalGranted: false,
    }),
    config: offshoreInterceptionConfig,
  });

  assert.equal(result.status.state, OFFSHORE_INTERCEPTION_STATES.WAITING_FOR_OPERATOR_APPROVAL);
  expectEvent(result.events, 'operator_approval_denied');
  assert.equal(result.command.magFireRequested, false);
});

test('Operator approval granted advances to violent interception approved', () => {
  const result = stepInterceptionStateMachine({
    status: createInitialInterceptionStatus({
      state: OFFSHORE_INTERCEPTION_STATES.WAITING_FOR_OPERATOR_APPROVAL,
      assignedDefenderId: 'BS 401',
    }),
    snapshot: makeSnapshot({
      targetRangeToDefenderYards: 1000,
    }),
    decisionProvider: makeDecisionProvider({
      isOperatorApprovalGranted: true,
    }),
    config: offshoreInterceptionConfig,
  });

  assert.equal(result.status.state, OFFSHORE_INTERCEPTION_STATES.VIOLENT_INTERCEPTION_APPROVED);
  expectEvent(result.events, 'operator_approval_granted');
});

test('MAG fire is blocked when the bow points toward the rig', () => {
  assert.equal(isMagUnsafeTowardRig(makeSnapshot({
    bowToRigAngleDeg: 0,
  })), true);

  const result = stepInterceptionStateMachine({
    status: createInitialInterceptionStatus({
      state: OFFSHORE_INTERCEPTION_STATES.VIOLENT_INTERCEPTION_APPROVED,
      assignedDefenderId: 'BS 401',
      operatorApprovalResolved: true,
      operatorApprovalGranted: true,
    }),
    snapshot: makeSnapshot({
      targetRangeToDefenderYards: 1500,
      bowToTargetAngleDeg: 0,
      bowToRigAngleDeg: 0,
    }),
    decisionProvider: makeDecisionProvider(),
    config: offshoreInterceptionConfig,
  });

  assert.equal(result.status.state, OFFSHORE_INTERCEPTION_STATES.MAG_FIRE_BLOCKED_UNSAFE_RIG_LINE);
  expectEvent(result.events, 'mag_fire_blocked_unsafe_rig_line');
  assert.equal(result.command.magFireRequested, false);
});

test('MAG fire stays blocked when target is outside the firing envelope', () => {
  assert.equal(isTargetWithinMagEnvelope(makeSnapshot({
    bowToTargetAngleDeg: 45,
  })), false);

  const result = stepInterceptionStateMachine({
    status: createInitialInterceptionStatus({
      state: OFFSHORE_INTERCEPTION_STATES.VIOLENT_INTERCEPTION_APPROVED,
      assignedDefenderId: 'BS 401',
      operatorApprovalResolved: true,
      operatorApprovalGranted: true,
    }),
    snapshot: makeSnapshot({
      targetRangeToDefenderYards: 1500,
      bowToTargetAngleDeg: 45,
      bowToRigAngleDeg: 180,
    }),
    decisionProvider: makeDecisionProvider(),
    config: offshoreInterceptionConfig,
  });

  assert.equal(result.status.state, OFFSHORE_INTERCEPTION_STATES.VIOLENT_INTERCEPTION_APPROVED);
  assert.equal(result.command.magFireBlockedOutsideEnvelope, true);
  expectNoEvent(result.events, 'mag_fired');
});

test('MAG fire success neutralizes the target and returns to patrol', () => {
  const fireResult = stepInterceptionStateMachine({
    status: createInitialInterceptionStatus({
      state: OFFSHORE_INTERCEPTION_STATES.VIOLENT_INTERCEPTION_APPROVED,
      assignedDefenderId: 'BS 401',
      operatorApprovalResolved: true,
      operatorApprovalGranted: true,
    }),
    snapshot: makeSnapshot({
      targetRangeToDefenderYards: 1500,
      bowToTargetAngleDeg: 0,
      bowToRigAngleDeg: 180,
    }),
    decisionProvider: makeDecisionProvider({
      doesMagShotSucceed: true,
    }),
    config: offshoreInterceptionConfig,
  });

  assert.equal(fireResult.status.state, OFFSHORE_INTERCEPTION_STATES.TARGET_NEUTRALIZED);
  expectEvent(fireResult.events, 'mag_fired');
  expectEvent(fireResult.events, 'target_neutralized');

  const returnResult = stepInterceptionStateMachine({
    status: fireResult.status,
    snapshot: makeSnapshot({
      timeSec: 5,
    }),
    decisionProvider: makeDecisionProvider(),
    config: offshoreInterceptionConfig,
  });

  assert.equal(returnResult.status.state, OFFSHORE_INTERCEPTION_STATES.RETURN_TO_3000_YARD_PATROL);
  expectEvent(returnResult.events, 'returned_to_patrol');
  assert.equal(returnResult.command.returnToPatrol, true);
  assert.equal(returnResult.command.targetNeutralized, true);
  expectNoEvent(fireResult.events, 'ram_pursuit_started');
});

test('MAG fire failure enters MAG_FAILED and keeps target active', () => {
  const result = stepInterceptionStateMachine({
    status: createInitialInterceptionStatus({
      state: OFFSHORE_INTERCEPTION_STATES.VIOLENT_INTERCEPTION_APPROVED,
      assignedDefenderId: 'BS 401',
      operatorApprovalResolved: true,
      operatorApprovalGranted: true,
    }),
    snapshot: makeSnapshot({
      targetRangeToDefenderYards: 1500,
      bowToTargetAngleDeg: 0,
      bowToRigAngleDeg: 180,
    }),
    decisionProvider: makeDecisionProvider({
      doesMagShotSucceed: false,
    }),
    config: offshoreInterceptionConfig,
  });

  assert.equal(result.status.state, OFFSHORE_INTERCEPTION_STATES.MAG_FAILED);
  expectEvent(result.events, 'mag_failed');
  expectNoEvent(result.events, 'target_neutralized');
});

test('After MAG failure the procedure waits above 200 yards and then starts ram pursuit at 200 yards', () => {
  const prepResult = stepInterceptionStateMachine({
    status: createInitialInterceptionStatus({
      state: OFFSHORE_INTERCEPTION_STATES.CLOSE_RANGE_RAM_PREP,
      assignedDefenderId: 'BS 401',
      magFailed: true,
    }),
    snapshot: makeSnapshot({
      targetRangeToDefenderYards: 250,
    }),
    decisionProvider: makeDecisionProvider(),
    config: offshoreInterceptionConfig,
  });

  assert.equal(prepResult.status.state, OFFSHORE_INTERCEPTION_STATES.CLOSE_RANGE_RAM_PREP);
  assert.equal(prepResult.command.ramIntentActive, false);

  const ramResult = stepInterceptionStateMachine({
    status: prepResult.status,
    snapshot: makeSnapshot({
      timeSec: 10,
      targetRangeToDefenderYards: 200,
    }),
    decisionProvider: makeDecisionProvider(),
    config: offshoreInterceptionConfig,
  });

  assert.equal(ramResult.status.state, OFFSHORE_INTERCEPTION_STATES.MAX_SPEED_PURSUIT);
  expectEvent(ramResult.events, 'ram_pursuit_started');
  assert.equal(ramResult.command.defenderSpeedKnots, offshoreInterceptionConfig.maxSpeedKnots);
  assert.equal(ramResult.command.ramIntentActive, true);
});

test('Collision resolution triggers when the vessel capsules intersect during ram attempt', () => {
  const result = stepInterceptionStateMachine({
    status: createInitialInterceptionStatus({
      state: OFFSHORE_INTERCEPTION_STATES.RAM_ATTEMPT,
      assignedDefenderId: 'BS 401',
      ramIntentActive: true,
    }),
    snapshot: makeSnapshot({
      targetRangeToDefenderYards: 40,
      collisionDetected: true,
    }),
    decisionProvider: makeDecisionProvider(),
    config: offshoreInterceptionConfig,
  });

  assert.equal(result.status.state, OFFSHORE_INTERCEPTION_STATES.COLLISION_RESOLUTION);
  expectEvent(result.events, 'collision_occurred');
});

test('Mission failure triggers when protected area is penetrated before clearance or neutralization', () => {
  const result = stepInterceptionStateMachine({
    status: createInitialInterceptionStatus({
      state: OFFSHORE_INTERCEPTION_STATES.APPROACH_TO_5000,
      assignedDefenderId: 'BS 401',
    }),
    snapshot: makeSnapshot({
      insideProtectedArea: true,
      targetRangeToRigYards: 400,
    }),
    decisionProvider: makeDecisionProvider(),
    config: offshoreInterceptionConfig,
  });

  assert.equal(result.status.state, OFFSHORE_INTERCEPTION_STATES.MISSION_FAILED);
  expectEvent(result.events, 'mission_failed_protected_area_penetrated');
});

test('Return-to-patrol command resets the active intercept outputs for both clear and neutralize branches', () => {
  const cleared = stepInterceptionStateMachine({
    status: createInitialInterceptionStatus({
      state: OFFSHORE_INTERCEPTION_STATES.RETURN_TO_PATROL_NON_THREAT,
      assignedDefenderId: 'BS 401',
      targetAnsweredRadio: true,
    }),
    snapshot: makeSnapshot(),
    decisionProvider: makeDecisionProvider(),
    config: offshoreInterceptionConfig,
  });

  const neutralized = stepInterceptionStateMachine({
    status: createInitialInterceptionStatus({
      state: OFFSHORE_INTERCEPTION_STATES.RETURN_TO_3000_YARD_PATROL,
      assignedDefenderId: 'BS 401',
      targetNeutralized: true,
    }),
    snapshot: makeSnapshot(),
    decisionProvider: makeDecisionProvider(),
    config: offshoreInterceptionConfig,
  });

  assert.equal(cleared.command.returnToPatrol, true);
  assert.equal(cleared.command.zigzagEnabled, false);
  assert.equal(cleared.command.warningFlareSideDeg, null);
  assert.equal(cleared.command.magFireRequested, false);
  assert.equal(cleared.command.ramIntentActive, false);

  assert.equal(neutralized.command.returnToPatrol, true);
  assert.equal(neutralized.command.zigzagEnabled, false);
  assert.equal(neutralized.command.warningFlareSideDeg, null);
  assert.equal(neutralized.command.magFireRequested, false);
  assert.equal(neutralized.command.ramIntentActive, false);
});

test('Separate target procedures keep independent state and decision history', () => {
  const first = stepUntilState({
    initialStatus: createInitialInterceptionStatus(),
    snapshot: makeSnapshot({
      targetId: 'TH-01',
      defenderId: 'BS 401',
      targetRangeToRigYards: 12000,
    }),
    provider: makeDecisionProvider(),
    targetState: OFFSHORE_INTERCEPTION_STATES.RADIO_CHALLENGE,
  });

  const second = stepUntilState({
    initialStatus: createInitialInterceptionStatus(),
    snapshot: makeSnapshot({
      targetId: 'TH-02',
      defenderId: 'BS 402',
      targetRangeToRigYards: 12000,
    }),
    provider: makeDecisionProvider(),
    targetState: OFFSHORE_INTERCEPTION_STATES.RADIO_CHALLENGE,
  });

  assert.equal(first.status.assignedDefenderId, 'BS 401');
  assert.equal(second.status.assignedDefenderId, 'BS 402');
  assert.notEqual(first.status.assignedDefenderId, second.status.assignedDefenderId);
});

test('State machine command builder stays deterministic with no implicit randomness', () => {
  const command = createInterceptionCommand({
    maneuver: 'intercept',
    defenderSpeedKnots: 40,
  });

  assert.deepEqual(command, {
    maneuver: 'intercept',
    defenderSpeedKnots: 40,
    targetSpeedKnots: null,
    maintainSafetyRangeYards: offshoreInterceptionConfig.safetyRangeFromTargetYards,
    headingMode: 'none',
    headingOffsetDeg: 0,
    zigzagEnabled: false,
    zigzagAngleDeg: 0,
    signalingActive: false,
    warningFlareSideDeg: null,
    requestOperatorApproval: false,
    operatorApprovalPending: false,
    operatorApprovalGranted: false,
    operatorApprovalDenied: false,
    magFireRequested: false,
    magFireBlockedUnsafeRigLine: false,
    magFireBlockedOutsideEnvelope: false,
    ramIntentActive: false,
    returnToPatrol: false,
    patrolRadiusYards: offshoreInterceptionConfig.dynamicPatrolRadiusYards,
    targetCleared: false,
    targetNeutralized: false,
    missionFailed: false,
  });
});
