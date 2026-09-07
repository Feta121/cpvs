import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Fingerprint, Camera, Loader2, ShieldCheck, RefreshCw, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { invokeEdgeFunction } from '../../utils/invokeFunction';
import { canUseDeviceBiometrics, enrollDeviceBiometric } from '../../utils/webauthn';
import { extractFaceDescriptor, captureFrame } from '../../utils/faceRecognition';
import { friendlyDeviceLabel } from '../../utils/deviceLabel';

/**
 * Forced landing page for any student who hasn't completed biometric
 * enrollment yet (see ProtectedRoute.tsx) — required before reaching
 * anything else, including the dashboard. Not wrapped in AppShell, same
 * reasoning as ChangePassword: this has to work correctly even before the
 * rest of the app's chrome/permissions are relevant.
 */
export default function BiometricEnrollment() {
  const { refreshProfile, signOut } = useAuth();
  const { showSuccess, showError } = useToast();
  const navigate = useNavigate();

  const [checking, setChecking] = useState(true);
  const [supportsDevice, setSupportsDevice] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  // Selfie fallback state
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [captured, setCaptured] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  useEffect(() => {
    canUseDeviceBiometrics()
      .then(setSupportsDevice)
      .finally(() => setChecking(false));
  }, []);

  useEffect(() => {
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleDeviceEnroll() {
    setSubmitting(true);
    const result = await enrollDeviceBiometric(friendlyDeviceLabel(navigator.userAgent));
    setSubmitting(false);
    if (!result.success) {
      showError(result.error ?? 'Enrollment failed.');
      return;
    }
    showSuccess('Device enrolled — fingerprint/Face ID will be requested at every check-in.');
    await refreshProfile();
    navigate('/student', { replace: true });
  }

  async function startCamera() {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraOn(true);
    } catch {
      setCameraError('Could not access your camera. Please allow camera access and try again.');
    }
  }

  function stopCamera() {
    const stream = videoRef.current?.srcObject as MediaStream | undefined;
    stream?.getTracks().forEach((t) => t.stop());
    setCameraOn(false);
  }

  function handleCapture() {
    if (!videoRef.current) return;
    setCaptured(captureFrame(videoRef.current));
    stopCamera();
  }

  function retake() {
    setCaptured(null);
    startCamera();
  }

  async function handleSelfieEnroll() {
    if (!captured) return;
    setSubmitting(true);

    const img = new Image();
    img.src = captured;
    await new Promise((resolve) => (img.onload = resolve));

    const result = await extractFaceDescriptor(img);
    if (!result.ok) {
      setSubmitting(false);
      showError(result.error);
      return;
    }

    const { error } = await invokeEdgeFunction('selfie-enroll', { descriptor: result.descriptor, selfieDataUrl: captured });
    setSubmitting(false);
    if (error) {
      showError(error);
      return;
    }
    showSuccess('Reference photo saved — you\u2019ll take a quick selfie to match at every check-in.');
    await refreshProfile();
    navigate('/student', { replace: true });
  }

  async function handleSignOut() {
    setSigningOut(true);
    await signOut();
    navigate('/login', { replace: true });
  }

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-muted">
        <Loader2 size={24} className="animate-spin text-clinical-600" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-muted px-4 py-10">
      <div className="w-full max-w-md">
        {/* This page is a required stop for an unenrolled student — there's
            no sidebar/logout here since it isn't wrapped in AppShell (see
            the file-level comment above) — but a student can still land
            here with an already-expired session (e.g. right after a Super
            Coordinator resets their enrollment while they were signed in
            elsewhere), where "Enroll this device" would just fail with the
            same session error with no way out. This is the way out. */}
        <button
          onClick={handleSignOut}
          disabled={signingOut}
          className="mb-4 flex items-center gap-1.5 text-xs font-medium text-ink-500 transition-colors hover:text-ink-700"
        >
          {signingOut ? <Loader2 size={13} className="animate-spin" /> : <LogOut size={13} />}
          Back to sign in
        </button>

        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-vital-600 text-onAccent shadow-glass">
            <ShieldCheck size={22} />
          </div>
          <h1 className="font-display text-xl font-semibold text-ink-900">One-time identity setup</h1>
          <p className="mt-1 text-sm text-ink-500">
            {supportsDevice
              ? 'This device supports fingerprint/Face ID — CPVS will ask for it at every check-in, so your account can\u2019t be used from someone else\u2019s hands.'
              : 'This device doesn\u2019t support fingerprint/Face ID, so CPVS will match a quick selfie against a reference photo at every check-in instead.'}
          </p>
        </div>

        <div className="glass-card space-y-4 p-7">
          {supportsDevice ? (
            <button onClick={handleDeviceEnroll} disabled={submitting} className="btn-primary w-full">
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <Fingerprint size={16} />}
              Enroll this device
            </button>
          ) : (
            <>
              {!cameraOn && !captured && (
                <button onClick={startCamera} className="btn-primary w-full">
                  <Camera size={16} /> Open camera
                </button>
              )}
              {cameraError && <p className="text-sm text-status-expired">{cameraError}</p>}

              <div className={`overflow-hidden rounded-xl2 bg-ink-900 ${cameraOn || captured ? 'block' : 'hidden'}`}>
                {captured ? (
                  <img src={captured} alt="Captured selfie" className="w-full" />
                ) : (
                  <video ref={videoRef} muted playsInline className="w-full -scale-x-100" />
                )}
              </div>

              {cameraOn && !captured && (
                <button onClick={handleCapture} className="btn-primary w-full">
                  <Camera size={16} /> Capture reference photo
                </button>
              )}

              {captured && (
                <div className="flex gap-2">
                  <button onClick={retake} disabled={submitting} className="btn-secondary flex-1">
                    <RefreshCw size={14} /> Retake
                  </button>
                  <button onClick={handleSelfieEnroll} disabled={submitting} className="btn-primary flex-1">
                    {submitting ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                    Save & continue
                  </button>
                </div>
              )}
            </>
          )}

          <p className="text-center text-xs text-ink-400">
            This is required before you can check in — it's what stops your account from being used by anyone but you.
          </p>
        </div>
      </div>
    </div>
  );
}
