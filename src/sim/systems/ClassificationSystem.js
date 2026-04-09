import { getHeadingToBorderInfo, isHeadingBackToPolygon, pointInPolygon } from '../utils/geometry.js';
import { minutesToSeconds } from '../utils/units.js';

export function updateContactClassifications(contacts, dtSec, context) {
  const hostileDurationSec = minutesToSeconds(context.config.classification.hostileHeadingDurationMinutes);
  const speedThreshold = context.config.classification.suspiciousSpeedThresholdKnots;
  const homeTolerance = context.config.classification.homeHeadingToleranceDegrees;
  const suspiciousEscalationThreshold = Math.max(
    0,
    Math.round(context.config.classification.suspiciousEscalationThreshold ?? 10),
  );

  for (const contact of contacts) {
    if (contact.type !== 'fishing' || !contact.alive) {
      continue;
    }

    const insideFishingZone = pointInPolygon(contact, context.geometry.fishingPolygon);
    contact.insideFishingZone = insideFishingZone;

    if (insideFishingZone) {
      if (contact.classification !== 'neutral') {
        context.emit('vessel-neutral', {
          vesselId: contact.id,
          description: `${contact.id} returned to the allowed fishing zone.`,
        });
      }

      contact.classification = 'neutral';
      contact.targetDueToRepeat = false;
      contact.hostileTimerSec = 0;
      contact.assignedInterceptorId = null;
      continue;
    }

    if (contact.classification === 'neutral') {
      contact.suspiciousTransitionCount = (contact.suspiciousTransitionCount ?? 0) + 1;

      if (contact.suspiciousTransitionCount > suspiciousEscalationThreshold) {
        contact.classification = 'target';
        contact.targetDueToRepeat = true;
        context.emit('vessel-target', {
          vesselId: contact.id,
          count: contact.suspiciousTransitionCount,
          threshold: suspiciousEscalationThreshold,
          description: `${contact.id} exceeded the suspicious threshold and is now marked as an interception target.`,
        });
      } else {
        contact.classification = 'suspicious';
        context.emit('vessel-suspicious', {
          vesselId: contact.id,
          count: contact.suspiciousTransitionCount,
          threshold: suspiciousEscalationThreshold,
          description: `${contact.id} exited the fishing zone and is now suspicious.`,
        });
      }

      if (!contact.contacted) {
        contact.contacted = true;
        context.emit('radio-attempt', {
          vesselId: contact.id,
          description: `Attempted radio contact with ${contact.id}; no response received.`,
        });
      }
    }

    if (contact.classification === 'enemy') {
      continue;
    }

    const headingToBorder = getHeadingToBorderInfo(contact, contact.headingDeg, context.geometry);
    const returningHome = isHeadingBackToPolygon(
      contact,
      contact.headingDeg,
      context.geometry.fishingPolygon,
      homeTolerance,
    );

    const maintainsHostileProfile = headingToBorder.hit
      && !returningHome
      && contact.speedKnots > speedThreshold;

    if (maintainsHostileProfile) {
      contact.hostileTimerSec += dtSec;
    } else {
      contact.hostileTimerSec = 0;
    }

    if (contact.hostileTimerSec >= hostileDurationSec) {
      contact.classification = 'enemy';
      context.emit('vessel-enemy', {
        vesselId: contact.id,
        border: headingToBorder.border,
        description: `${contact.id} maintained a hostile heading toward the ${headingToBorder.border} border for five minutes and is now declared enemy.`,
      });
    }
  }
}
