import { clamp } from '../utils/math.js';
import {
  createInitialInterceptionStatus,
  offshoreInterceptionConfig,
  OFFSHORE_INTERCEPTION_STATES,
} from './interceptionConfig.js';

function transition(status, nextState, timeSec) {
  return {
    ...status,
    state: nextState,
    lastStateChangeSec: timeSec,
  };
}

function createEvent(type, payload = {}) {
  return {
    type,
    ...payload,
  };
}

export function calculateZigzagAngleDeg(targetSpeedKnots, config = offshoreInterceptionConfig) {
  const ratio = clamp(targetSpeedKnots / Math.max(1, config.initialInterceptSpeedKnots), 0, 1);
  return config.zigzagAngleMinDeg + ((config.zigzagAngleMaxDeg - config.zigzagAngleMinDeg) * ratio);
}

export function isTargetWithinMagEnvelope(snapshot, config = offshoreInterceptionConfig) {
  return Math.abs(snapshot.bowToTargetAngleDeg ?? 180) <= config.magFiringEnvelopeHalfAngleDeg;
}

export function isMagUnsafeTowardRig(snapshot, config = offshoreInterceptionConfig) {
  return Math.abs(snapshot.bowToRigAngleDeg ?? 180) <= config.unsafeRigLineHalfAngleDeg;
}

export function createInterceptionCommand(overrides = {}) {
  return {
    maneuver: 'none',
    defenderSpeedKnots: 0,
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
    ...overrides,
  };
}

function finalize(status, command, events) {
  return { status, command, events };
}

export function stepInterceptionStateMachine({
  status = createInitialInterceptionStatus(),
  snapshot,
  decisionProvider,
  config = offshoreInterceptionConfig,
}) {
  let nextStatus = { ...status };
  const events = [];
  let command = createInterceptionCommand();

  if (snapshot.insideProtectedArea) {
    nextStatus = transition(nextStatus, OFFSHORE_INTERCEPTION_STATES.MISSION_FAILED, snapshot.timeSec);
    nextStatus.missionFailed = true;
    events.push(createEvent('mission_failed_protected_area_penetrated', {
      targetId: snapshot.targetId,
      defenderId: snapshot.defenderId,
    }));
    command = createInterceptionCommand({
      missionFailed: true,
    });
    return finalize(nextStatus, command, events);
  }

  switch (nextStatus.state) {
    case OFFSHORE_INTERCEPTION_STATES.PATROL: {
      if (snapshot.targetRangeToRigYards <= config.detectionRangeYards) {
        nextStatus = transition(nextStatus, OFFSHORE_INTERCEPTION_STATES.SUSPICIOUS_TARGET_DETECTED, snapshot.timeSec);
        nextStatus.assignedDefenderId = snapshot.defenderId ?? nextStatus.assignedDefenderId;
        events.push(createEvent('target_detected', {
          targetId: snapshot.targetId,
          defenderId: snapshot.defenderId,
        }));
        command = createInterceptionCommand({
          maneuver: 'track',
          targetSpeedKnots: snapshot.targetSpeedKnots,
        });
      }
      return finalize(nextStatus, command, events);
    }

    case OFFSHORE_INTERCEPTION_STATES.SUSPICIOUS_TARGET_DETECTED: {
      nextStatus = transition(nextStatus, OFFSHORE_INTERCEPTION_STATES.RADIO_CHALLENGE, snapshot.timeSec);
      events.push(createEvent('radio_challenge_started', {
        targetId: snapshot.targetId,
        defenderId: snapshot.defenderId,
      }));
      command = createInterceptionCommand({
        maneuver: 'radio-challenge',
        signalingActive: true,
        targetSpeedKnots: snapshot.targetSpeedKnots,
      });
      return finalize(nextStatus, command, events);
    }

    case OFFSHORE_INTERCEPTION_STATES.RADIO_CHALLENGE: {
      command = createInterceptionCommand({
        maneuver: 'radio-challenge',
        signalingActive: true,
      });

      if (
        !nextStatus.radioDecisionMade
        && snapshot.targetRangeToRigYards <= config.radioChallengeStartYards
        && snapshot.targetRangeToRigYards >= config.radioChallengeEndYards
      ) {
        const answered = Boolean(decisionProvider.doesTargetAnswerRadio(snapshot));
        nextStatus.radioDecisionMade = true;
        nextStatus.targetAnsweredRadio = answered;

        if (answered) {
          nextStatus = transition(nextStatus, OFFSHORE_INTERCEPTION_STATES.RETURN_TO_PATROL_NON_THREAT, snapshot.timeSec);
          events.push(createEvent('target_answered_radio', {
            targetId: snapshot.targetId,
            defenderId: snapshot.defenderId,
          }));
          events.push(createEvent('target_cleared_non_threat', {
            targetId: snapshot.targetId,
            defenderId: snapshot.defenderId,
          }));
          events.push(createEvent('returned_to_patrol', {
            targetId: snapshot.targetId,
            defenderId: snapshot.defenderId,
          }));
          command = createInterceptionCommand({
            maneuver: 'return-to-patrol',
            returnToPatrol: true,
            targetCleared: true,
          });
        } else {
          nextStatus = transition(nextStatus, OFFSHORE_INTERCEPTION_STATES.INTERCEPT_40_KNOTS, snapshot.timeSec);
          nextStatus.interceptStarted = true;
          nextStatus.signalingActive = true;
          events.push(createEvent('target_did_not_answer_radio', {
            targetId: snapshot.targetId,
            defenderId: snapshot.defenderId,
          }));
          events.push(createEvent('intercept_started', {
            targetId: snapshot.targetId,
            defenderId: snapshot.defenderId,
          }));
          events.push(createEvent('signaling_lights_and_flares_active', {
            targetId: snapshot.targetId,
            defenderId: snapshot.defenderId,
          }));
          command = createInterceptionCommand({
            maneuver: 'intercept',
            defenderSpeedKnots: config.initialInterceptSpeedKnots,
            headingMode: 'target',
            maintainSafetyRangeYards: config.safetyRangeFromTargetYards,
            signalingActive: true,
          });
        }
      }

      return finalize(nextStatus, command, events);
    }

    case OFFSHORE_INTERCEPTION_STATES.RETURN_TO_PATROL_NON_THREAT: {
      command = createInterceptionCommand({
        maneuver: 'return-to-patrol',
        returnToPatrol: true,
        patrolRadiusYards: config.dynamicPatrolRadiusYards,
        targetCleared: true,
      });
      return finalize(nextStatus, command, events);
    }

    case OFFSHORE_INTERCEPTION_STATES.INTERCEPT_40_KNOTS: {
      nextStatus = transition(nextStatus, OFFSHORE_INTERCEPTION_STATES.APPROACH_TO_5000, snapshot.timeSec);
      command = createInterceptionCommand({
        maneuver: 'intercept',
        defenderSpeedKnots: config.initialInterceptSpeedKnots,
        headingMode: 'target',
        maintainSafetyRangeYards: config.safetyRangeFromTargetYards,
        signalingActive: true,
      });
      return finalize(nextStatus, command, events);
    }

    case OFFSHORE_INTERCEPTION_STATES.APPROACH_TO_5000: {
      command = createInterceptionCommand({
        maneuver: 'intercept',
        defenderSpeedKnots: config.initialInterceptSpeedKnots,
        headingMode: 'target',
        maintainSafetyRangeYards: config.safetyRangeFromTargetYards,
        signalingActive: true,
      });

      if (snapshot.targetRangeToDefenderYards <= config.zigzagTriggerDistanceYards) {
        nextStatus = transition(nextStatus, OFFSHORE_INTERCEPTION_STATES.ZIGZAG_APPROACH, snapshot.timeSec);
        nextStatus.zigzagAngleDeg = calculateZigzagAngleDeg(snapshot.targetSpeedKnots, config);
        events.push(createEvent('zigzag_started', {
          targetId: snapshot.targetId,
          defenderId: snapshot.defenderId,
          zigzagAngleDeg: nextStatus.zigzagAngleDeg,
        }));
        command = createInterceptionCommand({
          maneuver: 'zigzag',
          defenderSpeedKnots: config.zigzagSpeedKnots,
          headingMode: 'target-offset',
          headingOffsetDeg: nextStatus.zigzagDirection * nextStatus.zigzagAngleDeg,
          zigzagEnabled: true,
          zigzagAngleDeg: nextStatus.zigzagAngleDeg,
          maintainSafetyRangeYards: config.safetyRangeFromTargetYards,
        });
      }

      return finalize(nextStatus, command, events);
    }

    case OFFSHORE_INTERCEPTION_STATES.ZIGZAG_APPROACH: {
      if (snapshot.timeSec - nextStatus.lastStateChangeSec >= config.zigzagSwitchIntervalSec) {
        nextStatus.zigzagDirection *= -1;
        nextStatus.lastStateChangeSec = snapshot.timeSec;
      }

      command = createInterceptionCommand({
        maneuver: 'zigzag',
        defenderSpeedKnots: config.zigzagSpeedKnots,
        headingMode: 'target-offset',
        headingOffsetDeg: nextStatus.zigzagDirection * nextStatus.zigzagAngleDeg,
        zigzagEnabled: true,
        zigzagAngleDeg: nextStatus.zigzagAngleDeg,
        maintainSafetyRangeYards: config.safetyRangeFromTargetYards,
      });

      if (snapshot.targetRangeToDefenderYards <= config.warningFlareTriggerDistanceYards) {
        nextStatus = transition(nextStatus, OFFSHORE_INTERCEPTION_STATES.APPROACH_TO_2000, snapshot.timeSec);
      }

      return finalize(nextStatus, command, events);
    }

    case OFFSHORE_INTERCEPTION_STATES.APPROACH_TO_2000: {
      nextStatus = transition(nextStatus, OFFSHORE_INTERCEPTION_STATES.WARNING_FLARES, snapshot.timeSec);
      command = createInterceptionCommand({
        maneuver: 'warning-flares',
        defenderSpeedKnots: config.warningFlarePhaseSpeedKnots,
        headingMode: 'target',
      });
      return finalize(nextStatus, command, events);
    }

    case OFFSHORE_INTERCEPTION_STATES.WARNING_FLARES: {
      command = createInterceptionCommand({
        maneuver: 'warning-flares',
        defenderSpeedKnots: config.warningFlarePhaseSpeedKnots,
        headingMode: 'target',
      });

      if (
        nextStatus.lastWarningFlareSec == null
        || snapshot.timeSec - nextStatus.lastWarningFlareSec >= config.warningFlareIntervalSec
      ) {
        nextStatus.lastWarningFlareSec = snapshot.timeSec;
        const sideDeg = nextStatus.nextWarningFlareSideDeg;
        nextStatus.nextWarningFlareSideDeg = sideDeg === config.warningFlareOffsetAnglesDeg[0]
          ? config.warningFlareOffsetAnglesDeg[1]
          : config.warningFlareOffsetAnglesDeg[0];
        events.push(createEvent('warning_flare_fired', {
          targetId: snapshot.targetId,
          defenderId: snapshot.defenderId,
          sideDeg,
        }));
        command.warningFlareSideDeg = sideDeg;
      }

      if (snapshot.targetRangeToDefenderYards <= config.operatorApprovalTriggerDistanceYards) {
        nextStatus = transition(nextStatus, OFFSHORE_INTERCEPTION_STATES.APPROACH_TO_1000, snapshot.timeSec);
      }

      return finalize(nextStatus, command, events);
    }

    case OFFSHORE_INTERCEPTION_STATES.APPROACH_TO_1000: {
      nextStatus = transition(nextStatus, OFFSHORE_INTERCEPTION_STATES.WAITING_FOR_OPERATOR_APPROVAL, snapshot.timeSec);
      nextStatus.operatorApprovalRequested = true;
      events.push(createEvent('operator_approval_requested', {
        targetId: snapshot.targetId,
        defenderId: snapshot.defenderId,
      }));
      command = createInterceptionCommand({
        maneuver: 'hold-and-track',
        defenderSpeedKnots: 0,
        headingMode: 'target',
        requestOperatorApproval: true,
        operatorApprovalPending: true,
      });
      return finalize(nextStatus, command, events);
    }

    case OFFSHORE_INTERCEPTION_STATES.WAITING_FOR_OPERATOR_APPROVAL: {
      command = createInterceptionCommand({
        maneuver: 'hold-and-track',
        defenderSpeedKnots: 0,
        headingMode: 'target',
        requestOperatorApproval: true,
        operatorApprovalPending: true,
      });

      if (!nextStatus.operatorApprovalResolved) {
        const approved = decisionProvider.isOperatorApprovalGranted(snapshot);

        if (approved == null) {
          return finalize(nextStatus, command, events);
        }

        nextStatus.operatorApprovalResolved = true;
        nextStatus.operatorApprovalGranted = Boolean(approved);

        if (approved) {
          nextStatus = transition(nextStatus, OFFSHORE_INTERCEPTION_STATES.VIOLENT_INTERCEPTION_APPROVED, snapshot.timeSec);
          events.push(createEvent('operator_approval_granted', {
            targetId: snapshot.targetId,
            defenderId: snapshot.defenderId,
          }));
          command = createInterceptionCommand({
            maneuver: 'reposition-for-mag',
            defenderSpeedKnots: config.warningFlarePhaseSpeedKnots,
            headingMode: 'target',
            operatorApprovalGranted: true,
          });
        } else {
          events.push(createEvent('operator_approval_denied', {
            targetId: snapshot.targetId,
            defenderId: snapshot.defenderId,
          }));
          command.operatorApprovalDenied = true;
        }
      }

      return finalize(nextStatus, command, events);
    }

    case OFFSHORE_INTERCEPTION_STATES.VIOLENT_INTERCEPTION_APPROVED: {
      if (isMagUnsafeTowardRig(snapshot, config)) {
        nextStatus = transition(nextStatus, OFFSHORE_INTERCEPTION_STATES.MAG_FIRE_BLOCKED_UNSAFE_RIG_LINE, snapshot.timeSec);
        events.push(createEvent('mag_fire_blocked_unsafe_rig_line', {
          targetId: snapshot.targetId,
          defenderId: snapshot.defenderId,
        }));
        command = createInterceptionCommand({
          maneuver: 'reposition-for-mag',
          defenderSpeedKnots: config.warningFlarePhaseSpeedKnots,
          headingMode: 'target',
          magFireBlockedUnsafeRigLine: true,
        });
        return finalize(nextStatus, command, events);
      }

      if (
        snapshot.targetRangeToDefenderYards > config.magRangeYards
        || !isTargetWithinMagEnvelope(snapshot, config)
      ) {
        command = createInterceptionCommand({
          maneuver: 'reposition-for-mag',
          defenderSpeedKnots: config.warningFlarePhaseSpeedKnots,
          headingMode: 'target',
          magFireBlockedOutsideEnvelope: !isTargetWithinMagEnvelope(snapshot, config),
        });
        return finalize(nextStatus, command, events);
      }

      nextStatus = transition(nextStatus, OFFSHORE_INTERCEPTION_STATES.MAG_DESTRUCTIVE_FIRE, snapshot.timeSec);
      nextStatus.magAttempted = true;
      events.push(createEvent('mag_fired', {
        targetId: snapshot.targetId,
        defenderId: snapshot.defenderId,
      }));

      const magSucceeded = Boolean(decisionProvider.doesMagShotSucceed(snapshot));

      if (magSucceeded) {
        nextStatus.magSucceeded = true;
        nextStatus.targetNeutralized = true;
        nextStatus = transition(nextStatus, OFFSHORE_INTERCEPTION_STATES.TARGET_NEUTRALIZED, snapshot.timeSec);
        events.push(createEvent('target_neutralized', {
          targetId: snapshot.targetId,
          defenderId: snapshot.defenderId,
        }));
        command = createInterceptionCommand({
          maneuver: 'neutralized',
          magFireRequested: true,
          targetNeutralized: true,
        });
      } else {
        nextStatus.magFailed = true;
        nextStatus = transition(nextStatus, OFFSHORE_INTERCEPTION_STATES.MAG_FAILED, snapshot.timeSec);
        events.push(createEvent('mag_failed', {
          targetId: snapshot.targetId,
          defenderId: snapshot.defenderId,
        }));
        command = createInterceptionCommand({
          maneuver: 'close-after-mag-fail',
          defenderSpeedKnots: config.warningFlarePhaseSpeedKnots,
          headingMode: 'target',
          magFireRequested: true,
        });
      }

      return finalize(nextStatus, command, events);
    }

    case OFFSHORE_INTERCEPTION_STATES.MAG_FIRE_BLOCKED_UNSAFE_RIG_LINE: {
      command = createInterceptionCommand({
        maneuver: 'reposition-for-mag',
        defenderSpeedKnots: config.warningFlarePhaseSpeedKnots,
        headingMode: 'target',
        magFireBlockedUnsafeRigLine: true,
      });

      if (!isMagUnsafeTowardRig(snapshot, config)) {
        nextStatus = transition(nextStatus, OFFSHORE_INTERCEPTION_STATES.VIOLENT_INTERCEPTION_APPROVED, snapshot.timeSec);
      }

      return finalize(nextStatus, command, events);
    }

    case OFFSHORE_INTERCEPTION_STATES.TARGET_NEUTRALIZED: {
      nextStatus = transition(nextStatus, OFFSHORE_INTERCEPTION_STATES.RETURN_TO_3000_YARD_PATROL, snapshot.timeSec);
      events.push(createEvent('returned_to_patrol', {
        targetId: snapshot.targetId,
        defenderId: snapshot.defenderId,
      }));
      command = createInterceptionCommand({
        maneuver: 'return-to-patrol',
        returnToPatrol: true,
        targetNeutralized: true,
      });
      return finalize(nextStatus, command, events);
    }

    case OFFSHORE_INTERCEPTION_STATES.RETURN_TO_3000_YARD_PATROL: {
      nextStatus.returnedToPatrol = true;
      command = createInterceptionCommand({
        maneuver: 'return-to-patrol',
        returnToPatrol: true,
        patrolRadiusYards: config.dynamicPatrolRadiusYards,
        targetNeutralized: nextStatus.targetNeutralized,
        targetCleared: nextStatus.targetAnsweredRadio,
      });
      return finalize(nextStatus, command, events);
    }

    case OFFSHORE_INTERCEPTION_STATES.MAG_FAILED: {
      nextStatus = transition(nextStatus, OFFSHORE_INTERCEPTION_STATES.CLOSE_RANGE_RAM_PREP, snapshot.timeSec);
      command = createInterceptionCommand({
        maneuver: 'close-after-mag-fail',
        defenderSpeedKnots: config.warningFlarePhaseSpeedKnots,
        headingMode: 'target',
      });
      return finalize(nextStatus, command, events);
    }

    case OFFSHORE_INTERCEPTION_STATES.CLOSE_RANGE_RAM_PREP: {
      command = createInterceptionCommand({
        maneuver: 'close-after-mag-fail',
        defenderSpeedKnots: config.warningFlarePhaseSpeedKnots,
        headingMode: 'target',
      });

      if (snapshot.targetRangeToDefenderYards <= config.ramTriggerDistanceYards) {
        nextStatus = transition(nextStatus, OFFSHORE_INTERCEPTION_STATES.MAX_SPEED_PURSUIT, snapshot.timeSec);
        nextStatus.ramIntentActive = true;
        events.push(createEvent('ram_pursuit_started', {
          targetId: snapshot.targetId,
          defenderId: snapshot.defenderId,
        }));
        command = createInterceptionCommand({
          maneuver: 'ram',
          defenderSpeedKnots: config.maxSpeedKnots,
          headingMode: 'target',
          ramIntentActive: true,
        });
      }

      return finalize(nextStatus, command, events);
    }

    case OFFSHORE_INTERCEPTION_STATES.MAX_SPEED_PURSUIT: {
      nextStatus = transition(nextStatus, OFFSHORE_INTERCEPTION_STATES.RAM_ATTEMPT, snapshot.timeSec);
      nextStatus.ramIntentActive = true;
      command = createInterceptionCommand({
        maneuver: 'ram',
        defenderSpeedKnots: config.maxSpeedKnots,
        headingMode: 'target',
        ramIntentActive: true,
      });
      return finalize(nextStatus, command, events);
    }

    case OFFSHORE_INTERCEPTION_STATES.RAM_ATTEMPT: {
      command = createInterceptionCommand({
        maneuver: 'ram',
        defenderSpeedKnots: config.maxSpeedKnots,
        headingMode: 'target',
        ramIntentActive: true,
      });

      if (snapshot.collisionDetected) {
        nextStatus = transition(nextStatus, OFFSHORE_INTERCEPTION_STATES.COLLISION_RESOLUTION, snapshot.timeSec);
        events.push(createEvent('collision_occurred', {
          targetId: snapshot.targetId,
          defenderId: snapshot.defenderId,
        }));
      }

      return finalize(nextStatus, command, events);
    }

    case OFFSHORE_INTERCEPTION_STATES.COLLISION_RESOLUTION: {
      command = createInterceptionCommand({
        maneuver: 'collision',
        ramIntentActive: true,
      });
      return finalize(nextStatus, command, events);
    }

    case OFFSHORE_INTERCEPTION_STATES.MISSION_FAILED:
    default:
      command = createInterceptionCommand({
        maneuver: 'mission-failed',
        missionFailed: true,
      });
      return finalize(nextStatus, command, events);
  }
}
