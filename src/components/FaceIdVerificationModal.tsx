import React, { useEffect, useRef, useState } from 'react';
import * as faceapi from '@vladmandic/face-api';
import {
  Camera,
  CheckCircle2,
  Eye,
  RefreshCw,
  ShieldCheck,
  Smile,
  Sparkles,
  UserCheck,
  X,
} from 'lucide-react';
import {
  buildDemoFaceIdProfile,
  buildDemoFaceIdSvgDataUrl,
  computeAverageEAR,
  computeSmileMetrics,
  createBlinkTrackerState,
  genderToUzLabel,
  resolveDetectedGender,
  updateBlinkTracker,
  type BlinkTrackerState,
  type FaceIdProfileData,
  type GenderVote,
} from '../utils/faceId';

export interface FaceIdVerificationResult {
  photoUrl: string;
  photoDataUrl: string;
  detectedGender: 'male' | 'female' | null;
  userSelectedGender?: 'male' | 'female' | null;
  confidence: number;
  faceId: FaceIdProfileData;
}

interface FaceIdVerificationModalProps {
  apiBaseUrl: string;
  userUid?: string;
  userName?: string;
  onVerified: (result: FaceIdVerificationResult) => void;
  onCancel?: () => void;
}

let coreModelsPromise: Promise<void> | null = null;
let extraModelsPromise: Promise<void> | null = null;
let extraModelsLoaded = false;

async function ensureCoreFaceModelsLoaded(): Promise<void> {
  if (!coreModelsPromise) {
    coreModelsPromise = (async () => {
      try {
        await (faceapi.tf as any)?.ready?.();
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri('/face-models'),
          faceapi.nets.faceLandmark68TinyNet.loadFromUri('/face-models'),
        ]);
      } catch (err) {
        coreModelsPromise = null;
        throw err;
      }
    })();
  }
  return coreModelsPromise;
}

function ensureExtraFaceModelsLoaded(): Promise<void> {
  if (extraModelsLoaded) return Promise.resolve();
  if (!extraModelsPromise) {
    extraModelsPromise = (async () => {
      try {
        await Promise.all([
          faceapi.nets.faceExpressionNet.loadFromUri('/face-models'),
          faceapi.nets.ageGenderNet.loadFromUri('/face-models'),
        ]);
        extraModelsLoaded = true;
      } catch {
        extraModelsPromise = null;
      }
    })();
  }
  return extraModelsPromise;
}

function waitForVideoDimensions(video: HTMLVideoElement, timeoutMs = 3500): Promise<boolean> {
  if (video.videoWidth > 0 && video.videoHeight > 0 && video.readyState >= 2) {
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      video.removeEventListener('loadedmetadata', onMeta);
      video.removeEventListener('playing', onMeta);
      window.clearInterval(pollId);
      window.clearTimeout(timerId);
      resolve(ok);
    };
    const onMeta = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) finish(true);
    };
    video.addEventListener('loadedmetadata', onMeta);
    video.addEventListener('playing', onMeta);
    const pollId = window.setInterval(onMeta, 80);
    const timerId = window.setTimeout(() => finish(video.videoWidth > 0), timeoutMs);
  });
}

export const FaceIdVerificationModal: React.FC<FaceIdVerificationModalProps> = ({
  apiBaseUrl,
  userUid,
  userName,
  onVerified,
  onCancel,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const meshCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const loopTimerRef = useRef<number | null>(null);
  const blinkStateRef = useRef<BlinkTrackerState>(createBlinkTrackerState());
  const genderVotesRef = useRef<GenderVote[]>([]);
  const mountedRef = useRef<boolean>(true);

  const [modelsReady, setModelsReady] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState('');

  const [faceDetected, setFaceDetected] = useState(false);
  const [blinkVerified, setBlinkVerified] = useState(false);
  const [smileVerified, setSmileVerified] = useState(false);

  const [phase, setPhase] = useState<'scanning' | 'verified_ready' | 'captured_preview'>('scanning');
  const [capturedPhotoDataUrl, setCapturedPhotoDataUrl] = useState<string>('');
  const [detectedGender, setDetectedGender] = useState<'male' | 'female' | null>(null);
  const [userSelectedGender, setUserSelectedGender] = useState<'male' | 'female' | null>(null);
  const [genderConfidence, setGenderConfidence] = useState<number>(88);
  const [isSaving, setIsSaving] = useState(false);
  const [isAnalyzingServer, setIsAnalyzingServer] = useState(false);
  const [retrySeed, setRetrySeed] = useState(0);
  const [verificationMode, setVerificationMode] = useState<'demo' | 'camera'>('demo');
  const [demoGender, setDemoGender] = useState<'female' | 'male'>('female');

  // Refs synced cleanly so detection loop never tears down & restarts mid-blink
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const faceDetectedRef = useRef(faceDetected);
  faceDetectedRef.current = faceDetected;
  const blinkVerifiedRef = useRef(blinkVerified);
  blinkVerifiedRef.current = blinkVerified;
  const smileVerifiedRef = useRef(smileVerified);
  smileVerifiedRef.current = smileVerified;
  const latestHappyRef = useRef(0);

  // Stop camera helper
  const stopCamera = () => {
    if (loopTimerRef.current !== null) {
      window.clearTimeout(loopTimerRef.current);
      loopTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopCamera();
    };
  }, []);

  useEffect(() => {
    if (verificationMode !== 'camera') {
      stopCamera();
      setCameraReady(false);
      setCameraError('');
      return;
    }
    mountedRef.current = true;
    let active = true;

    const init = async () => {
      setCameraError('');
      setCameraReady(false);
      setModelsReady(false);
      blinkStateRef.current = createBlinkTrackerState();
      genderVotesRef.current = [];
      latestHappyRef.current = 0;

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError("Qurilmangiz kamerani qo'llab-quvvatlamaydi yoki xavfsiz ulanish (HTTPS) talab etiladi.");
        return;
      }

      // Load fast core face + tiny landmark models first (~200ms), then extra models in background
      const modelPromise = ensureCoreFaceModelsLoaded()
        .then(() => {
          if (active) setModelsReady(true);
          void ensureExtraFaceModelsLoaded();
        })
        .catch(() => {
          if (active) {
            setCameraError("Biometrik modelni yuklashda muammo yuz berdi. Internetni tekshirib qayta urining.");
          }
        });

      const cameraPromise = (async () => {
        try {
          let stream: MediaStream;
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: {
                facingMode: { ideal: 'user' },
                width: { ideal: 640 },
                height: { ideal: 800 },
              },
              audio: false,
            });
          } catch (constraintErr: any) {
            if (constraintErr?.name === 'NotAllowedError' || constraintErr?.name === 'PermissionDeniedError') {
              throw constraintErr;
            }
            stream = await navigator.mediaDevices.getUserMedia({
              video: true,
              audio: false,
            });
          }

          if (!active) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }

          streamRef.current = stream;
          const videoEl = videoRef.current;
          if (videoEl) {
            videoEl.setAttribute('playsinline', 'true');
            videoEl.setAttribute('webkit-playsinline', 'true');
            videoEl.srcObject = stream;
            await videoEl.play().catch(() => {});
            const ready = await waitForVideoDimensions(videoEl);
            if (active && ready) {
              setCameraReady(true);
            } else if (active && !ready) {
              setCameraError("Kamera tasviri kelmadi. Boshqa ilova kamerani band qilmaganligini tekshiring.");
            }
          }
        } catch (err: any) {
          if (!active) return;
          const msg =
            err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError'
              ? "Kameraga ruxsat berilmadi. Face ID dan o'tish uchun brauzerda kamera ruxsatini yoqing."
              : err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError'
              ? "Old kamera topilmadi. Iltimos, kamera ulanganligini tekshiring."
              : "Kamerani ishga tushirishda xatolik yuz berdi. Qayta urinib ko'ring.";
          setCameraError(msg);
        }
      })();

      await Promise.allSettled([modelPromise, cameraPromise]);
    };

    init();

    return () => {
      active = false;
      stopCamera();
    };
  }, [retrySeed, verificationMode]);

  // Continuous low-latency biometric landmark + throttled gender/expression loop
  useEffect(() => {
    if (verificationMode !== 'camera' || !modelsReady || !cameraReady) return;

    let cancelled = false;
    let frameCounter = 0;
    let consecutiveMisses = 0;

    if (!frameCanvasRef.current) {
      frameCanvasRef.current = document.createElement('canvas');
    }

    const tick = async () => {
      if (cancelled || !mountedRef.current) return;

      const currentPhase = phaseRef.current;
      if (currentPhase === 'captured_preview') {
        loopTimerRef.current = window.setTimeout(tick, 220);
        return;
      }

      const video = videoRef.current;
      const offscreen = frameCanvasRef.current;

      if (video && offscreen && video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
        try {
          const targetW = 320;
          const targetH = Math.max(180, Math.round((targetW * video.videoHeight) / video.videoWidth));
          if (offscreen.width !== targetW || offscreen.height !== targetH) {
            offscreen.width = targetW;
            offscreen.height = targetH;
          }
          const ctx = offscreen.getContext('2d', { willReadFrequently: true });
          if (ctx) {
            ctx.drawImage(video, 0, 0, targetW, targetH);

            // 1. Fast face + 68 tiny landmarks every tick (~40–80ms) so blinks are never missed
            const baseDet = await faceapi
              .detectSingleFace(
                offscreen,
                new faceapi.TinyFaceDetectorOptions({
                  inputSize: 192,
                  scoreThreshold: 0.22,
                })
              )
              .withFaceLandmarks(true);

            if (!cancelled && mountedRef.current) {
              const overlay = meshCanvasRef.current;
              if (overlay) {
                const oW = overlay.clientWidth || targetW;
                const oH = overlay.clientHeight || targetH;
                if (overlay.width !== oW || overlay.height !== oH) {
                  overlay.width = oW;
                  overlay.height = oH;
                }
                const oCtx = overlay.getContext('2d');
                if (oCtx) {
                  oCtx.clearRect(0, 0, oW, oH);
                  if (baseDet) {
                    const scaleX = oW / targetW;
                    const scaleY = oH / targetH;
                    const isGreen = phaseRef.current === 'verified_ready';
                    oCtx.strokeStyle = isGreen ? 'rgba(52, 211, 153, 0.72)' : 'rgba(251, 113, 133, 0.72)';
                    oCtx.fillStyle = isGreen ? 'rgba(167, 243, 208, 0.92)' : 'rgba(254, 205, 211, 0.92)';
                    oCtx.lineWidth = 1.25;

                    const pts = baseDet.landmarks.positions;
                    const connectChain = (indices: number[], close = false) => {
                      if (indices.length < 2) return;
                      oCtx.beginPath();
                      indices.forEach((idx, posIdx) => {
                        const pt = pts[idx];
                        if (!pt) return;
                        const x = pt.x * scaleX;
                        const y = pt.y * scaleY;
                        if (posIdx === 0) oCtx.moveTo(x, y);
                        else oCtx.lineTo(x, y);
                      });
                      if (close) oCtx.closePath();
                      oCtx.stroke();
                    };

                    // Jawline (0-16), eyebrows (17-21, 22-26), nose (27-35), eyes (36-41, 42-47), lips (48-59)
                    connectChain(Array.from({ length: 17 }, (_, i) => i));
                    connectChain([17, 18, 19, 20, 21]);
                    connectChain([22, 23, 24, 25, 26]);
                    connectChain([27, 28, 29, 30, 33]);
                    connectChain([36, 37, 38, 39, 40, 41], true);
                    connectChain([42, 43, 44, 45, 46, 47], true);
                    connectChain([48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59], true);

                    for (let i = 0; i < pts.length; i += 2) {
                      oCtx.beginPath();
                      oCtx.arc(pts[i].x * scaleX, pts[i].y * scaleY, 1.6, 0, Math.PI * 2);
                      oCtx.fill();
                    }
                  }
                }
              }

              if (baseDet) {
                consecutiveMisses = 0;
                frameCounter += 1;

                if (!faceDetectedRef.current) {
                  faceDetectedRef.current = true;
                  setFaceDetected(true);
                }

                // 2. Run heavier expression + age/gender on first detected frame and every 3rd frame once loaded
                if (extraModelsLoaded && (frameCounter === 1 || frameCounter % 3 === 0 || genderVotesRef.current.length === 0)) {
                  try {
                    const fullDet = await faceapi
                      .detectSingleFace(
                        offscreen,
                        new faceapi.TinyFaceDetectorOptions({
                          inputSize: 192,
                          scoreThreshold: 0.22,
                        })
                      )
                      .withFaceLandmarks(true)
                      .withFaceExpressions()
                      .withAgeAndGender();

                    if (fullDet && !cancelled && mountedRef.current) {
                      if (fullDet.gender === 'male' || fullDet.gender === 'female') {
                        genderVotesRef.current.push({
                          gender: fullDet.gender,
                          probability: Number(fullDet.genderProbability) || 0.72,
                        });
                        if (genderVotesRef.current.length > 30) {
                          genderVotesRef.current.shift();
                        }
                        const resolved = resolveDetectedGender(genderVotesRef.current);
                        setDetectedGender(resolved.gender);
                        setGenderConfidence(resolved.confidence);
                      }
                      const happyVal = Number((fullDet.expressions as any)?.happy || 0);
                      if (Number.isFinite(happyVal)) {
                        latestHappyRef.current = happyVal;
                      }
                    }
                  } catch {
                    // Continue smoothly using fast landmarks even if secondary classifier skips a frame
                  }
                }

                // 3. Landmark blink & smile liveness checks during scanning
                if (phaseRef.current === 'scanning') {
                  const pts = baseDet.landmarks.positions.map((p) => ({ x: p.x, y: p.y }));

                  if (!blinkVerifiedRef.current) {
                    const { avgEAR } = computeAverageEAR(pts);
                    blinkStateRef.current = updateBlinkTracker(blinkStateRef.current, avgEAR);
                    if (blinkStateRef.current.blinkDetected) {
                      blinkVerifiedRef.current = true;
                      setBlinkVerified(true);
                    }
                  }

                  if (!smileVerifiedRef.current) {
                    const smileRes = computeSmileMetrics(pts, latestHappyRef.current);
                    if (smileRes.isSmiling) {
                      smileVerifiedRef.current = true;
                      setSmileVerified(true);
                    }
                  }

                  if (faceDetectedRef.current && blinkVerifiedRef.current && smileVerifiedRef.current) {
                    // Turn ring emerald green and let user manually choose pose & take photo
                    phaseRef.current = 'verified_ready';
                    setPhase('verified_ready');
                  }
                }
              } else {
                consecutiveMisses += 1;
                if (consecutiveMisses >= 8 && phaseRef.current === 'scanning' && faceDetectedRef.current) {
                  faceDetectedRef.current = false;
                  setFaceDetected(false);
                }
              }
            }
          }
        } catch {
          // Skip transient frame hiccups without killing loop
        }
      }

      if (!cancelled && mountedRef.current) {
        const nextDelay = phaseRef.current === 'verified_ready' ? 220 : 65;
        loopTimerRef.current = window.setTimeout(tick, nextDelay);
      }
    };

    loopTimerRef.current = window.setTimeout(tick, 60);

    return () => {
      cancelled = true;
      if (loopTimerRef.current !== null) {
        window.clearTimeout(loopTimerRef.current);
        loopTimerRef.current = null;
      }
    };
  }, [modelsReady, cameraReady]);

  const handleManualCapture = async () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;

    const targetW = 640;
    const targetH = 800;
    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const targetAspect = targetW / targetH;
    const videoAspect = vw / vh;

    let sx = 0;
    let sy = 0;
    let sw = vw;
    let sh = vh;
    if (videoAspect > targetAspect) {
      sw = vh * targetAspect;
      sx = (vw - sw) / 2;
    } else {
      sh = vw / targetAspect;
      sy = (vh - sh) / 2;
    }

    // Mirror horizontally to match natural front-camera preview
    ctx.save();
    ctx.translate(targetW, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, targetW, targetH);
    ctx.restore();

    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    setCapturedPhotoDataUrl(dataUrl);
    phaseRef.current = 'captured_preview';
    setPhase('captured_preview');

    // Optional server Gemini vision confirmation
    setIsAnalyzingServer(true);
    try {
      const hasLocalVotes = genderVotesRef.current.length > 0;
      const localResolved = hasLocalVotes ? resolveDetectedGender(genderVotesRef.current) : null;
      const res = await fetch(`${apiBaseUrl}/api/face-id/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: dataUrl,
          localGender: localResolved?.gender || null,
          localConfidence: localResolved?.confidence || 88,
        }),
      });
      const data = await res.json();
      if (data && data.success && (data.gender === 'male' || data.gender === 'female')) {
        const merged = resolveDetectedGender(genderVotesRef.current, {
          gender: data.gender,
          confidence: data.confidence,
        });
        setDetectedGender(merged.gender);
        setGenderConfidence(merged.confidence);
      }
    } catch {
      // Do not force any fallback gender if detection is unavailable
    } finally {
      if (mountedRef.current) setIsAnalyzingServer(false);
    }
  };

  const handleRetakePhoto = () => {
    setCapturedPhotoDataUrl('');
    // Stay in verified_ready green mode so the user can smoothly take another pose photo
    phaseRef.current = 'verified_ready';
    setPhase('verified_ready');
    if (videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  };

  const handleConfirmAndSave = async () => {
    if (!capturedPhotoDataUrl) return;
    const confirmedOrSelected = userSelectedGender;
    setIsSaving(true);
    try {
      const res = await fetch(`${apiBaseUrl}/api/face-id/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: userUid,
          photoDataUrl: capturedPhotoDataUrl,
          detectedGender: confirmedOrSelected,
          confidence: genderConfidence,
          blinkVerified: true,
          smileVerified: true,
          method: 'camera_biometric_ai',
        }),
      });
      const data = await res.json();
      const photoUrl = data?.photoUrl || capturedPhotoDataUrl;
      const faceId: FaceIdProfileData = data?.faceId || {
        verified: true,
        detectedGender: confirmedOrSelected,
        genderLabelUz: confirmedOrSelected ? genderToUzLabel(confirmedOrSelected) : '',
        confidence: genderConfidence,
        liveness: {
          blinkVerified: true,
          smileVerified: true,
          faceDetected: true,
        },
        method: 'camera_biometric',
        verifiedAt: new Date().toISOString(),
        capturedPhotoUrl: photoUrl,
      };
      stopCamera();
      onVerified({
        photoUrl,
        photoDataUrl: capturedPhotoDataUrl,
        detectedGender: confirmedOrSelected,
        userSelectedGender: confirmedOrSelected,
        confidence: genderConfidence,
        faceId,
      });
    } catch {
      const fallbackFaceId: FaceIdProfileData = {
        verified: true,
        detectedGender: confirmedOrSelected,
        genderLabelUz: confirmedOrSelected ? genderToUzLabel(confirmedOrSelected) : '',
        confidence: genderConfidence,
        liveness: {
          blinkVerified: true,
          smileVerified: true,
          faceDetected: true,
        },
        method: 'camera_biometric',
        verifiedAt: new Date().toISOString(),
        capturedPhotoUrl: capturedPhotoDataUrl,
      };
      stopCamera();
      onVerified({
        photoUrl: capturedPhotoDataUrl,
        photoDataUrl: capturedPhotoDataUrl,
        detectedGender: confirmedOrSelected,
        userSelectedGender: confirmedOrSelected,
        confidence: genderConfidence,
        faceId: fallbackFaceId,
      });
    } finally {
      if (mountedRef.current) setIsSaving(false);
    }
  };

  const handleDemoVerify = async () => {
    setIsSaving(true);
    const svgDataUrl = buildDemoFaceIdSvgDataUrl(demoGender, userName);
    let photoDataUrl = svgDataUrl;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 360;
      canvas.height = 480;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const grad = ctx.createLinearGradient(0, 0, 360, 480);
        grad.addColorStop(0, demoGender === 'female' ? '#4C1D2D' : '#172554');
        grad.addColorStop(1, demoGender === 'female' ? '#1E1019' : '#0F172A');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 360, 480);

        const accent = demoGender === 'female' ? '#F43F5E' : '#38BDF8';
        ctx.beginPath();
        ctx.arc(180, 175, 76, 0, Math.PI * 2);
        ctx.fillStyle = demoGender === 'female' ? 'rgba(244,63,94,0.22)' : 'rgba(56,189,248,0.22)';
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = accent;
        ctx.stroke();

        ctx.fillStyle = 'rgba(226,232,240,0.92)';
        ctx.beginPath();
        ctx.arc(180, 158, 36, 0, Math.PI * 2);
        ctx.fill();

        const initial = String(userName || (demoGender === 'female' ? 'Q' : 'Y')).trim().charAt(0).toUpperCase() || 'A';
        ctx.fillStyle = '#0F172A';
        ctx.font = '800 32px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(initial, 180, 160);

        ctx.fillStyle = 'rgba(16,185,129,0.22)';
        ctx.strokeStyle = '#10B981';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(68, 346, 224, 42, 21);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#D1FAE5';
        ctx.font = '700 13px sans-serif';
        ctx.fillText(demoGender === 'female' ? 'QIZ · DEMO FACE ID' : 'YIGIT · DEMO FACE ID', 180, 368);

        photoDataUrl = canvas.toDataURL('image/png');
      }
    } catch {
      photoDataUrl = svgDataUrl;
    }

    try {
      const res = await fetch(`${apiBaseUrl}/api/face-id/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: userUid,
          photoDataUrl,
          detectedGender: demoGender,
          confidence: 99,
          blinkVerified: true,
          smileVerified: true,
          method: 'demo_test',
        }),
      });
      const data = await res.json().catch(() => null);
      const photoUrl = data?.photoUrl || photoDataUrl;
      const faceId = data?.faceId || buildDemoFaceIdProfile({ gender: demoGender, photoUrl });
      stopCamera();
      onVerified({
        photoUrl,
        photoDataUrl,
        detectedGender: demoGender,
        userSelectedGender: demoGender,
        confidence: 99,
        faceId,
      });
    } catch {
      const fallbackFaceId = buildDemoFaceIdProfile({ gender: demoGender, photoUrl: photoDataUrl });
      stopCamera();
      onVerified({
        photoUrl: photoDataUrl,
        photoDataUrl,
        detectedGender: demoGender,
        userSelectedGender: demoGender,
        confidence: 99,
        faceId: fallbackFaceId,
      });
    } finally {
      if (mountedRef.current) setIsSaving(false);
    }
  };

  const isGreenVerified = phase === 'verified_ready' || phase === 'captured_preview';
  const demoPreviewSvg = buildDemoFaceIdSvgDataUrl(demoGender, userName);

  return (
    <div className="space-y-4 text-left text-zinc-100" data-testid="faceid-modal-root">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-rose-400">
            Biometrik Xavfsizlik
          </p>
          <h2 className="text-xl sm:text-2xl font-editorial font-bold text-white leading-tight">
            Face ID Tasdiqlash
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            {verificationMode === 'demo'
              ? 'Test rejimi faol — bir marta bosish bilan tezkor tasdiqlash.'
              : `${userName ? `${userName}, ` : ''}jinsni aniqlash va profil rasmingiz uchun kameraga qarang.`}
          </p>
        </div>
        {onCancel && (
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onCancel();
            }}
            className="min-w-[44px] min-h-[44px] w-11 h-11 rounded-full bg-white/[0.08] hover:bg-rose-600 border border-white/15 text-zinc-200 hover:text-white flex items-center justify-center transition shrink-0 cursor-pointer"
            aria-label="Bekor qilish"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Mode Switcher: Demo Test vs Live Camera */}
      <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-[#171A26] border border-white/10">
        <button
          type="button"
          data-testid="faceid-mode-demo"
          onClick={() => setVerificationMode('demo')}
          className={`min-h-[40px] px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 ${
            verificationMode === 'demo'
              ? 'bg-emerald-500 text-white shadow-sm'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Demo tekshirish</span>
        </button>
        <button
          type="button"
          data-testid="faceid-mode-camera"
          onClick={() => setVerificationMode('camera')}
          className={`min-h-[40px] px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 ${
            verificationMode === 'camera'
              ? 'bg-[#E11D48] text-white shadow-sm'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <Camera className="w-3.5 h-3.5" />
          <span>Jonli kamera</span>
        </button>
      </div>

      {verificationMode === 'demo' ? (
        <div className="space-y-3.5" data-testid="faceid-demo-panel">
          <div className="rounded-[24px] bg-[#171A26] border border-emerald-500/25 p-4 flex flex-col items-center text-center gap-3">
            <div className="w-28 h-36 rounded-2xl overflow-hidden border-2 border-emerald-400/60 shadow-lg bg-[#0E1017]">
              <img src={demoPreviewSvg} alt="Demo Face ID" className="w-full h-full object-cover" />
            </div>
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[11px] font-bold">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Demo rejim tayyor (Kamera shart emas)</span>
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed max-w-xs">
                Boshqa bo&apos;limlarni tez test qilish uchun jinsingizni tanlang va darhol tasdiqlang.
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-[11px] font-bold text-zinc-300">Jinsingizni tanlang:</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                aria-pressed={demoGender === 'female'}
                data-testid="faceid-demo-gender-female"
                onClick={() => setDemoGender('female')}
                className={`min-h-[44px] py-2.5 px-3 rounded-xl text-xs font-bold border transition cursor-pointer ${
                  demoGender === 'female'
                    ? 'bg-[#E11D48] text-white border-rose-400 shadow-md shadow-rose-950/40'
                    : 'bg-[#171A26] text-zinc-300 border-white/10 hover:border-rose-400/50'
                }`}
              >
                Ayol / Qiz
              </button>
              <button
                type="button"
                aria-pressed={demoGender === 'male'}
                data-testid="faceid-demo-gender-male"
                onClick={() => setDemoGender('male')}
                className={`min-h-[44px] py-2.5 px-3 rounded-xl text-xs font-bold border transition cursor-pointer ${
                  demoGender === 'male'
                    ? 'bg-sky-600 text-white border-sky-400 shadow-md shadow-sky-950/40'
                    : 'bg-[#171A26] text-zinc-300 border-white/10 hover:border-sky-400/50'
                }`}
              >
                Erkak / Yigit
              </button>
            </div>
          </div>

          <button
            type="button"
            data-testid="faceid-demo-verify-btn"
            onClick={handleDemoVerify}
            disabled={isSaving}
            className="w-full min-h-[48px] py-3.5 px-5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:brightness-110 text-white font-bold text-sm shadow-lg shadow-emerald-950/40 flex items-center justify-center gap-2 transition active:scale-[0.98] disabled:opacity-60 cursor-pointer"
          >
            {isSaving ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Tasdiqlanmoqda...</span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" />
                <span>Demo Face ID bilan tasdiqlash</span>
              </>
            )}
          </button>
        </div>
      ) : (
        <>

      {/* Camera Viewport or Captured Preview */}
      <div className="relative mx-auto w-full max-w-[290px] aspect-[3/4] rounded-[28px] overflow-hidden bg-[#181013] shadow-[0_18px_45px_rgba(34,23,25,0.22)]">
        {phase === 'captured_preview' && capturedPhotoDataUrl ? (
          <img
            src={capturedPhotoDataUrl}
            alt="Face ID surati"
            className="w-full h-full object-cover"
          />
        ) : (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover -scale-x-100"
            />
            <canvas
              ref={meshCanvasRef}
              className="absolute inset-0 w-full h-full pointer-events-none -scale-x-100"
            />
          </>
        )}

        {/* Biometric Oval Frame Guide */}
        {phase !== 'captured_preview' && !cameraError && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div
              className={`w-[72%] h-[76%] rounded-[999px] border-[3px] transition-all duration-300 ${
                isGreenVerified
                  ? 'border-emerald-400 shadow-[0_0_0_9999px_rgba(6,44,30,0.28),0_0_28px_rgba(16,185,129,0.6)]'
                  : faceDetected
                  ? 'border-rose-300 shadow-[0_0_0_9999px_rgba(20,12,15,0.42)]'
                  : 'border-white/60 border-dashed shadow-[0_0_0_9999px_rgba(20,12,15,0.52)]'
              }`}
            />
          </div>
        )}

        {/* Top Live Status Banner inside Camera */}
        {!cameraError && (
          <div className="absolute top-3 inset-x-3 flex items-center justify-between gap-2 pointer-events-none">
            <div
              className={`px-3 py-1.5 rounded-full backdrop-blur-md text-[11px] font-bold flex items-center gap-1.5 shadow-sm ${
                isGreenVerified
                  ? 'bg-emerald-500/95 text-white'
                  : 'bg-black/55 text-white border border-white/15'
              }`}
            >
              {isGreenVerified ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>Face ID Tasdiqlandi</span>
                </>
              ) : !cameraReady ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
                  <span>Kamera yoqilmoqda...</span>
                </>
              ) : !modelsReady ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
                  <span>Skaner tayyorlanmoqda...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-3.5 h-3.5 text-rose-200 shrink-0" />
                  <span>{faceDetected ? 'Yuzingiz aniqlandi' : 'Yuzingizni ramkaga tuting'}</span>
                </>
              )}
            </div>

            {faceDetected && (
              <div
                data-testid="faceid-detected-gender"
                className="px-2.5 py-1.5 rounded-full bg-white/92 backdrop-blur-md text-[#221719] text-[10.5px] font-extrabold shadow-sm"
              >
                {isGreenVerified ? 'Jonli tasdiqlandi ✓' : 'Yuz aniqlandi'}
              </div>
            )}
          </div>
        )}

        {/* Bottom instruction caption on live green verified camera */}
        {phase === 'verified_ready' && !cameraError && (
          <div className="absolute bottom-3 inset-x-3 bg-emerald-950/80 backdrop-blur-md text-emerald-50 px-3.5 py-2.5 rounded-2xl border border-emerald-400/40 text-center pointer-events-none">
            <p className="text-[11px] font-bold leading-snug">
              Zo'r! Xohlagan pozangizda turib, o'zingiz rasmga olish tugmasini bosing
            </p>
          </div>
        )}

            {/* Camera Error State */}
        {cameraError && (
          <div className="absolute inset-0 bg-[#1B1215] p-5 flex flex-col items-center justify-center text-center space-y-3 text-white">
            <div className="w-12 h-12 rounded-full bg-rose-500/20 text-rose-200 flex items-center justify-center">
              <Camera className="w-6 h-6" />
            </div>
            <p className="text-xs font-medium text-rose-100 leading-relaxed">{cameraError}</p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => setRetrySeed((s) => s + 1)}
                className="px-4 py-2 rounded-xl bg-[#C93545] hover:bg-[#b22938] text-white text-xs font-bold transition cursor-pointer"
              >
                Kamerani qayta yoqish
              </button>
              <button
                type="button"
                onClick={() => setVerificationMode('demo')}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition cursor-pointer"
              >
                Demo rejimga o&apos;tish
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Gentle 2-Action Liveness Checklist */}
      {phase === 'scanning' && (
        <div className="bg-[#171A26] border border-white/10 rounded-2xl p-3 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className={`flex items-center gap-2 font-semibold ${faceDetected ? 'text-emerald-400' : 'text-zinc-300'}`}>
              <UserCheck className="w-4 h-4 shrink-0" />
              <span>1. Yuzingizni ramka ichiga keltiring</span>
            </span>
            <span className={`text-[11px] font-bold ${faceDetected ? 'text-emerald-400' : 'text-zinc-500'}`}>
              {faceDetected ? 'Bajarildi ✓' : 'Kutilmoqda'}
            </span>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className={`flex items-center gap-2 font-semibold ${blinkVerified ? 'text-emerald-400' : 'text-zinc-300'}`}>
              <Eye className="w-4 h-4 shrink-0" />
              <span>2. Ko'zingizni bir marta ochib-yuming</span>
            </span>
            <span className={`text-[11px] font-bold ${blinkVerified ? 'text-emerald-400' : 'text-rose-400'}`}>
              {blinkVerified ? 'Bajarildi ✓' : 'Kutilmoqda'}
            </span>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className={`flex items-center gap-2 font-semibold ${smileVerified ? 'text-emerald-400' : 'text-zinc-300'}`}>
              <Smile className="w-4 h-4 shrink-0" />
              <span>3. Ozgina tabassum qiling</span>
            </span>
            <span className={`text-[11px] font-bold ${smileVerified ? 'text-emerald-400' : 'text-rose-400'}`}>
              {smileVerified ? 'Bajarildi ✓' : 'Kutilmoqda'}
            </span>
          </div>
        </div>
      )}

      {/* Green Verified State -> Manual Pose Shutter */}
      {phase === 'verified_ready' && (
        <div className="space-y-3">
          <div className="bg-emerald-500/15 border border-emerald-500/30 rounded-2xl px-3.5 py-2.5 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-emerald-200 font-bold">
              <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Jonlilik tekshiruvi muvaffaqiyatli o'tdi!</span>
            </div>
            <span className="font-black text-emerald-400">100% Real</span>
          </div>

          <button
            type="button"
            data-testid="faceid-capture-btn"
            onClick={handleManualCapture}
            className="w-full py-3.5 px-5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-sm shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 transition active:scale-[0.98] cursor-pointer"
          >
            <Camera className="w-4 h-4" />
            <span>Rasmga olish</span>
          </button>
        </div>
      )}

      {/* Captured Photo Preview -> Retake, Optional Gender Select, or Confirm */}
      {phase === 'captured_preview' && (
        <div className="space-y-3">
          <div className="bg-[#171A26] border border-white/10 rounded-2xl p-3 space-y-2.5 text-xs">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-bold text-white">
                  {userSelectedGender
                    ? <>Tanlangan jins: <span className="text-rose-400">{genderToUzLabel(userSelectedGender)}</span></>
                    : "Jinsingizni tanlang"}
                </p>
                <p className="text-[11px] text-zinc-400">
                  {isAnalyzingServer
                    ? "Biometrik rasm tayyorlanmoqda..."
                    : "O'zingizga mos tugmani tanlang (keyingi oynada ham tanlash mumkin)"}
                </p>
              </div>
              <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
            </div>

            <div className="grid grid-cols-2 gap-2 pt-0.5">
              <button
                type="button"
                data-testid="faceid-gender-female"
                onClick={() => setUserSelectedGender('female')}
                className={`py-2 px-3 rounded-xl text-xs font-bold border transition cursor-pointer ${
                  userSelectedGender === 'female'
                    ? 'bg-[#E11D48] text-white border-rose-400 shadow-xs'
                    : 'bg-[#11131C] text-zinc-300 border-white/10 hover:border-rose-400/50'
                }`}
              >
                Ayol / Qiz
              </button>
              <button
                type="button"
                data-testid="faceid-gender-male"
                onClick={() => setUserSelectedGender('male')}
                className={`py-2 px-3 rounded-xl text-xs font-bold border transition cursor-pointer ${
                  userSelectedGender === 'male'
                    ? 'bg-sky-600 text-white border-sky-400 shadow-xs'
                    : 'bg-[#11131C] text-zinc-300 border-white/10 hover:border-sky-400/50'
                }`}
              >
                Erkak / Yigit
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              data-testid="faceid-retake-btn"
              onClick={handleRetakePhoto}
              disabled={isSaving}
              className="py-3 px-4 rounded-2xl bg-[#171A26] border border-white/15 text-zinc-200 hover:bg-white/10 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Qayta olish</span>
            </button>

            <button
              type="button"
              data-testid="faceid-confirm-btn"
              onClick={handleConfirmAndSave}
              disabled={isSaving || isAnalyzingServer}
              className="py-3 px-4 rounded-2xl bg-gradient-to-r from-[#C93545] to-[#A62433] hover:brightness-105 text-white font-bold text-xs shadow-md flex items-center justify-center gap-1.5 transition disabled:opacity-60 cursor-pointer"
            >
              {isSaving ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Saqlanmoqda...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Tasdiqlash</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
};
