import { isAdminTelegramUser } from './tokenomics';

export interface FacePoint {
  x: number;
  y: number;
}

export interface FaceIdProfileData {
  verified: boolean;
  detectedGender: 'male' | 'female';
  genderLabelUz: string;
  confidence: number;
  liveness: {
    blinkVerified: boolean;
    smileVerified: boolean;
    faceDetected: boolean;
  };
  method: 'camera_biometric' | 'camera_biometric_ai';
  verifiedAt: string;
  capturedPhotoUrl?: string;
}

export interface BlinkTrackerState {
  openBaselineEAR: number | null;
  sawClosed: boolean;
  blinkDetected: boolean;
  openSampleCount: number;
}

export interface GenderVote {
  gender: 'male' | 'female';
  probability: number;
}

export function createBlinkTrackerState(): BlinkTrackerState {
  return {
    openBaselineEAR: null,
    sawClosed: false,
    blinkDetected: false,
    openSampleCount: 0,
  };
}

function dist(a: FacePoint, b: FacePoint): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

/**
 * Computes standard 6-point Eye Aspect Ratio (EAR).
 * Points order: [outerCorner, upper1, upper2, innerCorner, lower2, lower1]
 */
export function computeEyeAspectRatio(eyePoints: FacePoint[]): number {
  if (!Array.isArray(eyePoints) || eyePoints.length < 6) return 0;
  const horiz = dist(eyePoints[0], eyePoints[3]);
  if (horiz <= 0.0001) return 0;
  const v1 = dist(eyePoints[1], eyePoints[5]);
  const v2 = dist(eyePoints[2], eyePoints[4]);
  return (v1 + v2) / (2 * horiz);
}

export function computeAverageEAR(landmarks68: FacePoint[]): {
  leftEAR: number;
  rightEAR: number;
  avgEAR: number;
} {
  if (!Array.isArray(landmarks68) || landmarks68.length < 48) {
    return { leftEAR: 0, rightEAR: 0, avgEAR: 0 };
  }
  const leftEye = landmarks68.slice(36, 42);
  const rightEye = landmarks68.slice(42, 48);
  const leftEAR = computeEyeAspectRatio(leftEye);
  const rightEAR = computeEyeAspectRatio(rightEye);
  return {
    leftEAR,
    rightEAR,
    avgEAR: (leftEAR + rightEAR) / 2,
  };
}

/**
 * Easy, natural blink detector: adapts to the user's open-eye baseline and
 * completes as soon as the eyes dip slightly below baseline and reopen once.
 */
export function updateBlinkTracker(
  prev: BlinkTrackerState,
  avgEAR: number
): BlinkTrackerState {
  if (!Number.isFinite(avgEAR) || avgEAR <= 0) return prev;
  if (prev.blinkDetected) return prev;

  const next: BlinkTrackerState = { ...prev };

  // Seed & smoothly calibrate open-eye baseline during initial normal frames
  if (next.openBaselineEAR === null) {
    next.openBaselineEAR = avgEAR;
    next.openSampleCount = 1;
    return next;
  }

  const closeThreshold = Math.max(0.145, next.openBaselineEAR * 0.86);
  const reopenThreshold = Math.max(0.165, next.openBaselineEAR * 0.92);

  if (!next.sawClosed) {
    if (avgEAR <= closeThreshold) {
      next.sawClosed = true;
    } else {
      // Allow baseline to rise if first frame was slightly squinted, and smoothly calibrate early open frames
      if (avgEAR > next.openBaselineEAR) {
        next.openBaselineEAR = next.openBaselineEAR * 0.6 + avgEAR * 0.4;
      } else if (next.openSampleCount < 15) {
        next.openBaselineEAR = next.openBaselineEAR * 0.82 + avgEAR * 0.18;
      }
      next.openSampleCount += 1;
    }
  } else {
    if (avgEAR >= reopenThreshold) {
      next.blinkDetected = true;
    }
  }

  return next;
}

/**
 * Easy smile check: triggers on gentle happy expression OR slight mouth stretch / corner lift.
 */
export function computeSmileMetrics(
  landmarks68: FacePoint[],
  happyProb: number
): { isSmiling: boolean; smileScore: number } {
  const safeHappy = Number.isFinite(happyProb) ? Math.max(0, Math.min(1, happyProb)) : 0;
  let geometricRatio = 0;

  if (Array.isArray(landmarks68) && landmarks68.length >= 68) {
    const leftMouth = landmarks68[48];
    const rightMouth = landmarks68[54];
    const topLip = landmarks68[51];
    const bottomLip = landmarks68[57];
    const leftJaw = landmarks68[3];
    const rightJaw = landmarks68[13];

    const mouthWidth = dist(leftMouth, rightMouth);
    const jawWidth = dist(leftJaw, rightJaw);
    const mouthCenterY = (topLip.y + bottomLip.y) / 2;
    const avgCornerY = (leftMouth.y + rightMouth.y) / 2;
    const cornerLift = jawWidth > 0 ? Math.max(0, (mouthCenterY - avgCornerY) / jawWidth) : 0;
    const widthRatio = jawWidth > 0 ? mouthWidth / jawWidth : 0;

    // Neutral mouth/jaw width ratio is ~0.35–0.40; gentle smile >= 0.42 or slight upward corner curve
    geometricRatio = Math.max(0, Math.min(1, (widthRatio - 0.385) * 5.8 + cornerLift * 8.5));
  }

  const smileScore = Math.max(safeHappy, geometricRatio);
  return {
    isSmiling: safeHappy >= 0.16 || smileScore >= 0.24,
    smileScore,
  };
}

export function genderToUzLabel(gender: 'male' | 'female'): string {
  return gender === 'female' ? 'Qiz (Ayol)' : 'Yigit (Erkak)';
}

export function resolveDetectedGender(
  votes: GenderVote[],
  serverHint?: { gender?: 'male' | 'female' | null; confidence?: number } | null
): { gender: 'male' | 'female'; confidence: number; labelUz: string } {
  let maleScore = 0;
  let femaleScore = 0;

  if (Array.isArray(votes)) {
    for (const v of votes) {
      if (!v || (v.gender !== 'male' && v.gender !== 'female')) continue;
      const weight = Number.isFinite(v.probability) ? Math.max(0.1, Math.min(1, v.probability)) : 0.6;
      if (v.gender === 'male') maleScore += weight;
      else femaleScore += weight;
    }
  }

  if (serverHint && (serverHint.gender === 'male' || serverHint.gender === 'female')) {
    const hintWeight = serverHint.confidence && Number.isFinite(serverHint.confidence)
      ? Math.max(1.5, (serverHint.confidence / 100) * 4)
      : 3;
    if (serverHint.gender === 'male') maleScore += hintWeight;
    else femaleScore += hintWeight;
  }

  const total = maleScore + femaleScore;
  if (total <= 0) {
    return {
      gender: 'female',
      confidence: 85,
      labelUz: genderToUzLabel('female'),
    };
  }

  const gender: 'male' | 'female' = femaleScore >= maleScore ? 'female' : 'male';
  const rawPct = Math.round((Math.max(maleScore, femaleScore) / total) * 100);
  const confidence = Math.max(72, Math.min(99, rawPct));
  return {
    gender,
    confidence,
    labelUz: genderToUzLabel(gender),
  };
}

export function requiresFaceIdForUser(user: {
  uid?: string | null;
  id?: string | null;
  telegram?: string | null;
  username?: string | null;
  role?: string | null;
  isAdmin?: boolean | null;
  faceId?: { verified?: boolean } | null;
} | null | undefined): boolean {
  if (!user) return true;
  if (isAdminTelegramUser(user)) return false;
  return !user.faceId?.verified;
}

export function formatFaceIdDateUz(isoDate?: string | null): string {
  if (!isoDate) return 'Tasdiqlangan';
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return 'Tasdiqlangan';
  return d.toLocaleDateString('uz-UZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}
