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

/**
 * Adds the real device model to a friendly label when the browser will
 * hand it over — e.g. "Chrome on Android (SM-M167F)" — using the
 * User-Agent Client Hints API (`navigator.userAgentData`), NOT a hardcoded
 * code→marketing-name table.
 *
 * That's a deliberate choice, not a shortcut: Samsung alone has hundreds of
 * model codes with regional/carrier suffixes (SM-S911B vs SM-S911U vs
 * SM-S911N are three different real variants of what's sold as "the same"
 * phone), the mapping changes with every new phone launch, and even public
 * reference sources disagree with each other on some codes. Shipping a
 * table risks confidently showing the WRONG phone name, which is worse
 * than showing the raw model code — the code is never wrong, because it
 * comes straight from the OS rather than a guess. A student can still
 * recognize "SM-M167F" as their own phone by checking Settings → About
 * phone, the same way the many "how do I identify my Samsung" guides out
 * there tell people to do it — this just isn't pretending to translate it
 * for them when that translation isn't reliable.
 *
 * Real limits, worth knowing:
 *   - Chromium-only (Chrome/Edge/Samsung Internet on Android). Safari,
 *     Firefox, and every iOS browser don't support this at all — iOS never
 *     exposed a real model to begin with, so those callers just keep
 *     getting the plain friendlyDeviceLabel() below with no model suffix.
 *   - Requires a secure context (https), which this app already is.
 *   - Some browsers require the page to explicitly request high-entropy
 *     values (can't just read `navigator.userAgentData.model` directly) —
 *     that's what `getHighEntropyValues` below is for.
 */
export async function friendlyDeviceLabelWithModel(): Promise<string> {
  const base = friendlyDeviceLabel(navigator.userAgent);

  const uaData = (navigator as any).userAgentData;
  if (!uaData?.getHighEntropyValues) return base;

  try {
    const { model } = await uaData.getHighEntropyValues(['model']);
    return model ? `${base} (${model})` : base;
  } catch {
    // Some browsers reject this outright depending on permissions policy —
    // fall back to the base label rather than let enrollment itself fail
    // over a label.
    return base;
  }
}
