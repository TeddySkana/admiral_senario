import { createMotionProfile } from '../utils/kinematics.js';

export function createCargoShip({ id, x, y, headingDeg, speedKnots }) {
  return {
    id,
    type: 'cargo',
    label: id,
    x,
    y,
    headingDeg,
    speedKnots,
    ...createMotionProfile({
      speedKnots,
      headingDeg,
      maxSpeedKnots: Math.max(speedKnots + 2, speedKnots),
      accelerationNmPerSec2: 0.00016,
      decelerationNmPerSec2: 0.00024,
      turnRateDegPerSec: 4,
      forwardDragPerSec: 0.08,
      lateralDragPerSec: 0.62,
      turnDriftFactor: 0.62,
    }),
    classification: 'neutral',
    insideFishingZone: false,
    hostileTimerSec: 0,
    assignedInterceptorId: null,
    alive: true,
    detected: true,
    maxHealth: 140,
    health: 140,
    smokeLevel: 0,
    isSinking: false,
    removalAtSec: null,
  };
}
