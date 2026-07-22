import type { AttendanceStatus } from '../types/database';

/**
 * Haversine distance between two lat/lng points, in meters.
 */
export function distanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000; // Earth radius, meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function isWithinGeofence(
  studentLat: number,
  studentLng: number,
  hospitalLat: number,
  hospitalLng: number,
  radiusMeters: number
): { inside: boolean; distance: number } {
  const distance = distanceMeters(studentLat, studentLng, hospitalLat, hospitalLng);
  return { inside: distance <= radiusMeters, distance };
}

/**
 * Determine attendance status from a check-in timestamp relative to the
 * hospital's configured check-in start time.
 *
 * Rules:
 *  - Before checkinStartTime         -> present
 *  - checkinStartTime – +1hr         -> late
 *  - +1hr – sessionExpiresAt         -> very_late
 *  - sessionExpiresAt onward         -> session expired (no check-in allowed)
 *
 * `sessionExpiresAt` is coordinator-configurable per hospital (defaults to
 * 15:00 / 3 PM) — see the "Session expiry time" field on the Hospitals page.
 */
export function resolveAttendanceStatus(
  checkInDate: Date,
  checkinStartTime: string, // "HH:MM:SS"
  sessionExpiresAt: string = '15:00:00' // "HH:MM:SS"
): { status: AttendanceStatus; canCheckIn: boolean; label: string } {
  const [startH, startM] = checkinStartTime.split(':').map(Number);
  const start = new Date(checkInDate);
  start.setHours(startH, startM, 0, 0);

  const lateThreshold = new Date(start);
  lateThreshold.setHours(startH + 1, startM, 0, 0);

  const [expireH, expireM] = sessionExpiresAt.split(':').map(Number);
  const veryLateThreshold = new Date(checkInDate);
  veryLateThreshold.setHours(expireH, expireM, 0, 0);

  if (checkInDate < start) {
    return { status: 'present', canCheckIn: true, label: 'Present' };
  }
  if (checkInDate < lateThreshold) {
    return { status: 'late', canCheckIn: true, label: 'Late' };
  }
  if (checkInDate < veryLateThreshold) {
    return { status: 'very_late', canCheckIn: true, label: 'Very Late' };
  }
  return { status: 'absent', canCheckIn: false, label: 'Session time expired' };
}

export function statusColors(status: AttendanceStatus | 'expired') {
  switch (status) {
    case 'present':
      return { bg: 'bg-status-present/10', text: 'text-status-present', dot: 'bg-status-present', border: 'border-status-present/30' };
    case 'late':
      return { bg: 'bg-status-late/10', text: 'text-status-late', dot: 'bg-status-late', border: 'border-status-late/30' };
    case 'very_late':
      return { bg: 'bg-status-verylate/10', text: 'text-status-verylate', dot: 'bg-status-verylate', border: 'border-status-verylate/30' };
    case 'absent':
    case 'expired':
      return { bg: 'bg-status-expired/10', text: 'text-status-expired', dot: 'bg-status-expired', border: 'border-status-expired/30' };
    case 'excused':
      return { bg: 'bg-ink-300/10', text: 'text-ink-500', dot: 'bg-ink-300', border: 'border-ink-300/30' };
    default:
      return { bg: 'bg-ink-300/10', text: 'text-ink-500', dot: 'bg-ink-300', border: 'border-ink-300/30' };
  }
}

/**
 * Wraps the browser geolocation API in a promise with sane error messages.
 */
export function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Geolocation is not supported on this device.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, (err) => {
      if (err.code === err.PERMISSION_DENIED) {
        reject(new Error('Location permission was denied. Enable it in your browser settings to check in.'));
      } else if (err.code === err.TIMEOUT) {
        reject(new Error('Location request timed out. Check your GPS signal and try again.'));
      } else {
        reject(new Error('Unable to determine your location.'));
      }
    }, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    });
  });
}
