/**
 * Check-in / check-out — the only two calls the app makes to record attendance.
 *
 * WHY THIS EXISTS
 *
 * The student check-in page used to INSERT straight into the `attendance`
 * table, with the browser supplying the date, the timestamp, the GPS
 * coordinates AND the resulting status ('present' / 'late' / 'very_late').
 * Every one of those is a value the person being graded controls, so anyone
 * able to open the browser console could post a 'present' row from home, at
 * any hour, for any date — no geofence, no clock, no schedule check. The
 * distance maths in `utils/geofence.ts` ran on the phone, which means it was
 * advisory only: skipping it was a matter of not calling it.
 *
 * Migration 0015 moves that decision into the database as two SECURITY
 * DEFINER functions, `check_in(p_lat, p_lng)` and `check_out(p_lat, p_lng)`.
 * They re-derive the date and time from the server clock (Africa/Addis_Ababa),
 * re-measure the distance to the hospital, re-check the rotation and the
 * clinical-day schedule, and decide the status themselves. The same migration
 * then revokes the client's INSERT privilege on `attendance` outright, so
 * these two functions are the only remaining way in.
 *
 * `utils/geofence.ts` is deliberately kept and still used on this page — for
 * the "you are 40m away" preview before the student taps the button. It is
 * now purely a courtesy readout; the database no longer trusts it.
 *
 * IMPORTANT: the error messages these functions raise are written for
 * students to read ("You are 812 metres from Black Lion Hospital…"), so
 * surface `err.message` in the UI as-is rather than replacing it with a
 * generic failure notice.
 */

import { supabase } from '../lib/supabase';
import type { AttendanceRecord } from '../types/database';

/**
 * Records today's check-in and returns the saved row.
 *
 * The coordinates are still sent — the server needs them to measure the
 * distance and to store where the student actually was — but they are now
 * *evidence* rather than *the decision*. Being outside the hospital's radius
 * raises an error instead of quietly saving.
 *
 * `verification` carries the biometric audit trail (migration 0014 —
 * fingerprint/Face ID via WebAuthn, or a selfie match). It is NOT what makes
 * check-in secure: `check_in()` (migration 0016) refuses the write on its
 * own unless a fresh, server-set verification pass exists on the caller's
 * row, regardless of what's passed here. These fields only label which
 * method produced that pass, for a coordinator reviewing the record later.
 */
export async function checkIn(
  latitude: number,
  longitude: number,
  verification?: { method: 'webauthn' | 'selfie'; selfiePath?: string | null; faceMatchDistance?: number | null }
): Promise<AttendanceRecord> {
  const { data, error } = await supabase.rpc('check_in', {
    p_lat: latitude,
    p_lng: longitude,
    p_verified_method: verification?.method ?? null,
    p_selfie_path: verification?.selfiePath ?? null,
    p_face_match_distance: verification?.faceMatchDistance ?? null,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Check-in did not return a record. Please try again.');
  return data as AttendanceRecord;
}

/** Records today's check-out and returns the updated row. */
export async function checkOut(latitude: number, longitude: number): Promise<AttendanceRecord> {
  const { data, error } = await supabase.rpc('check_out', {
    p_lat: latitude,
    p_lng: longitude,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Check-out did not return a record. Please try again.');
  return data as AttendanceRecord;
}
