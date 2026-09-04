import { useEffect, useRef, useState } from 'react';
import { MapPin, LogIn, LogOut, AlertCircle, Loader2, CheckCircle2, CalendarX2, Fingerprint, Camera, RefreshCw, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { supabase } from '../../lib/supabase';
import { getCurrentPosition, isWithinGeofence, resolveAttendanceStatus, statusColors } from '../../utils/geofence';
import { verifyDeviceBiometric } from '../../utils/webauthn';
import { extractFaceDescriptor, captureFrame } from '../../utils/faceRecognition';
import { invokeEdgeFunction } from '../../utils/invokeFunction';
import type { Rotation, Hospital, AttendanceRecord, AttendanceStatus } from '../../types/database';
import Badge from '../../components/ui/Badge';
import FullScreenLoader from '../../components/ui/FullScreenLoader';

type Phase =
  | 'idle' | 'locating' | 'error' | 'out-of-range' | 'expired' | 'ready-checkin' | 'ready-checkout' | 'done'
  // Added for migration 0014 (biometric check-in verification).
  | 'verifying-device' | 'selfie-checkin';

const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

/** A row (exception or special day) applies if every non-null scope field matches. */
function matchesScope(row: { hospital_id: string | null; batch: string | null; student_id: string | null }, hospitalId: string, batch: string, studentId: string) {
  if (row.hospital_id !== null && row.hospital_id !== hospitalId) return false;
  if (row.batch !== null && row.batch !== batch) return false;
  if (row.student_id !== null && row.student_id !== studentId) return false;
  return true;
}

export default function StudentAttendance() {
  const { student } = useAuth();
  const { showError } = useToast();
  const [loading, setLoading] = useState(true);
  const [rotation, setRotation] = useState<(Rotation & { hospital: Hospital }) | null>(null);
  const [today, setToday] = useState<AttendanceRecord | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState<string>('');
  const [distance, setDistance] = useState<number | null>(null);
  const [working, setWorking] = useState(false);
  const [noPracticeReason, setNoPracticeReason] = useState<string | null>(null);

  // Added for migration 0014. Stashes the GPS position + computed status
  // between the initial "Check in now" tap and the moment verification
  // (device biometric or selfie match) actually succeeds — the attendance
  // row isn't written until that succeeds, so this needs to survive across
  // however many renders the selfie flow takes.
  const pendingCheckIn = useRef<{ pos: GeolocationPosition; status: AttendanceStatus } | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [captured, setCaptured] = useState<string | null>(null);
  const [cameraOn, setCameraOn] = useState(false);

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
      const batch = student?.batch ?? '';

      // Practice exceptions (holiday / hospital closure / cancelled day),
      // scoped to hospital/batch/student — checked first since it can
      // override an otherwise-normal clinical day.
      const { data: exceptionRows } = await supabase
        .from('practice_exceptions')
        .select('type, reason, hospital_id, batch, student_id')
        .eq('date', dateStr);
      const applicableException = (exceptionRows ?? []).find((e) => matchesScope(e, rotationData.hospital_id, batch, student!.id));

      if (applicableException) {
        const typeLabel = applicableException.type === 'holiday' ? 'Holiday' : applicableException.type === 'closure' ? 'Hospital closure' : 'Cancelled clinical day';
        setNoPracticeReason(`No practice today — ${typeLabel}${applicableException.reason ? `: ${applicableException.reason}` : ''}.`);
      } else {
        // Respect an explicit per-rotation schedule if one exists; otherwise
        // check the coordinator's weekly schedule (clinical_days_config,
        // migration 0006 — defaults to Mon/Tue/Wed), with any
        // special_practice_days entry able to force an extra day on.
        const [{ data: scheduleRows }, { data: dayConfig }] = await Promise.all([
          supabase.from('schedules').select('date').eq('rotation_id', rotationData.id),
          supabase.from('clinical_days_config').select('*').eq('id', true).maybeSingle(),
        ]);

        const { data: specialDays } = await supabase
          .from('special_practice_days')
          .select('hospital_id, batch, student_id')
          .eq('date', dateStr);

        const hasExplicitSchedule = (scheduleRows ?? []).length > 0;
        const dayIndex = new Date().getDay();
        const defaultDayIsClinical = dayConfig ? !!(dayConfig as any)[DAY_KEYS[dayIndex]] : dayIndex === 1 || dayIndex === 2 || dayIndex === 3;
        const specialDayApplies = (specialDays ?? []).some((s) => matchesScope(s, rotationData.hospital_id, batch, student!.id));

        const todayIsScheduled = hasExplicitSchedule
          ? (scheduleRows ?? []).some((r) => r.date === dateStr)
          : specialDayApplies || defaultDayIsClinical;

        setNoPracticeReason(todayIsScheduled ? null : 'No clinical practice today — check with your coordinator for the current schedule.');
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

  // Added for migration 0014. This is the ONLY place that actually writes
  // the attendance row — both the device-biometric path and the selfie
  // path funnel into this once verification has succeeded. `verifiedMethod`
  // /`selfiePath`/`faceMatchDistance` are the audit-trail fields a
  // coordinator can later review (see migration 0014's comment on RLS: the
  // insert itself is refused by the database unless a fresh verification
  // pass exists, regardless of what this function sends).
  async function finalizeCheckIn(
    pos: GeolocationPosition,
    status: AttendanceStatus,
    verifiedMethod: 'webauthn' | 'selfie',
    extra?: { selfiePath?: string | null; faceMatchDistance?: number | null }
  ) {
    if (!rotation || !student) return;
    try {
      const { data, error } = await supabase
        .from('attendance')
        .insert({
          student_id: student.id,
          rotation_id: rotation.id,
          hospital_id: rotation.hospital.id,
          date: new Date().toISOString().slice(0, 10),
          check_in_time: new Date().toISOString(),
          check_in_lat: pos.coords.latitude,
          check_in_lng: pos.coords.longitude,
          status,
          verified_method: verifiedMethod,
          checkin_selfie_url: extra?.selfiePath ?? null,
          face_match_distance: extra?.faceMatchDistance ?? null,
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
      pendingCheckIn.current = null;
      stopCamera();
      setCaptured(null);
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

      // Added for migration 0014. Every check-in requires a second,
      // device-bound factor on top of geofencing — otherwise a friend
      // holding the right password (and standing in the right place)
      // could check in on someone else's behalf. Which path runs depends
      // on how this student enrolled (see BiometricEnrollment.tsx),
      // required before they could reach this page at all.
      if (student.verification_method === 'webauthn') {
        setPhase('verifying-device');
        setMessage('Confirm with your fingerprint or Face ID…');
        const { passToken, error: verifyError } = await verifyDeviceBiometric();
        if (!passToken) {
          setPhase('error');
          setMessage(verifyError ?? 'Verification failed. Please try again.');
          setWorking(false);
          return;
        }
        await finalizeCheckIn(pos, status, 'webauthn');
      } else {
        // Selfie path: defer the actual insert until after a successful
        // match — stash what we already have and show the camera.
        pendingCheckIn.current = { pos, status };
        setPhase('selfie-checkin');
        setWorking(false);
        await startCamera();
      }
    } catch (err: any) {
      setMessage(err.message ?? 'Check-in failed.');
      setPhase('error');
      setWorking(false);
    }
  }

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraOn(true);
    } catch {
      setPhase('error');
      setMessage('Could not access your camera. Please allow camera access and try again.');
    }
  }

  function stopCamera() {
    const stream = videoRef.current?.srcObject as MediaStream | undefined;
    stream?.getTracks().forEach((t) => t.stop());
    setCameraOn(false);
  }

  function handleSelfieCapture() {
    if (!videoRef.current) return;
    setCaptured(captureFrame(videoRef.current));
    stopCamera();
  }

  function retakeSelfie() {
    setCaptured(null);
    startCamera();
  }

  async function handleSelfieConfirm() {
    if (!captured || !pendingCheckIn.current) return;
    setWorking(true);

    const img = new Image();
    img.src = captured;
    await new Promise((resolve) => (img.onload = resolve));

    const descriptorResult = await extractFaceDescriptor(img);
    if (!descriptorResult.ok) {
      setWorking(false);
      showError(descriptorResult.error);
      return;
    }

    const { data, error } = await invokeEdgeFunction('selfie-verify', { descriptor: descriptorResult.descriptor, selfieDataUrl: captured });
    if (error || !(data as any)?.verified) {
      setWorking(false);
      showError((data as any)?.error ?? error ?? 'Verification failed.');
      return;
    }

    const { pos, status } = pendingCheckIn.current;
    await finalizeCheckIn(pos, status, 'selfie', { selfiePath: (data as any).selfiePath, faceMatchDistance: (data as any).distance });
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
        {phase === 'selfie-checkin' ? (
          <>
            <p className="mb-4 text-sm font-medium text-ink-900">Confirm it's you to finish checking in</p>
            <div className="overflow-hidden rounded-xl2 bg-ink-900">
              {captured ? (
                <img src={captured} alt="Captured selfie" className="w-full" />
              ) : (
                <video ref={videoRef} muted playsInline className="w-full -scale-x-100" />
              )}
            </div>
            <div className="mt-5 flex flex-col gap-2.5">
              {cameraOn && !captured && (
                <button onClick={handleSelfieCapture} className="btn-primary">
                  <Camera size={16} /> Capture selfie
                </button>
              )}
              {captured && (
                <div className="flex gap-2">
                  <button onClick={retakeSelfie} disabled={working} className="btn-secondary flex-1">
                    <RefreshCw size={14} /> Retake
                  </button>
                  <button onClick={handleSelfieConfirm} disabled={working} className="btn-primary flex-1">
                    {working ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />} Confirm
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="relative mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-clinical-50">
              <div className="absolute inset-0 rounded-full animate-pulseRing" />
              {phase === 'verifying-device' ? <Fingerprint size={30} className="text-clinical-600" /> : <MapPin size={30} className="text-clinical-600" />}
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

              {phase === 'verifying-device' && (
                <button disabled className="btn-primary">
                  <Loader2 size={16} className="animate-spin" /> Verifying…
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
          </>
        )}
      </div>

      <p className="text-center text-xs text-ink-300">
        Check-in windows — Present before {rotation.hospital.checkin_start_time.slice(0, 5)} · Late for the hour after · Very Late until {rotation.hospital.session_expires_at.slice(0, 5)} · Closed after {rotation.hospital.session_expires_at.slice(0, 5)}.
      </p>
    </div>
  );
}
