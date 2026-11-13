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

let modelsLoadedPromise: Promise<void> | null = null;

async function ensureFaceModelsLoaded(): Promise<void> {
  if (!modelsLoadedPromise) {
    modelsLoadedPromise = Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri('/face-models'),
      faceapi.nets.faceLandmark68TinyNet.loadFromUri('/face-models'),
      faceapi.nets.faceExpressionNet.loadFromUri('/face-models'),
      faceapi.nets.ageGenderNet.loadFromUri('/face-models'),
    ]).then(() => undefined);
  }
  return modelsLoadedPromise;
}

export const FaceIdVerificationModal: React.FC<FaceIdVerificationModalProps> = ({
  apiBaseUrl,
  userUid,
  userName,
  onVerified,
  onCancel,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
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
      try {
        await ensureFaceModelsLoaded();
        if (!active) return;
        setModelsReady(true);

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          setCameraError("Qurilmangiz kamerani qo'llab-quvvatlamaydi yoki xavfsiz ulanish (HTTPS) talab etiladi.");
          return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 720 },
            height: { ideal: 960 },
          },
          audio: false,
        });

        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
          if (active) setCameraReady(true);
        }
      } catch (err: any) {
        if (!active) return;
        const msg =
          err?.name === 'NotAllowedError'
            ? "Kameraga ruxsat berilmadi. Face ID dan o'tish uchun brauzerda kamera ruxsatini yoqing."
            : err?.name === 'NotFoundError'
            ? "Old kamera topilmadi. Iltimos, kamera ulanganligini tekshiring."
            : "Kamerani ishga tushirishda xatolik yuz berdi. Qayta urinib ko'ring.";
        setCameraError(msg);
      }
    };

    init();

    return () => {
      active = false;
      mountedRef.current = false;
      stopCamera();
    };
  }, [retrySeed]);

  // Real-time biometric landmark, blink, smile & gender detection loop
  useEffect(() => {
    if (!modelsReady || !cameraReady || phase === 'captured_preview') return;

    let cancelled = false;
    let localFaceSeen = false;
    let localBlink = blinkVerified;
    let localSmile = smileVerified;

    const tick = async () => {
      if (cancelled || !mountedRef.current) return;
      const video = videoRef.current;

      if (video && video.readyState >= 2 && video.videoWidth > 0) {
        try {
          const detection = await faceapi
            .detectSingleFace(
              video,
              new faceapi.TinyFaceDetectorOptions({
                inputSize: 224,
                scoreThreshold: 0.42,
              })
            )
            .withFaceLandmarks(true)
            .withFaceExpressions()
            .withAgeAndGender();

          if (!cancelled && mountedRef.current) {
            if (detection) {
              if (!localFaceSeen) {
                localFaceSeen = true;
                setFaceDetected(true);
              }

              // Accumulate gender votes continuously
              if (detection.gender === 'male' || detection.gender === 'female') {
                genderVotesRef.current.push({
                  gender: detection.gender,
                  probability: Number(detection.genderProbability) || 0.7,
                });
                if (genderVotesRef.current.length > 30) {
                  genderVotesRef.current.shift();
                }
                const resolved = resolveDetectedGender(genderVotesRef.current);
                setDetectedGender(resolved.gender);
                setGenderConfidence(resolved.confidence);
              }

              // Landmark blink & smile liveness checks (only needed until unlocked)
              if (phase === 'scanning') {
                const pts = detection.landmarks.positions.map((p) => ({ x: p.x, y: p.y }));
                if (!localBlink) {
                  const { avgEAR } = computeAverageEAR(pts);
                  blinkStateRef.current = updateBlinkTracker(blinkStateRef.current, avgEAR);
                  if (blinkStateRef.current.blinkDetected) {
                    localBlink = true;
                    setBlinkVerified(true);
                  }
                }

                if (!localSmile) {
                  const happyProb = Number((detection.expressions as any)?.happy || 0);
                  const smileRes = computeSmileMetrics(pts, happyProb);
                  if (smileRes.isSmiling) {
                    localSmile = true;
                    setSmileVerified(true);
                  }
                }

                if (localFaceSeen && localBlink && localSmile) {
                  // Turn ring emerald green and wait for the user to manually take their pose photo
                  setPhase('verified_ready');
                }
              }
            } else if (phase === 'scanning' && !localFaceSeen) {
              setFaceDetected(false);
            }
          }
        } catch {
          // Skip transient frame errors silently
        }
      }

      if (!cancelled && mountedRef.current) {
        loopTimerRef.current = window.setTimeout(tick, 110);
      }
    };

    loopTimerRef.current = window.setTimeout(tick, 120);

    return () => {
      cancelled = true;
      if (loopTimerRef.current !== null) {
        window.clearTimeout(loopTimerRef.current);
        loopTimerRef.current = null;
      }
    };
  }, [modelsReady, cameraReady, phase, blinkVerified, smileVerified]);

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
                  <span>Face ID Tasdiqlandi (Yashil)</span>
                </>
              ) : !modelsReady || !cameraReady ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
                  <span>Kamera tayyorlanmoqda...</span>
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
                {detectedGender === 'female' ? '👩 Qiz' : '👨 Yigit'} · {genderConfidence}%
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
            <span>📸 Rasmga olish</span>
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
                  <span>Tasdiqlash ✨</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
