import { nearestPointOnSegment } from '../utils/geometry.js';
import { distanceBetween } from '../utils/math.js';
import { steerEntityTowardPoint } from '../utils/kinematics.js';
import { addTravelForFriendly } from './ContactBehaviorSystem.js';

const PATROL_ARRIVAL_EPSILON_NM = 0.12;
const RETURN_ARRIVAL_EPSILON_NM = 0.08;

export function updateFriendlyPatrolBoat(boat, dtSec, context) {
  const line = context.geometry.patrolLines[boat.patrolLineKey];

  if (boat.state === 'engage') {
    return;
  }

  if (boat.state === 'patrol') {
    const target = boat.patrolDirection >= 0 ? line.end : line.start;
    const traveled = steerEntityTowardPoint(boat, target, boat.cruiseSpeedKnots, dtSec, {
      arrivalDistanceNm: 0.9,
      minArrivalSpeedFactor: 0.42,
    });
    addTravelForFriendly(boat, traveled);

    if (distanceBetween(boat, target) <= PATROL_ARRIVAL_EPSILON_NM) {
      boat.patrolDirection *= -1;
    }
  }

  if (boat.state === 'return') {
    const rejoinPoint = nearestPointOnSegment(boat, line.start, line.end);
    const traveled = steerEntityTowardPoint(boat, rejoinPoint, boat.cruiseSpeedKnots, dtSec, {
      arrivalDistanceNm: 0.8,
      minArrivalSpeedFactor: 0.35,
    });
    addTravelForFriendly(boat, traveled);

    if (distanceBetween(boat, rejoinPoint) <= RETURN_ARRIVAL_EPSILON_NM) {
      const distanceToStart = distanceBetween(rejoinPoint, line.start);
      const distanceToEnd = distanceBetween(rejoinPoint, line.end);
      boat.patrolDirection = distanceToEnd >= distanceToStart ? 1 : -1;
      boat.state = 'patrol';
      boat.targetId = null;
      boat.assignedTargetId = null;
    }
  }
}
