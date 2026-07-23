import { useEffect, useState } from 'react';
import { MapPin, LogIn, LogOut, AlertCircle, Loader2, CheckCircle2, CalendarX2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { getCurrentPosition, isWithinGeofence, resolveAttendanceStatus, statusColors } from '../../utils/geofence';
import type { Rotation, Hospital, AttendanceRecord } from '../../types/database';
import Badge from '../../components/ui/Badge';
import FullScreenLoader from '../../components/ui/FullScreenLoader';

type Phase = 'idle' | 'locating' | 'error' | 'out-of-range' | 'expired' | 'ready-checkin' | 'ready-checkout' | 'done';

/** Clinical practice runs Monday/Tuesday/Wednesday only — mirrors the same
 * rule the mark-absences Edge Function uses when a rotation has no explicit
 * `schedules` rows of its own. */
function isClinicalDay(date: Date) {
  const day = date.getDay(); // 0=Sun ... 6=Sat
  return day === 1 || day === 2 || day === 3;
}

export default function StudentAttendance() {
  const { student } = useAuth();
  const [loading, setLoading] = useState(true);
  const [rotation, setRotation] = useState<(Rotation & { hospital: Hospital }) | null>(null);
  const [today, setToday] = useState<AttendanceRecord | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState<string>('');
  const [distance, setDistance] = useState<number | null>(null);
  const [working, setWorking] = useState(false);
  const [noPracticeReason, setNoPracticeReason] = useState<string | null>(null);

  useEffect(() => {
    if (!student) return;
    loadData();
  }, [student]);

  async function loadData() {
    setLoading(true);
    const dateStr = new Date().toISOString().slice(0, 10);

    const { data: rotationData } = await supabase
      .from('rotations')
      .select('*, hospital:hospitals(*)')
      .eq('student_id', student!.id)
      .eq('status', 'active')
      .maybeSingle();
    setRotation(rotationData as any);

    if (rotationData) {
      // Respect an explicit schedule for this rotation if one exists;
      // otherwise fall back to the standard Mon/Tue/Wed clinical days.
      const { data: scheduleRows } = await supabase
        .from('schedules')
        .select('date')
        .eq('rotation_id', rotationData.id);

      const hasExplicitSchedule = (scheduleRows ?? []).length > 0;
      const todayIsScheduled = hasExplicitSchedule
        ? (scheduleRows ?? []).some((r) => r.date === dateStr)
        : isClinicalDay(new Date());

      if (!todayIsScheduled) {
        setNoPracticeReason('No clinical practice today — practice runs Monday, Tuesday, and Wednesday.');
      } else {
        // Practice exceptions (holiday / hospital closure / cancelled day),
        // either global or specific to this rotation's hospital.
        const { data: exceptionRows } = await supabase
          .from('practice_exceptions')
          .select('type, reason, hospital_id')
          .eq('date', dateStr);
        const applicable = (exceptionRows ?? []).find((e) => e.hospital_id === null || e.hospital_id === rotationData.hospital_id);
        if (applicable) {
          const typeLabel = applicable.type === 'holiday' ? 'Holiday' : applicable.type === 'closure' ? 'Hospital closure' : 'Cancelled clinical day';
          setNoPracticeReason(`No practice today — ${typeLabel}${applicable.reason ? `: ${applicable.reason}` : ''}.`);
        } else {
          setNoPracticeReason(null);
        }
      }
    } else {
      setNoPracticeReason(null);
    }

    const { data: attendanceData } = await supabase
      .from('attendance')
      .select('*')
      .eq('student_id', student!.id)
      .eq('date', dateStr)
      .maybeSingle();
    setToday(attendanceData);
    setLoading(false);
  }

  async function handleLocate() {
    if (!rotation) return;
    setPhase('locating');
    setMessage('Requesting your location…');
    try {
      const pos = await getCurrentPosition();
      const { inside, distance } = isWithinGeofence(
        pos.coords.latitude,
        pos.coords.longitude,
        rotation.hospital.latitude,
        rotation.hospital.longitude,
        rotation.hospital.radius_meters
      );
      setDistance(Math.round(distance));

      if (!inside) {
        setPhase('out-of-range');
        setMessage(`You're ${Math.round(distance)}m from ${rotation.hospital.name}. Move within ${rotation.hospital.radius_meters}m to check in.`);
        return;
      }

      if (today?.check_in_time && !today.check_out_time) {
        setPhase('ready-checkout');
        setMessage('You are within range. You can check out now.');
        return;
      }
      if (today?.check_in_time && today?.check_out_time) {
        setPhase('done');
        return;
      }

      const now = new Date();
      const { canCheckIn } = resolveAttendanceStatus(now, rotation.hospital.checkin_start_time, rotation.hospital.session_expires_at);
      if (!canCheckIn) {
        setPhase('expired');
        setMessage(`Session time expired. Check-in is closed after ${rotation.hospital.session_expires_at.slice(0, 5)}.`);
        return;
      }

      setPhase('ready-checkin');
      setMessage('You are within range and ready to check in.');
    } catch (err: any) {
      setPhase('error');
      setMessage(err.message ?? 'Could not get your location.');
    }
  }

  async function handleCheckIn() {
    if (!rotation || !student) return;
    setWorking(true);
    try {
      const pos = await getCurrentPosition();
      const now = new Date();
      const { status, canCheckIn } = resolveAttendanceStatus(now, rotation.hospital.checkin_start_time, rotation.hospital.session_expires_at);

      if (!canCheckIn) {
        setPhase('expired');
        setMessage(`Session time expired. Check-in is closed after ${rotation.hospital.session_expires_at.slice(0, 5)}.`);
        setWorking(false);
        return;
      }

      const { data, error } = await supabase
        .from('attendance')
        .insert({
          student_id: student.id,
          rotation_id: rotation.id,
          hospital_id: rotation.hospital.id,
          date: now.toISOString().slice(0, 10),
          check_in_time: now.toISOString(),
          check_in_lat: pos.coords.latitude,
          check_in_lng: pos.coords.longitude,
          status,
        })
        .select()
        .single();

      if (error) throw error;
      setToday(data);
      setPhase('done');
      setMessage('Checked in successfully.');
    } catch (err: any) {
      setMessage(err.message ?? 'Check-in failed.');
      setPhase('error');
    } finally {
      setWorking(false);
    }
  }

  async function handleCheckOut() {
    if (!today) return;
    setWorking(true);
    try {
      const pos = await getCurrentPosition();
      const now = new Date();
      const { data, error } = await supabase
        .from('attendance')
        .update({
          check_out_time: now.toISOString(),
          check_out_lat: pos.coords.latitude,
          check_out_lng: pos.coords.longitude,
        })
        .eq('id', today.id)
        .select()
        .single();

      if (error) throw error;
      setToday(data);
      setPhase('done');
      setMessage('Checked out successfully. Have a good rest of your day.');
    } catch (err: any) {
      setMessage(err.message ?? 'Check-out failed.');
    } finally {
      setWorking(false);
    }
  }

  if (loading) return <FullScreenLoader label="Loading rotation…" />;

  if (!rotation) {
    return (
      <div className="surface-card p-8 text-center">
        <AlertCircle className="mx-auto mb-3 text-ink-300" size={28} />
        <p className="text-sm text-ink-500">You don't have an active rotation assigned yet. Contact your coordinator.</p>
      </div>
    );
  }

  if (noPracticeReason) {
    return (
      <div className="mx-auto max-w-lg space-y-6">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-900">Check in</h1>
          <p className="mt-1 text-sm text-ink-500">{rotation.hospital.name}</p>
        </div>
        <div className="surface-card flex flex-col items-center gap-3 p-10 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-clinical-50 text-clinical-600">
            <CalendarX2 size={22} />
          </div>
          <p className="text-sm font-medium text-ink-900">{noPracticeReason}</p>
          <p className="text-xs text-ink-500">This day won't count as an absence.</p>
        </div>
      </div>
    );
  }

  const colors = today ? statusColors(today.status) : statusColors('present');

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink-900">Check in</h1>
        <p className="mt-1 text-sm text-ink-500">{rotation.hospital.name}</p>
      </div>

      {today && (
        <div className={`rounded-xl2 border p-5 ${colors.border} ${colors.bg}`}>
          <div className="flex items-center gap-2">
            <span className={`status-dot ${colors.dot}`} />
            <span className={`text-sm font-semibold capitalize ${colors.text}`}>{today.status.replace('_', ' ')}</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-ink-500">
            <div>
              <p className="font-medium text-ink-700">Check-in</p>
              <p>{today.check_in_time ? new Date(today.check_in_time).toLocaleTimeString() : '—'}</p>
            </div>
            <div>
              <p className="font-medium text-ink-700">Check-out</p>
              <p>{today.check_out_time ? new Date(today.check_out_time).toLocaleTimeString() : 'Not yet'}</p>
            </div>
          </div>
        </div>
      )}

      <div className="glass-card p-8 text-center">
        <div className="relative mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-clinical-50">
          <div className="absolute inset-0 rounded-full animate-pulseRing" />
          <MapPin size={30} className="text-clinical-600" />
        </div>

        <p className="mb-1 text-sm font-medium text-ink-900">
          {phase === 'idle' && 'Tap below to verify your location'}
          {phase === 'locating' && 'Locating you…'}
          {phase !== 'idle' && phase !== 'locating' && message}
        </p>
        {distance !== null && phase === 'out-of-range' && (
          <p className="mb-4 text-xs text-ink-500">Distance to hospital: {distance}m (radius {rotation.hospital.radius_meters}m)</p>
        )}

        <div className="mt-6 flex flex-col gap-2.5">
          {(phase === 'idle' || phase === 'out-of-range' || phase === 'error') && (
            <button onClick={handleLocate} className="btn-primary">
              <MapPin size={16} /> Verify my location
            </button>
          )}

          {phase === 'locating' && (
            <button disabled className="btn-primary">
              <Loader2 size={16} className="animate-spin" /> Locating…
            </button>
          )}

          {phase === 'ready-checkin' && (
            <button onClick={handleCheckIn} disabled={working} className="btn-primary">
              {working ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />} Check in now
            </button>
          )}

          {phase === 'ready-checkout' && (
            <button onClick={handleCheckOut} disabled={working} className="btn-primary">
              {working ? <Loader2 size={16} className="animate-spin" /> : <LogOut size={16} />} Check out now
            </button>
          )}

          {phase === 'done' && (
            <div className="flex items-center justify-center gap-2 text-sm font-medium text-vital-700">
              <CheckCircle2 size={16} /> All set for today.
            </div>
          )}

          {phase === 'expired' && (
            <Badge tone="expired">Session time expired</Badge>
          )}
        </div>
      </div>

      <p className="text-center text-xs text-ink-300">
        Check-in windows — Present before {rotation.hospital.checkin_start_time.slice(0, 5)} · Late for the hour after · Very Late until {rotation.hospital.session_expires_at.slice(0, 5)} · Closed after {rotation.hospital.session_expires_at.slice(0, 5)}.
      </p>
    </div>
  );
}
