import { headingToPoint } from '../utils/math.js';
import { createMotionProfile } from '../utils/kinematics.js';

export function createFishingBoat({
  id,
  position,
  homePoint,
  wanderWaypoint,
  attackTarget,
  speedKnots,
  hostileSpeedKnots,
}) {
  const initialWaypoint = wanderWaypoint ?? homePoint;
  const initialHeading = headingToPoint(position, initialWaypoint);

  return {
    id,
    type: 'fishing',
    label: id,
    x: position.x,
    y: position.y,
    headingDeg: initialHeading,
    speedKnots,
    ...createMotionProfile({
      speedKnots,
      headingDeg: initialHeading,
      maxSpeedKnots: Math.max(hostileSpeedKnots, speedKnots),
      accelerationNmPerSec2: 0.00034,
      decelerationNmPerSec2: 0.00048,
      turnRateDegPerSec: 10,
      forwardDragPerSec: 0.1,
      lateralDragPerSec: 0.88,
      turnDriftFactor: 1.08,
    }),
    classification: 'neutral',
    insideFishingZone: true,
    hostileTimerSec: 0,
    contacted: false,
    assignedInterceptorId: null,
    behaviorMode: 'wander',
    modeTimerSec: 0,
    retargetTimerSec: 0,
    suspiciousTransitionCount: 0,
    targetDueToRepeat: false,
    homePoint,
    wanderWaypoint: initialWaypoint,
    attackTarget,
    hostileSpeedKnots,
    alive: true,
    detected: true,
    borderIntent: 'west',
    maxHealth: 70,
    health: 70,
    smokeLevel: 0,
    isSinking: false,
    removalAtSec: null,
    pendingCombat: null,
  };
}
