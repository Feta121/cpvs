/**
 * Turns a raw `navigator.userAgent` string into something a person would
 * actually recognize as "my phone" — e.g. "Safari on iPhone",
 * "Chrome on Android", "Edge on Windows" — the way Binance/most platforms
 * label a passkey/2FA device, instead of a wall of version numbers.
 *
 * Deliberately tolerant of already-friendly input: if `raw` doesn't look
 * like a user-agent string (no "Mozilla/", no "AppleWebKit", etc.) it's
 * returned as-is. That means this same function safely handles BOTH:
 *   - new enrollments, which now pass a pre-parsed friendly string in
 *     (see BiometricEnrollment.tsx)
 *   - old rows already in the database from before this fix, which stored
 *     the first 60 characters of the raw UA string directly — those get
 *     parsed for DISPLAY here rather than needing a data migration to fix.
 */
export function friendlyDeviceLabel(raw: string | null | undefined): string {
  if (!raw) return 'Unnamed device';
  if (!/mozilla\/|applewebkit|gecko\)/i.test(raw)) return raw;

  let os = 'Unknown device';
  if (/iphone/i.test(raw)) os = 'iPhone';
  else if (/ipad/i.test(raw)) os = 'iPad';
  else if (/android/i.test(raw)) os = 'Android';
  else if (/windows/i.test(raw)) os = 'Windows';
  else if (/mac os x|macintosh/i.test(raw)) os = 'Mac';
  else if (/linux/i.test(raw)) os = 'Linux';

  // Order matters: Edge and Samsung Internet both also match /chrome/, and
  // Chrome's UA also matches /safari/ (it includes "Safari/xxx" for
  // legacy-compatibility reasons) — most-specific check first.
  let browser = 'Browser';
  if (/edg\//i.test(raw)) browser = 'Edge';
  else if (/samsungbrowser/i.test(raw)) browser = 'Samsung Internet';
  else if (/opr\/|opera/i.test(raw)) browser = 'Opera';
  else if (/firefox/i.test(raw)) browser = 'Firefox';
  else if (/crios/i.test(raw)) browser = 'Chrome'; // Chrome on iOS
  else if (/fxios/i.test(raw)) browser = 'Firefox'; // Firefox on iOS
  else if (/chrome\//i.test(raw)) browser = 'Chrome';
  else if (/safari/i.test(raw)) browser = 'Safari';

  return `${browser} on ${os}`;
}
