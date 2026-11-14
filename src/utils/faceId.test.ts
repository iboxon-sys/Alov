import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeEyeAspectRatio,
  computeAverageEAR,
  createBlinkTrackerState,
  updateBlinkTracker,
  computeSmileMetrics,
  resolveDetectedGender,
  requiresFaceIdForUser,
  type FacePoint,
} from './faceId.ts';

function makeEye(verticalGap: number, width: number = 10): FacePoint[] {
  const halfH = verticalGap / 2;
  return [
    { x: 0, y: 0 },
    { x: width * 0.3, y: -halfH },
    { x: width * 0.7, y: -halfH },
    { x: width, y: 0 },
    { x: width * 0.7, y: halfH },
    { x: width * 0.3, y: halfH },
  ];
}

function makeLandmarksWithEyesAndMouth(eyeGap: number, mouthWidth: number): FacePoint[] {
  const pts: FacePoint[] = Array.from({ length: 68 }, () => ({ x: 50, y: 50 }));
  const leftEye = makeEye(eyeGap, 10);
  const rightEye = makeEye(eyeGap, 10);
  for (let i = 0; i < 6; i++) {
    pts[36 + i] = leftEye[i];
    pts[42 + i] = rightEye[i];
  }
  // Jaw width = 100 (x: 0..100)
  pts[3] = { x: 0, y: 80 };
  pts[13] = { x: 100, y: 80 };
  const halfM = mouthWidth / 2;
  pts[48] = { x: 50 - halfM, y: 78 };
  pts[54] = { x: 50 + halfM, y: 78 };
  pts[51] = { x: 50, y: 78 };
  pts[57] = { x: 50, y: 81 };
  return pts;
}

describe('faceId pure biometric helpers', () => {
  it('computes eye aspect ratio accurately for open vs closed eyes', () => {
    const openEAR = computeEyeAspectRatio(makeEye(3.2, 10));
    const closedEAR = computeEyeAspectRatio(makeEye(0.8, 10));
    assert.ok(openEAR > 0.28);
    assert.ok(closedEAR < 0.12);
  });

  it('detects blink naturally across open -> blink -> reopen sequence', () => {
    let state = createBlinkTrackerState();
    const openPts = makeLandmarksWithEyesAndMouth(3.2, 36);
    const closedPts = makeLandmarksWithEyesAndMouth(1.0, 36);

    const openEar = computeAverageEAR(openPts).avgEAR;
    const closedEar = computeAverageEAR(closedPts).avgEAR;

    state = updateBlinkTracker(state, openEar);
    state = updateBlinkTracker(state, openEar);
    assert.equal(state.blinkDetected, false);
    assert.equal(state.sawClosed, false);

    state = updateBlinkTracker(state, closedEar);
    assert.equal(state.sawClosed, true);
    assert.equal(state.blinkDetected, false);

    state = updateBlinkTracker(state, openEar);
    assert.equal(state.blinkDetected, true);
  });

  it('detects blink naturally even when open-eye EAR baseline is lower (~0.21)', () => {
    let state = createBlinkTrackerState();
    const lowOpenPts = makeLandmarksWithEyesAndMouth(2.1, 36);
    const naturalDipPts = makeLandmarksWithEyesAndMouth(1.65, 36);

    const openEar = computeAverageEAR(lowOpenPts).avgEAR; // ~0.21
    const dipEar = computeAverageEAR(naturalDipPts).avgEAR; // ~0.165

    state = updateBlinkTracker(state, openEar);
    state = updateBlinkTracker(state, openEar);
    assert.equal(state.sawClosed, false);

    state = updateBlinkTracker(state, dipEar);
    assert.equal(state.sawClosed, true);

    state = updateBlinkTracker(state, openEar);
    assert.equal(state.blinkDetected, true);
  });

  it('triggers smile check on gentle expression or mouth smile width', () => {
    const neutral = makeLandmarksWithEyesAndMouth(3.2, 36);
    assert.equal(computeSmileMetrics(neutral, 0.05).isSmiling, false);
    assert.equal(computeSmileMetrics(neutral, 0.18).isSmiling, true);

    const gentleGeometricSmile = makeLandmarksWithEyesAndMouth(3.2, 46);
    assert.equal(computeSmileMetrics(gentleGeometricSmile, 0.1).isSmiling, true);
  });

  it('resolves male vs female gender from weighted votes and optional server hint', () => {
    const resFemale = resolveDetectedGender([
      { gender: 'female', probability: 0.92 },
      { gender: 'female', probability: 0.88 },
      { gender: 'male', probability: 0.55 },
    ]);
    assert.equal(resFemale.gender, 'female');
    assert.equal(resFemale.labelUz, 'Qiz (Ayol)');
    assert.ok(resFemale.confidence >= 72);

    const resMaleBoosted = resolveDetectedGender(
      [{ gender: 'female', probability: 0.51 }],
      { gender: 'male', confidence: 95 }
    );
    assert.equal(resMaleBoosted.gender, 'male');
    assert.equal(resMaleBoosted.labelUz, 'Yigit (Erkak)');
  });

  it('bypasses Face ID for platform admin @Salikh_07 and requires it for unverified users', () => {
    assert.equal(requiresFaceIdForUser({ telegram: 'https://t.me/Salikh_07' }), false);
    assert.equal(requiresFaceIdForUser({ role: 'admin', isAdmin: true }), false);
    assert.equal(requiresFaceIdForUser({ uid: 'u1', role: 'user' }), true);
    assert.equal(requiresFaceIdForUser({ uid: 'u1', role: 'user', faceId: { verified: true } }), false);
  });
});
