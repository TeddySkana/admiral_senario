import { headingToPoint } from '../utils/math.js';
import { createMotionProfile } from '../utils/kinematics.js';
import { getEngagementRangeNm } from '../config/defaultScenario.js';

export function createFriendlyBoat({ id, patrolLineKey, line, config, startFraction = 0.5 }) {
  const start = {
    x: line.start.x + (line.end.x - line.start.x) * startFraction,
    y: line.start.y + (line.end.y - line.start.y) * startFraction,
  };

  return {
    id,
    type: 'friendly',
    label: id,
    platform: config.dvora.friendlyBoatType,
    patrolLineKey,
    x: start.x,
    y: start.y,
    headingDeg: headingToPoint(line.start, line.end),
    speedKnots: config.dvora.cruiseSpeedKnots,
    ...createMotionProfile({
      speedKnots: config.dvora.cruiseSpeedKnots,
      headingDeg: headingToPoint(line.start, line.end),
      maxSpeedKnots: config.dvora.maxSpeedKnots,
      accelerationNmPerSec2: 0.0007,
      decelerationNmPerSec2: 0.00115,
      turnRateDegPerSec: 22,
      forwardDragPerSec: 0.14,
      lateralDragPerSec: 1.25,
      turnDriftFactor: 1.3,
    }),
    cruiseSpeedKnots: config.dvora.cruiseSpeedKnots,
    maxSpeedKnots: config.dvora.maxSpeedKnots,
    engagementRangeNm: getEngagementRangeNm(config),
    operationalRangeNm: config.dvora.maxOperationalRangeNm,
    remainingOperationalRangeNm: config.dvora.maxOperationalRangeNm,
    state: 'patrol',
    patrolDirection: startFraction < 0.5 ? 1 : -1,
    targetId: null,
    assignedTargetId: null,
    distanceTraveledNm: 0,
    interceptCount: 0,
    maxHealth: 100,
    health: 100,
    smokeLevel: 0,
    isSinking: false,
    removalAtSec: null,
  };
}
