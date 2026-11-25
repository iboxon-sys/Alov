import { isAdminTelegramUser } from './tokenomics';

export interface FacePoint {
  x: number;
  y: number;
}

export interface FaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ObjectCoverProjection {
  scale: number;
  offsetX: number;
  offsetY: number;
  srcW: number;
  srcH: number;
  dstW: number;
  dstH: number;
}

export interface AdaptiveFaceFrame {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  angleRad: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function computeObjectCoverProjection(
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number
): ObjectCoverProjection {
  const safeSrcW = Number.isFinite(srcW) && srcW > 0 ? srcW : 1;
  const safeSrcH = Number.isFinite(srcH) && srcH > 0 ? srcH : 1;
  const safeDstW = Number.isFinite(dstW) && dstW > 0 ? dstW : 1;
  const safeDstH = Number.isFinite(dstH) && dstH > 0 ? dstH : 1;
  const scale = Math.max(safeDstW / safeSrcW, safeDstH / safeSrcH);
  const offsetX = (safeSrcW * scale - safeDstW) / 2;
  const offsetY = (safeSrcH * scale - safeDstH) / 2;
  return {
    scale,
    offsetX,
    offsetY,
    srcW: safeSrcW,
    srcH: safeSrcH,
    dstW: safeDstW,
    dstH: safeDstH,
  };
}

export function projectPointObjectCover(
  pt: FacePoint,
  proj: ObjectCoverProjection
): FacePoint {
  return {
    x: pt.x * proj.scale - proj.offsetX,
    y: pt.y * proj.scale - proj.offsetY,
  };
}

export function smoothLandmarksEMA(
  prev: FacePoint[] | null | undefined,
  next: FacePoint[],
  alpha = 0.55
): FacePoint[] {
  if (!Array.isArray(next) || next.length === 0) return [];
  const a = Number.isFinite(alpha) ? Math.max(0.05, Math.min(1, alpha)) : 0.55;
  if (!Array.isArray(prev) || prev.length !== next.length) {
    return next.map((p) => ({ x: p.x, y: p.y }));
  }
  return next.map((p, idx) => {
    const prevPt = prev[idx];
    if (!prevPt || !Number.isFinite(prevPt.x) || !Number.isFinite(prevPt.y)) {
      return { x: p.x, y: p.y };
    }
    return {
      x: prevPt.x + (p.x - prevPt.x) * a,
      y: prevPt.y + (p.y - prevPt.y) * a,
    };
  });
}

function averagePoints(points: FacePoint[]): FacePoint {
  if (points.length === 0) return { x: 0, y: 0 };
  let sx = 0;
  let sy = 0;
  for (const p of points) {
    sx += p.x;
    sy += p.y;
  }
  return { x: sx / points.length, y: sy / points.length };
}

export function computeAdaptiveFaceFrame(
  pts: FacePoint[],
  fallbackBox?: FaceBox | null
): AdaptiveFaceFrame | null {
  if (Array.isArray(pts) && pts.length >= 48) {
    const leftEyeCenter = averagePoints(pts.slice(36, 42));
    const rightEyeCenter = averagePoints(pts.slice(42, 48));
    const dx = rightEyeCenter.x - leftEyeCenter.x;
    const dy = rightEyeCenter.y - leftEyeCenter.y;
    const angleRad = Math.hypot(dx, dy) > 1 ? Math.atan2(dy, dx) : 0;

    const pivot = {
      x: (leftEyeCenter.x + rightEyeCenter.x) / 2,
      y: (leftEyeCenter.y + rightEyeCenter.y) / 2,
    };
    const cosA = Math.cos(-angleRad);
    const sinA = Math.sin(-angleRad);

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const p of pts) {
      const rx = p.x - pivot.x;
      const ry = p.y - pivot.y;
      const lx = rx * cosA - ry * sinA;
      const ly = rx * sinA + ry * cosA;
      if (lx < minX) minX = lx;
      if (lx > maxX) maxX = lx;
      if (ly < minY) minY = ly;
      if (ly > maxY) maxY = ly;
    }

    const faceW = Math.max(20, maxX - minX);
    const lowerH = Math.max(24, maxY - minY);
    const foreheadPad = lowerH * 0.42;
    const headTopLocal = minY - foreheadPad;
    const headH = maxY - headTopLocal;

    const localCx = (minX + maxX) / 2;
    const localCy = (headTopLocal + maxY) / 2;
    const cosB = Math.cos(angleRad);
    const sinB = Math.sin(angleRad);
    const cx = pivot.x + localCx * cosB - localCy * sinB;
    const cy = pivot.y + localCx * sinB + localCy * cosB;

    const rx = Math.max(24, faceW * 0.6);
    const ry = Math.max(30, headH * 0.55);

    return {
      cx,
      cy,
      rx,
      ry,
      angleRad,
      left: cx - rx,
      top: cy - ry,
      right: cx + rx,
      bottom: cy + ry,
    };
  }

  if (fallbackBox && fallbackBox.width > 0 && fallbackBox.height > 0) {
    const cx = fallbackBox.x + fallbackBox.width / 2;
    const cy = fallbackBox.y + fallbackBox.height * 0.48;
    const rx = Math.max(24, fallbackBox.width * 0.56);
    const ry = Math.max(30, fallbackBox.height * 0.68);
    return {
      cx,
      cy,
      rx,
      ry,
      angleRad: 0,
      left: cx - rx,
      top: cy - ry,
      right: cx + rx,
      bottom: cy + ry,
    };
  }

  return null;
}

export interface FaceIdProfileData {
  verified: boolean;
  detectedGender?: 'male' | 'female' | null;
  genderLabelUz?: string;
  confidence: number;
  liveness: {
    blinkVerified: boolean;
    smileVerified: boolean;
    faceDetected: boolean;
  };
  method: 'camera_biometric' | 'camera_biometric_ai' | 'demo_test';
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

export function genderToUzLabel(gender?: 'male' | 'female' | null | ''): string {
  if (gender === 'female') return 'Qiz (Ayol)';
  if (gender === 'male') return 'Yigit (Erkak)';
  return 'Tanlanmagan';
}

export function resolvePostFaceIdGender(params: {
  explicitSelection?: 'male' | 'female' | null | '';
  existingCompletedGender?: 'male' | 'female' | null | '';
}): 'male' | 'female' | '' {
  if (params.existingCompletedGender === 'male' || params.existingCompletedGender === 'female') {
    return params.existingCompletedGender;
  }
  if (params.explicitSelection === 'male' || params.explicitSelection === 'female') {
    return params.explicitSelection;
  }
  return '';
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
  if (!user) return false;
  if (isAdminTelegramUser(user)) return false;
  return !user.faceId?.verified;
}

export function resolveEffectiveProfileAvatar(user: {
  avatar?: string | null;
  hasCustomAvatar?: boolean | null;
  faceId?: { verified?: boolean; capturedPhotoUrl?: string | null } | null;
} | null | undefined): string {
  if (!user) return '';
  const rawAvatar = String(user.avatar || '').trim();
  if (user.hasCustomAvatar === true && rawAvatar) {
    return rawAvatar;
  }
  const facePhoto = String(user.faceId?.capturedPhotoUrl || '').trim();
  if (facePhoto) return facePhoto;
  return rawAvatar;
}

export function buildDemoFaceIdSvgDataUrl(gender: 'male' | 'female', name?: string | null): string {
  const isFemale = gender === 'female';
  const bg1 = isFemale ? '#4C1D2D' : '#172554';
  const bg2 = isFemale ? '#1E1019' : '#0F172A';
  const accent = isFemale ? '#F43F5E' : '#38BDF8';
  const initial = String(name || (isFemale ? 'A' : 'Y')).trim().charAt(0).toUpperCase() || (isFemale ? 'Q' : 'Y');
  const label = isFemale ? 'QIZ · DEMO FACE ID' : 'YIGIT · DEMO FACE ID';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="480" viewBox="0 0 360 480">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${bg1}"/>
      <stop offset="100%" stop-color="${bg2}"/>
    </linearGradient>
  </defs>
  <rect width="360" height="480" fill="url(#g)"/>
  <circle cx="180" cy="175" r="76" fill="${accent}" fill-opacity="0.2" stroke="${accent}" stroke-width="3"/>
  <circle cx="180" cy="158" r="36" fill="#E2E8F0" fill-opacity="0.92"/>
  <path d="M116 244c12-34 40-50 64-50s52 16 64 50" fill="#E2E8F0" fill-opacity="0.88"/>
  <text x="180" y="172" text-anchor="middle" font-family="sans-serif" font-size="34" font-weight="800" fill="${bg2}">${initial}</text>
  <rect x="64" y="346" width="232" height="44" rx="22" fill="#10B981" fill-opacity="0.2" stroke="#10B981" stroke-width="1.5"/>
  <text x="180" y="373" text-anchor="middle" font-family="sans-serif" font-size="13" font-weight="700" fill="#D1FAE5">${label}</text>
</svg>`;
  return `data:image/svg+xml;base64,${typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(svg))) : Buffer.from(svg, 'utf-8').toString('base64')}`;
}

export function buildDemoFaceIdProfile(params: {
  gender: 'male' | 'female';
  photoUrl: string;
  verifiedAt?: string;
}): FaceIdProfileData {
  return {
    verified: true,
    detectedGender: params.gender,
    genderLabelUz: genderToUzLabel(params.gender),
    confidence: 99,
    liveness: {
      blinkVerified: true,
      smileVerified: true,
      faceDetected: true,
    },
    method: 'demo_test',
    verifiedAt: params.verifiedAt || new Date().toISOString(),
    capturedPhotoUrl: params.photoUrl,
  };
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
