import * as faceapi from 'face-api.js';

let modelsLoaded = false;

/** Loads the three models needed for the detect -> align -> describe
 * pipeline. Cheap to call repeatedly — no-ops after the first successful
 * load. Model files live in /public/models (see migration 0014's comment
 * for where they came from). */
export async function loadFaceModels() {
  if (modelsLoaded) return;
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
    faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
    faceapi.nets.faceRecognitionNet.loadFromUri('/models'),
  ]);
  modelsLoaded = true;
}

export type FaceDescriptorResult =
  | { ok: true; descriptor: number[] }
  | { ok: false; error: string };

/** Runs the full pipeline against a single video frame or image element and
 * returns a 128-number face descriptor — the actual thing compared at
 * verification time, never the raw image itself. Face landmarks are used
 * to align the face first, which meaningfully improves match accuracy over
 * comparing raw crops (different head tilt/angle between the two photos is
 * the single biggest source of false rejections otherwise). */
export async function extractFaceDescriptor(input: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement): Promise<FaceDescriptorResult> {
  await loadFaceModels();

  const detection = await faceapi
    .detectSingleFace(input, new faceapi.TinyFaceDetectorOptions())
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!detection) {
    return { ok: false, error: 'No face detected. Make sure your face is clearly visible and well-lit, then try again.' };
  }

  return { ok: true, descriptor: Array.from(detection.descriptor) };
}

/** Captures the current frame of a live <video> element as a JPEG data URL
 * — used both to show the student a preview and to upload as audit
 * evidence alongside a check-in. */
export function captureFrame(video: HTMLVideoElement): string {
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(video, 0, 0);
  return canvas.toDataURL('image/jpeg', 0.85);
}
