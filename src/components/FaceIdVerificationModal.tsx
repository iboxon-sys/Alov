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
  detectedGender: 'male' | 'female';
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
  const [detectedGender, setDetectedGender] = useState<'male' | 'female'>('female');
  const [genderConfidence, setGenderConfidence] = useState<number>(88);
  const [isSaving, setIsSaving] = useState(false);
  const [isAnalyzingServer, setIsAnalyzingServer] = useState(false);
  const [retrySeed, setRetrySeed] = useState(0);

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
          const stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: 'user',
              width: { ideal: 640 },
              height: { ideal: 800 },
            },
            audio: false,
          });

          if (!active) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }

          streamRef.current = stream;
          const videoEl = videoRef.current;
          if (videoEl) {
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
      mountedRef.current = false;
      stopCamera();
    };
  }, [retrySeed]);

  // Continuous low-latency biometric landmark + throttled gender/expression loop
  useEffect(() => {
    if (!modelsReady || !cameraReady) return;

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
                  inputSize: 224,
                  scoreThreshold: 0.24,
                })
              )
              .withFaceLandmarks(true);

            if (!cancelled && mountedRef.current) {
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
                          inputSize: 224,
                          scoreThreshold: 0.24,
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
      const localResolved = resolveDetectedGender(genderVotesRef.current);
      const res = await fetch(`${apiBaseUrl}/api/face-id/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: dataUrl,
          localGender: localResolved.gender,
          localConfidence: localResolved.confidence,
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
      // Keep on-device resolved gender seamlessly
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
    setIsSaving(true);
    try {
      const res = await fetch(`${apiBaseUrl}/api/face-id/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: userUid,
          photoDataUrl: capturedPhotoDataUrl,
          detectedGender,
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
        detectedGender,
        genderLabelUz: genderToUzLabel(detectedGender),
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
        detectedGender,
        confidence: genderConfidence,
        faceId,
      });
    } catch {
      const fallbackFaceId: FaceIdProfileData = {
        verified: true,
        detectedGender,
        genderLabelUz: genderToUzLabel(detectedGender),
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
        detectedGender,
        confidence: genderConfidence,
        faceId: fallbackFaceId,
      });
    } finally {
      if (mountedRef.current) setIsSaving(false);
    }
  };

  const isGreenVerified = phase === 'verified_ready' || phase === 'captured_preview';

  return (
    <div className="space-y-4 text-left">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#C93545]">
            Biometrik Xavfsizlik
          </p>
          <h2 className="text-2xl font-editorial font-bold text-[#221719] leading-tight">
            Haqiqiy Face ID Tasdiqlash
          </h2>
          <p className="text-xs text-[#6B5B5E] mt-0.5">
            {userName ? `${userName}, ` : ''}jinsni aniqlash va haqiqiy profil rasmingiz uchun kameraga qarang.
          </p>
        </div>
        {onCancel && (
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onCancel();
            }}
            className="p-2 rounded-full text-slate-400 hover:text-slate-700 hover:bg-rose-50 transition shrink-0"
            aria-label="Bekor qilish"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Camera Viewport or Captured Preview */}
      <div className="relative mx-auto w-full max-w-[290px] aspect-[3/4] rounded-[28px] overflow-hidden bg-[#181013] shadow-[0_18px_45px_rgba(34,23,25,0.22)]">
        {phase === 'captured_preview' && capturedPhotoDataUrl ? (
          <img
            src={capturedPhotoDataUrl}
            alt="Face ID surati"
            className="w-full h-full object-cover"
          />
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover -scale-x-100"
          />
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
                  <ShieldCheck className="w-3.5 h-3.5 text-rose-300 shrink-0" />
                  <span>{faceDetected ? 'Yuzingiz aniqlandi' : 'Yuzingizni ramkaga tuting'}</span>
                </>
              )}
            </div>

            {faceDetected && (
              <div
                data-testid="faceid-detected-gender"
                className="px-2.5 py-1.5 rounded-full bg-white/92 backdrop-blur-md text-[#221719] text-[10.5px] font-extrabold shadow-sm"
              >
                {detectedGender === 'female' ? 'Qiz' : 'Yigit'} · {genderConfidence}%
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
            <div className="w-12 h-12 rounded-full bg-rose-500/20 text-rose-300 flex items-center justify-center">
              <Camera className="w-6 h-6" />
            </div>
            <p className="text-xs font-medium text-rose-100 leading-relaxed">{cameraError}</p>
            <button
              type="button"
              onClick={() => setRetrySeed((s) => s + 1)}
              className="px-4 py-2 rounded-xl bg-[#C93545] hover:bg-[#b22938] text-white text-xs font-bold transition"
            >
              Kamerani qayta yoqish
            </button>
          </div>
        )}
      </div>

      {/* Gentle 2-Action Liveness Checklist */}
      {phase === 'scanning' && (
        <div className="bg-[#FAF4F2] border border-rose-200/70 rounded-2xl p-3 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className={`flex items-center gap-2 font-semibold ${faceDetected ? 'text-emerald-700' : 'text-[#5D4C50]'}`}>
              <UserCheck className="w-4 h-4 shrink-0" />
              <span>1. Yuzingizni ramka ichiga keltiring</span>
            </span>
            <span className={`text-[11px] font-bold ${faceDetected ? 'text-emerald-600' : 'text-slate-400'}`}>
              {faceDetected ? 'Bajarildi ✓' : 'Kutilmoqda'}
            </span>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className={`flex items-center gap-2 font-semibold ${blinkVerified ? 'text-emerald-700' : 'text-[#5D4C50]'}`}>
              <Eye className="w-4 h-4 shrink-0" />
              <span>2. Ko'zingizni bir marta ochib-yuming</span>
            </span>
            <span className={`text-[11px] font-bold ${blinkVerified ? 'text-emerald-600' : 'text-[#C93545]'}`}>
              {blinkVerified ? 'Bajarildi ✓' : 'Kutilmoqda'}
            </span>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className={`flex items-center gap-2 font-semibold ${smileVerified ? 'text-emerald-700' : 'text-[#5D4C50]'}`}>
              <Smile className="w-4 h-4 shrink-0" />
              <span>3. Ozgina tabassum qiling</span>
            </span>
            <span className={`text-[11px] font-bold ${smileVerified ? 'text-emerald-600' : 'text-[#C93545]'}`}>
              {smileVerified ? 'Bajarildi ✓' : 'Kutilmoqda'}
            </span>
          </div>
        </div>
      )}

      {/* Green Verified State -> Manual Pose Shutter */}
      {phase === 'verified_ready' && (
        <div className="space-y-3">
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-3.5 py-2.5 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-emerald-900 font-bold">
              <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Avtomatik aniqlangan jins:</span>
            </div>
            <span className="font-black text-emerald-700">
              {genderToUzLabel(detectedGender)} ({genderConfidence}%)
            </span>
          </div>

          <button
            type="button"
            data-testid="faceid-capture-btn"
            onClick={handleManualCapture}
            className="w-full py-3.5 px-5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-sm shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 transition active:scale-[0.98]"
          >
            <Camera className="w-4 h-4" />
            <span>Rasmga olish</span>
          </button>
        </div>
      )}

      {/* Captured Photo Preview -> Retake or Confirm */}
      {phase === 'captured_preview' && (
        <div className="space-y-3">
          <div className="bg-[#FAF4F2] border border-rose-200/70 rounded-2xl p-3 flex items-center justify-between text-xs">
            <div>
              <p className="font-bold text-[#221719]">
                Face ID aniqlagan jins: <span className="text-[#C93545]">{genderToUzLabel(detectedGender)}</span>
              </p>
              <p className="text-[11px] text-[#6B5B5E]">
                {isAnalyzingServer
                  ? "Biometrik aniqlik tekshirilmoqda..."
                  : `Ishonchlilik: ${genderConfidence}% · Profil rasmi sifatida saqlanadi`}
              </p>
            </div>
            <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              data-testid="faceid-retake-btn"
              onClick={handleRetakePhoto}
              disabled={isSaving}
              className="py-3 px-4 rounded-2xl bg-white border border-rose-200 text-[#221719] hover:bg-rose-50 font-bold text-xs flex items-center justify-center gap-1.5 transition"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Qayta olish</span>
            </button>

            <button
              type="button"
              data-testid="faceid-confirm-btn"
              onClick={handleConfirmAndSave}
              disabled={isSaving || isAnalyzingServer}
              className="py-3 px-4 rounded-2xl bg-gradient-to-r from-[#C93545] to-[#A62433] hover:brightness-105 text-white font-bold text-xs shadow-md flex items-center justify-center gap-1.5 transition disabled:opacity-60"
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
    </div>
  );
};
