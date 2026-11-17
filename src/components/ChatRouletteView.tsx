import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  SkipForward,
  PhoneOff,
  Shuffle,
  ShieldCheck,
  Sparkles,
  UserCheck,
} from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import { MAIN_RENDER_ORIGIN, getBaseUrl, resolveApiMediaUrl } from '../config/api';
import { extractLocalAuthCredentials } from '../utils/microFrontendBridge';

interface ChatRouletteViewProps {
  currentUser: any | null;
  backendOrigin?: string;
  onOpenAuth?: () => void;
  onOpenProfile?: (uid: string, snapshot?: any) => void;
  onNotify?: (msg: string) => void;
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

function createRouletteFallbackStream(label: string): MediaStream {
  const canvas = document.createElement('canvas');
  canvas.width = 480;
  canvas.height = 640;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, 480, 640);
    grad.addColorStop(0, '#2a0a18');
    grad.addColorStop(1, '#09090d');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 480, 640);
    ctx.fillStyle = 'rgba(225, 29, 72, 0.25)';
    ctx.beginPath();
    ctx.arc(240, 290, 72, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label || 'Alov Foydalanuvchisi', 240, 300);
    ctx.font = '14px sans-serif';
    ctx.fillStyle = '#fda4af';
    ctx.fillText('Kamerasiz video chat rejimi', 240, 336);
  }
  return typeof canvas.captureStream === 'function' ? canvas.captureStream(5) : new MediaStream();
}

export const ChatRouletteView: React.FC<ChatRouletteViewProps> = ({
  currentUser,
  backendOrigin,
  onOpenAuth,
  onOpenProfile,
  onNotify,
}) => {
  const [status, setStatus] = useState<'idle' | 'searching' | 'connected'>('idle');
  const [partner, setPartner] = useState<any | null>(null);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isCamOff, setIsCamOff] = useState(false);
  const [mediaNotice, setMediaNotice] = useState<string | null>(null);
  const [remoteConnected, setRemoteConnected] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const partnerSocketIdRef = useRef<string | null>(null);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);

  const cleanupPeer = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    pendingIceRef.current = [];
    partnerSocketIdRef.current = null;
    setRemoteConnected(false);
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
  }, []);

  const stopLocalMedia = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
  }, []);

  const ensureLocalMedia = useCallback(async (): Promise<MediaStream> => {
    if (localStreamRef.current) return localStreamRef.current;
    setMediaNotice(null);

    if (navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 720 } },
          audio: true,
        });
        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          localVideoRef.current.play().catch(() => {});
        }
        setIsMicMuted(false);
        setIsCamOff(false);
        return stream;
      } catch {
        try {
          const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const stage = createRouletteFallbackStream(currentUser?.name || 'Siz');
          const combined = new MediaStream([
            ...audioStream.getAudioTracks(),
            ...stage.getVideoTracks(),
          ]);
          localStreamRef.current = combined;
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = combined;
            localVideoRef.current.play().catch(() => {});
          }
          setIsCamOff(true);
          setMediaNotice("Kamera ruxsati berilmadi — faqat ovoz bilan ulanildi.");
          return combined;
        } catch {
          // fall through to silent stage stream
        }
      }
    }

    const fallback = createRouletteFallbackStream(currentUser?.name || 'Siz');
    localStreamRef.current = fallback;
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = fallback;
      localVideoRef.current.play().catch(() => {});
    }
    setIsCamOff(true);
    setIsMicMuted(true);
    setMediaNotice("Kamera/mikrofon topilmadi — sinov rejimida ishlayapti.");
    return fallback;
  }, [currentUser?.name]);

  const createPeerForPartner = useCallback(
    (targetSocketId: string, isInitiator: boolean) => {
      cleanupPeer();
      partnerSocketIdRef.current = targetSocketId;

      const pc = new RTCPeerConnection(ICE_SERVERS);
      pcRef.current = pc;

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, localStreamRef.current!);
        });
      }

      pc.ontrack = (event) => {
        if (remoteVideoRef.current) {
          const stream = event.streams?.[0] || new MediaStream([event.track]);
          remoteVideoRef.current.srcObject = stream;
          remoteVideoRef.current.play().catch(() => {});
          setRemoteConnected(true);
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate && socketRef.current) {
          socketRef.current.emit('roulette_ice_candidate', {
            targetSocketId,
            candidate: event.candidate.toJSON(),
          });
        }
      };

      if (isInitiator) {
        pc.createOffer()
          .then((offer) => pc.setLocalDescription(offer).then(() => offer))
          .then((offer) => {
            socketRef.current?.emit('roulette_offer', {
              targetSocketId,
              offer: { type: offer.type, sdp: offer.sdp },
            });
          })
          .catch((e) => console.warn('Roulette offer error:', e));
      }
    },
    [cleanupPeer]
  );

  const signalingUrl = (backendOrigin && backendOrigin.trim()) || getBaseUrl() || MAIN_RENDER_ORIGIN;
  const authCreds =
    typeof window !== 'undefined' && window.localStorage
      ? extractLocalAuthCredentials(window.localStorage)
      : { token: '', userId: '', user: null };
  const authUserId = String(currentUser?.uid || authCreds.userId || '').trim();
  const authToken = String(currentUser?.authToken || authCreds.token || '').trim();

  useEffect(() => {
    const socket = io(signalingUrl, {
      transports: ['websocket', 'polling'],
      withCredentials: true,
      reconnection: true,
      auth: {
        token: authToken,
        userId: authUserId,
      },
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      if (authUserId) {
        socket.emit('user_online', authUserId);
      }
    });

    socket.on('roulette_waiting', () => {
      setStatus('searching');
      setPartner(null);
      cleanupPeer();
    });

    socket.on('roulette_matched', ({ partner: matchedPartner, partnerSocketId, initiator }: any) => {
      setPartner(matchedPartner || null);
      setStatus('connected');
      if (partnerSocketId) {
        createPeerForPartner(partnerSocketId, Boolean(initiator));
      }
    });

    socket.on('roulette_offer', async ({ senderSocketId, offer }: any) => {
      if (!senderSocketId || !offer) return;
      if (!pcRef.current || partnerSocketIdRef.current !== senderSocketId) {
        createPeerForPartner(senderSocketId, false);
      }
      const pc = pcRef.current;
      if (!pc) return;
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        for (const cand of pendingIceRef.current) {
          await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
        }
        pendingIceRef.current = [];
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('roulette_answer', {
          targetSocketId: senderSocketId,
          answer: { type: answer.type, sdp: answer.sdp },
        });
      } catch (e) {
        console.warn('Roulette answer error:', e);
      }
    });

    socket.on('roulette_answer', async ({ answer }: any) => {
      const pc = pcRef.current;
      if (!pc || !answer) return;
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        for (const cand of pendingIceRef.current) {
          await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
        }
        pendingIceRef.current = [];
      } catch (e) {
        console.warn('Roulette setRemoteDescription answer error:', e);
      }
    });

    socket.on('roulette_ice_candidate', async ({ candidate }: any) => {
      if (!candidate) return;
      const pc = pcRef.current;
      if (pc && pc.remoteDescription) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
      } else {
        pendingIceRef.current.push(candidate);
      }
    });

    socket.on('roulette_partner_left', () => {
      cleanupPeer();
      setPartner(null);
      setStatus('searching');
      onNotify?.('Suhbatdosh suhbatni tark etdi. Yangi suhbatdosh qidirilmoqda...');
    });

    return () => {
      socket.emit('leave_roulette');
      socket.disconnect();
      socketRef.current = null;
      cleanupPeer();
      stopLocalMedia();
    };
  }, [authToken, authUserId, cleanupPeer, createPeerForPartner, onNotify, signalingUrl, stopLocalMedia]);

  const handleStart = async () => {
    if (!currentUser?.uid) {
      onOpenAuth?.();
      return;
    }
    await ensureLocalMedia();
    setStatus('searching');
    setPartner(null);
    socketRef.current?.emit('join_roulette', {
      uid: currentUser.uid,
      name: currentUser.name || 'Foydalanuvchi',
      avatar: currentUser.avatar || '',
      gender: currentUser.gender || '',
    });
  };

  const handleNext = async () => {
    cleanupPeer();
    setPartner(null);
    setStatus('searching');
    await ensureLocalMedia();
    socketRef.current?.emit('roulette_next', {
      uid: currentUser?.uid,
      name: currentUser?.name || 'Foydalanuvchi',
      avatar: currentUser?.avatar || '',
      gender: currentUser?.gender || '',
    });
  };

  const handleStop = () => {
    socketRef.current?.emit('leave_roulette');
    cleanupPeer();
    stopLocalMedia();
    setPartner(null);
    setStatus('idle');
  };

  const toggleMic = () => {
    if (!localStreamRef.current) return;
    const next = !isMicMuted;
    localStreamRef.current.getAudioTracks().forEach((t) => {
      t.enabled = !next;
    });
    setIsMicMuted(next);
  };

  const toggleCam = () => {
    if (!localStreamRef.current) return;
    const next = !isCamOff;
    localStreamRef.current.getVideoTracks().forEach((t) => {
      t.enabled = !next;
    });
    setIsCamOff(next);
  };

  return (
    <div
      data-testid="chatruletka-view"
      className="relative w-full h-full min-h-[calc(100dvh-140px)] bg-[#09090D] rounded-[24px] border border-white/[0.08] overflow-hidden flex flex-col justify-between text-white"
    >
      {/* Top Status Bar */}
      <div className="relative z-20 p-4 flex items-center justify-between gap-2 bg-gradient-to-b from-black/75 to-transparent">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-rose-600/20 border border-rose-500/35 flex items-center justify-center">
            <Shuffle className="w-4.5 h-4.5 text-rose-400" />
          </div>
          <div>
            <h2 className="font-editorial text-lg font-bold leading-tight">Chatruletka</h2>
            <p className="text-[11px] text-zinc-400">
              {status === 'connected' && partner
                ? `${partner.name} bilan jonli video suhbat`
                : status === 'searching'
                ? 'Tasodifiy suhbatdosh qidirilmoqda...'
                : 'Yangi insonlar bilan tasodifiy 1-ga-1 video chat'}
            </p>
          </div>
        </div>

        <span
          data-testid="chatruletka-status-badge"
          className={`px-3 py-1 rounded-full text-[11px] font-bold border ${
            status === 'connected'
              ? 'bg-emerald-500/15 border-emerald-400/30 text-emerald-300'
              : status === 'searching'
              ? 'bg-amber-500/15 border-amber-400/30 text-amber-200 animate-pulse'
              : 'bg-white/[0.06] border-white/10 text-zinc-300'
          }`}
        >
          {status === 'connected' ? 'Ulangan' : status === 'searching' ? 'Qidirilmoqda' : 'Tayyor'}
        </span>
      </div>

      {/* Main Video Stage */}
      <div className="relative flex-1 min-h-[340px] flex items-center justify-center bg-[#0D0F18]">
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className={`absolute inset-0 w-full h-full object-cover ${
            status === 'connected' && remoteConnected ? 'opacity-100' : 'opacity-0'
          }`}
        />

        {status === 'idle' && (
          <div className="relative z-10 max-w-sm mx-auto p-6 text-center space-y-4">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-rose-600/25 to-amber-500/15 border border-rose-500/35 flex items-center justify-center mx-auto shadow-2xl shadow-rose-950/40">
              <Sparkles className="w-9 h-9 text-rose-400" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-xl font-editorial font-bold text-white">
                Jonli Video Chatruletka
              </h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Bir bosishda tasodifiy suhbatdoshga ulaning. Yoqmasa «Keyingisi» tugmasini bosib darhol boshqa inson bilan tanishing.
              </p>
            </div>
            <button
              type="button"
              data-testid="chatruletka-start-btn"
              onClick={handleStart}
              className="px-7 py-3.5 rounded-full bg-gradient-to-r from-[#E11D48] to-[#BE123C] hover:brightness-110 text-white font-bold text-xs shadow-xl shadow-rose-950/50 inline-flex items-center gap-2 transition active:scale-95 cursor-pointer"
            >
              <Video className="w-4 h-4" />
              <span>Suhbatdosh izlash</span>
            </button>
          </div>
        )}

        {status === 'searching' && (
          <div className="relative z-10 text-center space-y-3 p-6">
            <div className="w-16 h-16 rounded-full border-4 border-rose-500/30 border-t-rose-500 animate-spin mx-auto" />
            <p className="text-sm font-bold text-white">Yangi suhbatdosh izlanmoqda...</p>
            <p className="text-xs text-zinc-400">Onlayn foydalanuvchilar bilan tez orada ulanasiz</p>
          </div>
        )}

        {status === 'connected' && partner && (
          <div className="absolute top-3 left-4 z-20 flex items-center gap-2.5 bg-black/55 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10">
            <img
              src={
                resolveApiMediaUrl(partner.avatar) ||
                '/assets/aistudio/image_e20a1307.webp'
              }
              alt={partner.name}
              className="w-7 h-7 rounded-full object-cover border border-rose-500/60"
            />
            <span className="text-xs font-bold text-white">{partner.name}</span>
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            {partner.uid && onOpenProfile && (
              <button
                type="button"
                onClick={() => onOpenProfile(partner.uid, partner)}
                className="text-[10px] font-bold text-rose-300 hover:text-white underline cursor-pointer"
              >
                Profil
              </button>
            )}
          </div>
        )}

        {/* Local PiP Camera Preview */}
        {status !== 'idle' && (
          <div className="absolute bottom-4 right-4 z-20 w-28 h-40 sm:w-36 sm:h-48 rounded-2xl overflow-hidden border-2 border-white/20 bg-black shadow-2xl">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover -scale-x-100"
            />
            {isCamOff && (
              <div className="absolute inset-0 bg-[#141724]/90 flex flex-col items-center justify-center text-zinc-400 gap-1">
                <UserCheck className="w-5 h-5 text-rose-400" />
                <span className="text-[9px] font-bold">Kamera o'chiq</span>
              </div>
            )}
          </div>
        )}

        {mediaNotice && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-400/35 text-amber-200 text-[10.5px] font-medium backdrop-blur-md">
            {mediaNotice}
          </div>
        )}
      </div>

      {/* Bottom Controls */}
      {status !== 'idle' && (
        <div className="relative z-20 p-4 bg-gradient-to-t from-black/85 to-transparent flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={toggleMic}
            aria-label={isMicMuted ? 'Mikrofonni yoqish' : "Mikrofonni o'chirish"}
            className={`p-3 rounded-full border transition cursor-pointer ${
              isMicMuted
                ? 'bg-rose-600 border-rose-400 text-white'
                : 'bg-white/10 border-white/15 text-white hover:bg-white/20'
            }`}
          >
            {isMicMuted ? <MicOff className="w-4.5 h-4.5" /> : <Mic className="w-4.5 h-4.5" />}
          </button>

          <button
            type="button"
            onClick={toggleCam}
            aria-label={isCamOff ? 'Kamerani yoqish' : "Kamerani o'chirish"}
            className={`p-3 rounded-full border transition cursor-pointer ${
              isCamOff
                ? 'bg-rose-600 border-rose-400 text-white'
                : 'bg-white/10 border-white/15 text-white hover:bg-white/20'
            }`}
          >
            {isCamOff ? <VideoOff className="w-4.5 h-4.5" /> : <Video className="w-4.5 h-4.5" />}
          </button>

          <button
            type="button"
            data-testid="chatruletka-next-btn"
            onClick={handleNext}
            className="px-5 py-3 rounded-full bg-gradient-to-r from-rose-600 to-red-600 hover:brightness-110 text-white font-bold text-xs flex items-center gap-2 shadow-lg transition active:scale-95 cursor-pointer"
          >
            <SkipForward className="w-4 h-4" />
            <span>Keyingisi</span>
          </button>

          <button
            type="button"
            data-testid="chatruletka-stop-btn"
            onClick={handleStop}
            aria-label="Chatruletkani to'xtatish"
            className="p-3 rounded-full bg-red-700/90 hover:bg-red-600 text-white border border-red-400/30 transition cursor-pointer"
          >
            <PhoneOff className="w-4.5 h-4.5" />
          </button>
        </div>
      )}
    </div>
  );
};
