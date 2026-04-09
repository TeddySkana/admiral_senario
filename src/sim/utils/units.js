export const YARDS_PER_NAUTICAL_MILE = 2025.371828521434;

export function yardsToNauticalMiles(yards) {
  return yards / YARDS_PER_NAUTICAL_MILE;
}

export function knotsToNmPerSecond(knots) {
  return knots / 3600;
}

export function minutesToSeconds(minutes) {
  return minutes * 60;
}

export function formatClock(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
  }

  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

export function formatFixed(value, digits = 1) {
  return Number.isFinite(value) ? value.toFixed(digits) : '-';
}
