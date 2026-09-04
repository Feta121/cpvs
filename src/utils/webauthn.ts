import { startRegistration, startAuthentication, browserSupportsWebAuthn, platformAuthenticatorIsAvailable } from '@simplewebauthn/browser';
import { invokeEdgeFunction } from './invokeFunction';

/** True only if this browser both understands WebAuthn at all AND this
 * specific device has a usable fingerprint/Face ID sensor. Both checks
 * matter — a device can support the WebAuthn API while still having no
 * platform authenticator (e.g. an older phone, or a desktop with no
 * biometric hardware), which is exactly the case that needs the selfie
 * fallback instead. */
export async function canUseDeviceBiometrics(): Promise<boolean> {
  if (!browserSupportsWebAuthn()) return false;
  return platformAuthenticatorIsAvailable();
}

export async function enrollDeviceBiometric(deviceLabel: string): Promise<{ success: boolean; error?: string }> {
  const { data: options, error: optionsError } = await invokeEdgeFunction('webauthn-register-options', {});
  if (optionsError) return { success: false, error: optionsError };

  let response;
  try {
    response = await startRegistration(options as any);
  } catch (err) {
    // The most common case here is the student cancelling the OS prompt —
    // not a real error, just let them try again without an alarming message.
    return { success: false, error: 'Enrollment was cancelled or the device declined. Please try again.' };
  }

  const { error: verifyError } = await invokeEdgeFunction('webauthn-register-verify', { response, deviceLabel });
  if (verifyError) return { success: false, error: verifyError };
  return { success: true };
}

/** Runs the full check-in biometric ceremony and returns the short-lived
 * pass token (see migration 0014) the caller must include immediately when
 * it writes the attendance row — expires in 60 seconds. */
export async function verifyDeviceBiometric(): Promise<{ passToken?: string; error?: string }> {
  const { data: options, error: optionsError } = await invokeEdgeFunction('webauthn-checkin-options', {});
  if (optionsError) return { error: optionsError };

  let response;
  try {
    response = await startAuthentication(options as any);
  } catch (err) {
    return { error: 'Verification was cancelled or the device declined. Please try again.' };
  }

  const { data, error: verifyError } = await invokeEdgeFunction('webauthn-checkin-verify', { response });
  if (verifyError) return { error: verifyError };
  return { passToken: (data as any).passToken };
}
