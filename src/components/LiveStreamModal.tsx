import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  Video,
  VideoOff,
  Mic,
  MicOff,
  Send,
  Heart,
  Flame,
  Eye,
  Radio,
  RotateCcw,
  ShieldAlert,
  Volume2,
  VolumeX,
  Crown,
} from 'lucide-react';
import { getApiUrl, getBaseUrl } from '../config/api';
import { resolveRealtimeBackendUrl } from '../utils/microFrontendBridge';
import { io, Socket } from 'socket.io-client';
import {
  createLiveStream,
  stopLiveStream,
  BroadcasterSignaling,
  ViewerSignaling,
  type LiveChatMessage,
} from '../services/webrtc';
import {
  appendFloatingHeart,
  appendStreamChatMessage,
  createFloatingHeart,
  formatStreamDuration,
  normalizeStreamChatMessage,
  type FloatingHeartItem,
} from '../utils/liveStream';

interface LiveStreamModalProps {
  mode: 'broadcaster' | 'viewer';
  streamId?: string;
  hostUser?: {
    uid: string;
    id?: string;
    name: string;
    avatar?: string;
    liveTitle?: string;
  };
  currentUser: {
    uid: string;
    id?: string;
    name: string;
    avatar?: string;
  };
  backendOrigin?: string;
  onClose: () => void;
}

const DEFAULT_AVATAR = '/assets/aistudio/image_e20a1307.webp';

function createHostStageFallbackStream(hostName: string, title: string): MediaStream {
  const canvas = document.createElement('canvas');
  canvas.width = 480;
  canvas.height = 854;
  const ctx = canvas.getContext('2d');
  const drawFrame = () => {
    if (!ctx) return;
    const grad = ctx.createLinearGradient(0, 0, 480, 854);
    grad.addColorStop(0, '#4c0519');
    grad.addColorStop(0.5, '#18181b');
    grad.addColorStop(1, '#09090d');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 480, 854);
    ctx.fillStyle = 'rgba(225, 29, 72, 0.22)';
    ctx.beginPath();
    ctx.arc(240, 380, 96, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(hostName || 'Alov Strimer', 240, 385);
    ctx.font = '16px sans-serif';
    ctx.fillStyle = '#fda4af';
    ctx.fillText(title || 'Jonli Efir 🔥', 240, 422);
  };
  drawFrame();
  const timer = window.setInterval(drawFrame, 1000);
  const stream = typeof canvas.captureStream === 'function' ? canvas.captureStream(5) : new MediaStream();
  stream.getTracks().forEach((track) => {
    const origStop = track.stop.bind(track);
    track.stop = () => {
      window.clearInterval(timer);
      origStop();
    };
  });
  return stream;
}

export const LiveStreamModal: React.FC<LiveStreamModalProps> = ({
  mode,
  streamId: initialStreamId,
  hostUser,
  currentUser,
  backendOrigin,
  onClose,
}) => {
  // Broadcaster states
  const [activeStreamId, setActiveStreamId] = useState<string | null>(initialStreamId || null);
  const [streamTitle, setStreamTitle] = useState(hostUser?.liveTitle || 'Jonli Efir 🔥');
  const [isLiveActive, setIsLiveActive] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [mediaWarning, setMediaWarning] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoDisabled, setIsVideoDisabled] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');

  // Viewer states
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [streamData, setStreamData] = useState<any>(null);
  const [streamEnded, setStreamEnded] = useState(false);
  const [isViewerAudioMuted, setIsViewerAudioMuted] = useState(false);
  const [needsUnmutePrompt, setNeedsUnmutePrompt] = useState(false);

  // Common Chat & UI states
  const [chatMessages, setChatMessages] = useState<LiveChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [viewerCount, setViewerCount] = useState(1);
  const [hearts, setHearts] = useState<FloatingHeartItem[]>([]);
  const [durationSec, setDurationSec] = useState(0);

  // Refs
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const broadcasterSignalingRef = useRef<BroadcasterSignaling | null>(null);
  const viewerSignalingRef = useRef<ViewerSignaling | null>(null);
  const liveSocketRef = useRef<Socket | null>(null);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  const currentUserRef = useRef(currentUser);
  currentUserRef.current = currentUser;

  const effectiveHostUid =
    mode === 'broadcaster'
      ? currentUser.uid
      : hostUser?.uid || hostUser?.id || streamData?.hostUid || '';
  const effectiveHostUidRef = useRef(effectiveHostUid);
  effectiveHostUidRef.current = effectiveHostUid;

  const displayHostName =
    mode === 'broadcaster'
      ? currentUser.name || 'Siz (Host)'
      : hostUser?.name || streamData?.hostName || 'Alov Strimer';
  const displayHostAvatar =
    mode === 'broadcaster'
      ? currentUser.avatar || DEFAULT_AVATAR
      : hostUser?.avatar || streamData?.hostAvatar || DEFAULT_AVATAR;
  const displayStreamTitle =
    mode === 'broadcaster'
      ? streamTitle
      : streamData?.title || hostUser?.liveTitle || 'Jonli Efir';

  // Fetch stream metadata if viewer joins by streamId
  useEffect(() => {
    if (mode !== 'viewer' || !activeStreamId) return;
    let cancelled = false;
    fetch(getApiUrl('/api/live-streams'))
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !Array.isArray(data?.streams)) return;
        const found = data.streams.find((s: any) => s.id === activeStreamId);
        if (found) {
          setStreamData(found);
          if (typeof found.viewerCount === 'number') {
            setViewerCount(found.viewerCount);
          }
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [mode, activeStreamId]);

  // Live duration timer
  useEffect(() => {
    if (!isLiveActive && !(mode === 'viewer' && !streamEnded)) return;
    const timer = setInterval(() => {
      setDurationSec((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [isLiveActive, mode, streamEnded]);

  // Attach host local preview stream
  useEffect(() => {
    if (isLiveActive && localVideoRef.current && localStreamRef.current) {
      const videoEl = localVideoRef.current;
      videoEl.srcObject = localStreamRef.current;
      videoEl.muted = true;
      videoEl.play().catch((err) => console.warn('Local video play error:', err));
    }
  }, [isLiveActive, isVideoDisabled]);

  // Helper to attach remote video & handle browser unmuted autoplay policies cleanly
  const attachAndPlayRemoteStream = useCallback((stream: MediaStream) => {
    const videoEl = remoteVideoRef.current;
    if (!videoEl) return;
    videoEl.srcObject = stream;
    videoEl.muted = false;
    setIsViewerAudioMuted(false);
    setNeedsUnmutePrompt(false);

    videoEl.play().catch((err) => {
      console.warn('Unmuted autoplay blocked, falling back to muted autoplay:', err);
      videoEl.muted = true;
      setIsViewerAudioMuted(true);
      setNeedsUnmutePrompt(true);
      videoEl.play().catch((innerErr) => console.warn('Muted remote video play error:', innerErr));
    });
  }, []);

  useEffect(() => {
    if (remoteStream && remoteVideoRef.current) {
      attachAndPlayRemoteStream(remoteStream);
    }
  }, [remoteStream, attachAndPlayRemoteStream]);

  // Viewer unmute / mute audio toggle
  const handleToggleViewerAudio = () => {
    const videoEl = remoteVideoRef.current;
    const nextMuted = !isViewerAudioMuted;
    setIsViewerAudioMuted(nextMuted);
    if (!nextMuted) {
      setNeedsUnmutePrompt(false);
    }
    if (videoEl) {
      videoEl.muted = nextMuted;
      if (!nextMuted) {
        videoEl.play().catch(console.warn);
      }
    }
  };

  // Spawn floating heart particle
  const spawnHeartParticle = useCallback(
    (variant: 'heart' | 'flame' = 'heart', senderUid?: string) => {
      const item = createFloatingHeart(variant, senderUid);
      setHearts((prev) => appendFloatingHeart(prev, item));
      setTimeout(() => {
        setHearts((prev) => prev.filter((h) => h.id !== item.id));
      }, 1900);
    },
    []
  );

  // 1. BROADCASTER START FLOW (4-tier permission fallback, never throws unhandled console.error)
  const startBroadcast = async (allowStageFallback = false) => {
    if (isStarting) return;
    setPermissionError(null);
    setMediaWarning(null);
    setIsStarting(true);
    try {
      let stream: MediaStream | null = null;

      if (!allowStageFallback && navigator.mediaDevices?.getUserMedia) {
        try {
          // Tier 1: HD Camera + Mic
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode,
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            audio: true,
          });
          setIsMuted(false);
          setIsVideoDisabled(false);
        } catch (firstErr: any) {
          console.warn('Primary getUserMedia notice, trying basic constraints:', firstErr?.message || firstErr);
          try {
            // Tier 2: Basic Camera + Mic
            stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            setIsMuted(false);
            setIsVideoDisabled(false);
          } catch (secondErr: any) {
            console.warn('Basic video+audio unavailable, trying audio-only:', secondErr?.message || secondErr);
            try {
              // Tier 3a: Audio-only + Stage Canvas
              const audioOnly = await navigator.mediaDevices.getUserMedia({ audio: true });
              const stage = createHostStageFallbackStream(currentUserRef.current.name, streamTitle);
              const combined = new MediaStream([
                ...audioOnly.getAudioTracks(),
                ...stage.getVideoTracks(),
              ]);
              stream = combined;
              setIsMuted(false);
              setIsVideoDisabled(true);
              setMediaWarning("Kamera ruxsati yo'q — efir faqat ovoz va avatar rejimida ishlayapti.");
            } catch (thirdErr: any) {
              console.warn('Audio-only unavailable, trying video-only:', thirdErr?.message || thirdErr);
              try {
                // Tier 3b: Video-only (if mic denied)
                stream = await navigator.mediaDevices.getUserMedia({
                  video: { facingMode },
                  audio: false,
                });
                setIsMuted(true);
                setIsVideoDisabled(false);
                setMediaWarning("Mikrofon ruxsati yo'q — efir ovozsiz video rejimida ishlayapti.");
              } catch (fourthErr: any) {
                console.warn('Camera & Mic permissions unavailable:', fourthErr?.message || fourthErr);
                throw fourthErr;
              }
            }
          }
        }
      } else if (!allowStageFallback) {
        throw new Error(
          "Brauzeringiz kamera va mikrofondan foydalanishni qo'llab-quvvatlamaydi (HTTPS talab qilinadi)."
        );
      }

      if (!stream && allowStageFallback) {
        stream = createHostStageFallbackStream(currentUserRef.current.name, streamTitle);
        setIsMuted(true);
        setIsVideoDisabled(true);
        setMediaWarning("Kamera va mikrofonsiz (Avatar + Chat) rejimida efir ochildi.");
      }

      if (!stream) {
        throw new Error("Media oqimi yaratilmadi.");
      }

      localStreamRef.current = stream;
      const newStreamId = await createLiveStream(currentUserRef.current, streamTitle, backendOrigin);
      setActiveStreamId(newStreamId);
      setIsLiveActive(true);
    } catch (err: any) {
      console.warn('Camera/Mic Permission notice:', err?.name, err?.message || err);
      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        setPermissionError(
          "Kamera yoki mikrofonga ruxsat berilmadi. Brauzer manzil satridan ruxsat bering yoki kamerasiz (Avatar + Chat) rejimida boshlang."
        );
      } else if (err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError') {
        setPermissionError(
          "Qurilmada kamera yoki mikrofon topilmadi. Xohlasangiz kamerasiz (Avatar + Chat) rejimida efir boshlashingiz mumkin."
        );
      } else if (err?.name === 'NotReadableError' || err?.name === 'TrackStartError') {
        setPermissionError('Kamera boshqa ilova tomonidan band.');
      } else {
        setPermissionError(err?.message || 'Jonli efirni boshlashda xatolik yuz berdi.');
      }
    } finally {
      setIsStarting(false);
    }
  };

  // Switch front / back camera & replace track on all active WebRTC peer connections
  const handleToggleCamera = async () => {
    if (!localStreamRef.current) return;
    const newFacing: 'user' | 'environment' = facingMode === 'user' ? 'environment' : 'user';
    try {
      localStreamRef.current.getVideoTracks().forEach((t) => t.stop());
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: newFacing, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });
      // Preserve mute & video-off states across camera flip
      newStream.getAudioTracks().forEach((track) => {
        track.enabled = !isMuted;
      });
      newStream.getVideoTracks().forEach((track) => {
        track.enabled = !isVideoDisabled;
      });
      localStreamRef.current.getAudioTracks().forEach((t) => t.stop());
      localStreamRef.current = newStream;
      setFacingMode(newFacing);

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = newStream;
        localVideoRef.current.play().catch(console.warn);
      }

      if (broadcasterSignalingRef.current) {
        await broadcasterSignalingRef.current.replaceLocalStream(newStream);
      }
    } catch (e) {
      console.warn('Could not switch camera:', e);
    }
  };

  const handleToggleMute = () => {
    if (!localStreamRef.current) return;
    const nextMuted = !isMuted;
    localStreamRef.current.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });
    setIsMuted(nextMuted);
  };

  const handleToggleVideo = () => {
    if (!localStreamRef.current) return;
    const nextDisabled = !isVideoDisabled;
    localStreamRef.current.getVideoTracks().forEach((track) => {
      track.enabled = !nextDisabled;
    });
    setIsVideoDisabled(nextDisabled);
  };

  // Host ends stream: notify room (`end_stream` -> `stream_ended`), call REST API, clean up media
  const handleStopBroadcast = async () => {
    if (activeStreamId) {
      liveSocketRef.current?.emit('end_stream', {
        streamId: activeStreamId,
        hostUid: currentUserRef.current.uid,
      });
      await stopLiveStream(activeStreamId, currentUserRef.current.uid, backendOrigin);
    }
    if (broadcasterSignalingRef.current) {
      broadcasterSignalingRef.current.destroy();
      broadcasterSignalingRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    setIsLiveActive(false);
    onClose();
  };

  // Cleanup local tracks on component unmount
  useEffect(() => {
    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;
      }
      if (broadcasterSignalingRef.current) {
        broadcasterSignalingRef.current.destroy();
        broadcasterSignalingRef.current = null;
      }
      if (viewerSignalingRef.current) {
        viewerSignalingRef.current.destroy();
        viewerSignalingRef.current = null;
      }
    };
  }, []);

  // 2. UNIFIED SOCKET.IO ROOM, LIVE CHAT, VIEWER COUNTER & WEBRTC SIGNALING
  useEffect(() => {
    if (!activeStreamId) return;
    if (mode === 'broadcaster' && !isLiveActive) return;

    const userSnapshot = currentUserRef.current;
    const signalingOrigin = resolveRealtimeBackendUrl(backendOrigin || getBaseUrl());
    const socket = io(signalingOrigin, {
      reconnection: true,
      reconnectionAttempts: 15,
      reconnectionDelay: 1500,
      timeout: 15000,
      withCredentials: true,
      transports: ['websocket', 'polling'],
    });
    liveSocketRef.current = socket;

    const joinPayload = {
      streamId: activeStreamId,
      role: mode === 'broadcaster' ? 'host' : 'viewer',
      isHost: mode === 'broadcaster',
      user: {
        uid: userSnapshot.uid,
        name: userSnapshot.name || 'Mehmon',
        avatar: userSnapshot.avatar || '',
        role: mode === 'broadcaster' ? 'host' : 'viewer',
      },
    };

    const emitJoin = () => {
      socket.emit('join_stream', joinPayload);
    };
    emitJoin();
    socket.on('connect', emitJoin);

    // Chat history
    const handleHistory = (history: any[]) => {
      if (!Array.isArray(history)) return;
      const normalized = history
        .map((item) => normalizeStreamChatMessage(item, effectiveHostUidRef.current, activeStreamId))
        .filter((item): item is LiveChatMessage => Boolean(item));
      if (normalized.length > 0) {
        setChatMessages(normalized);
        setTimeout(() => {
          chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 60);
      }
    };
    socket.on('stream_chat_history', handleHistory);
    socket.on('live_stream_chat_history', handleHistory);

    // Incoming real-time message
    const handleReceiveMessage = (rawMsg: any) => {
      const normalized = normalizeStreamChatMessage(
        rawMsg,
        effectiveHostUidRef.current,
        activeStreamId
      );
      if (!normalized) return;
      setChatMessages((prev) => appendStreamChatMessage(prev, normalized));
      setTimeout(() => {
        chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 60);
    };
    socket.on('receive_stream_message', handleReceiveMessage);

    // Real-time viewer counter
    const handleViewerCount = ({ streamId, count }: { streamId?: string; count: number }) => {
      if (streamId && streamId !== activeStreamId) return;
      if (typeof count === 'number') {
        setViewerCount(count);
      }
    };
    socket.on('viewer_count_update', handleViewerCount);
    socket.on('live_stream_viewer_count', handleViewerCount);

    // Synchronized floating likes/hearts
    const handleStreamLike = ({ streamId, variant, senderUid }: any) => {
      if (streamId && streamId !== activeStreamId) return;
      // Avoid double spawning for the sender who already triggered locally
      if (senderUid && senderUid === currentUserRef.current.uid) return;
      spawnHeartParticle(variant === 'flame' ? 'flame' : 'heart', senderUid);
    };
    socket.on('receive_stream_like', handleStreamLike);

    // Host ended stream
    const handleStreamEnded = ({ streamId }: { streamId?: string }) => {
      if (!streamId || streamId === activeStreamId) {
        setStreamEnded(true);
      }
    };
    socket.on('stream_ended', handleStreamEnded);
    socket.on('stream_stopped', handleStreamEnded);

    // Ensure stream terminates gracefully if broadcaster closes tab or reloads
    const handleBeforeUnload = () => {
      if (mode === 'broadcaster' && activeStreamId) {
        try {
          const payload = JSON.stringify({
            streamId: activeStreamId,
            hostUid: currentUserRef.current.uid,
          });
          navigator.sendBeacon?.(
            `${signalingOrigin}/api/live-streams/stop`,
            new Blob([payload], { type: 'application/json' })
          );
        } catch {}
      }
    };
    if (mode === 'broadcaster') {
      window.addEventListener('beforeunload', handleBeforeUnload);
    }

    // Initialize WebRTC Peer Signaling on the same room socket
    if (mode === 'broadcaster' && localStreamRef.current) {
      const broadcaster = new BroadcasterSignaling(
        activeStreamId,
        localStreamRef.current,
        socket,
        userSnapshot.uid
      );
      broadcaster.startListening();
      broadcasterSignalingRef.current = broadcaster;
    } else if (mode === 'viewer') {
      const viewer = new ViewerSignaling(
        activeStreamId,
        userSnapshot.uid,
        { name: userSnapshot.name || 'Tomoshabin', avatar: userSnapshot.avatar },
        (stream) => {
          setRemoteStream(stream);
        },
        socket
      );
      viewer.connect().catch((err) => console.warn('Viewer WebRTC connect error:', err));
      viewerSignalingRef.current = viewer;
    }

    return () => {
      if (mode === 'broadcaster') {
        window.removeEventListener('beforeunload', handleBeforeUnload);
      }
      socket.off('connect', emitJoin);
      socket.off('stream_chat_history', handleHistory);
      socket.off('live_stream_chat_history', handleHistory);
      socket.off('receive_stream_message', handleReceiveMessage);
      socket.off('viewer_count_update', handleViewerCount);
      socket.off('live_stream_viewer_count', handleViewerCount);
      socket.off('receive_stream_like', handleStreamLike);
      socket.off('stream_ended', handleStreamEnded);
      socket.off('stream_stopped', handleStreamEnded);

      if (broadcasterSignalingRef.current) {
        broadcasterSignalingRef.current.destroy();
        broadcasterSignalingRef.current = null;
      }
      if (viewerSignalingRef.current) {
        viewerSignalingRef.current.destroy();
        viewerSignalingRef.current = null;
      }

      socket.emit('leave_stream', { streamId: activeStreamId });
      socket.disconnect();
      liveSocketRef.current = null;
    };
  }, [activeStreamId, mode, isLiveActive, currentUser.uid, spawnHeartParticle]);

  // Send live chat message (`send_stream_message`)
  const handleSendMessage = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputMessage.trim() || !activeStreamId) return;

    const text = inputMessage.trim();
    setInputMessage('');

    const msg: LiveChatMessage = {
      id: `live_msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      streamId: activeStreamId,
      senderUid: currentUserRef.current.uid,
      senderName: currentUserRef.current.name || 'Mehmon',
      senderAvatar: currentUserRef.current.avatar || '',
      text,
      isHost: mode === 'broadcaster',
      createdAt: new Date().toISOString(),
    };

    liveSocketRef.current?.emit('send_stream_message', {
      streamId: activeStreamId,
      message: msg,
    });
  };

  // Trigger floating heart/flame animation & broadcast to stream room
  const handleSendLike = (variant: 'heart' | 'flame' = 'heart') => {
    spawnHeartParticle(variant, currentUserRef.current.uid);
    if (activeStreamId) {
      liveSocketRef.current?.emit('send_stream_like', {
        streamId: activeStreamId,
        variant,
        senderUid: currentUserRef.current.uid,
      });
    }
  };

  // Shared Top Bar (Host Avatar, Name, Red LIVE Badge, Eye + Real-Time Viewer Count)
  const renderTopBar = () => (
    <div className="relative z-30 px-3.5 pt-4 pb-2 flex items-center justify-between gap-2 text-white">
      <div className="flex items-center gap-2.5 min-w-0 bg-black/45 backdrop-blur-md pl-1.5 pr-3 py-1.5 rounded-full border border-white/10">
        <div className="relative shrink-0">
          <img
            src={displayHostAvatar}
            alt={displayHostName}
            className="w-8 h-8 rounded-full object-cover border border-rose-500"
          />
          <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-rose-500 border border-black animate-pulse" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-xs truncate max-w-[110px] sm:max-w-[140px]">
              {displayHostName}
            </span>
            <span className="inline-flex items-center gap-1 bg-rose-600 text-white px-1.5 py-0.5 rounded-md text-[9px] font-black tracking-wider uppercase shrink-0 shadow-sm shadow-rose-600/50">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
              LIVE
            </span>
          </div>
          <div className="text-[10px] text-zinc-300 truncate max-w-[155px]">
            {displayStreamTitle} · {formatStreamDuration(durationSec)}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <div
          data-testid="live-viewer-count"
          className="flex items-center gap-1.5 bg-black/50 backdrop-blur-md px-2.5 py-1.5 rounded-full text-xs border border-white/10"
          title="Faol tomoshabinlar"
        >
          <Eye className="w-3.5 h-3.5 text-rose-400" />
          <span className="font-bold tabular-nums">{viewerCount}</span>
        </div>

        {mode === 'broadcaster' ? (
          <button
            type="button"
            onClick={handleStopBroadcast}
            data-testid="end-stream-btn"
            className="px-3 py-1.5 rounded-full bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-lg shadow-rose-950/50 transition active:scale-95 cursor-pointer"
          >
            Tugatish
          </button>
        ) : (
          <button
            type="button"
            onClick={onClose}
            aria-label="Efirdan chiqish"
            className="p-2 rounded-full bg-black/50 backdrop-blur-md hover:bg-white/15 border border-white/10 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );

  // Shared Synchronized Bottom-Left Live Chat Overlay + Input Bar
  const renderChatOverlay = () => (
    <div className="relative z-30 px-3.5 pb-4 pt-2 flex flex-col gap-2">
      {/* Transparent scrollable chat feed pinned bottom-left, leaving right rail clear for like buttons */}
      <div
        data-testid="live-chat-feed"
        className="w-[calc(100%-64px)] max-w-[330px] max-h-52 overflow-y-auto space-y-1.5 pr-1 scrollbar-none"
      >
        {chatMessages.length === 0 ? (
          <div className="text-white/75 text-[11px] bg-black/35 backdrop-blur-sm px-3 py-1.5 rounded-2xl inline-block border border-white/10">
            {mode === 'broadcaster'
              ? "Jonli efir boshlandi! Tomoshabinlar xabarlari shu yerda ko'rinadi."
              : 'Efirga xush kelibsiz! Fikr yoki salomingizni yozing.'}
          </div>
        ) : (
          chatMessages.map((msg, idx) => (
            <div
              key={msg.id ? `${msg.id}_${idx}` : `live_msg_${idx}`}
              className="flex items-start gap-2 bg-black/45 backdrop-blur-md px-2.5 py-1.5 rounded-2xl border border-white/[0.07] text-xs text-white animate-fadeIn"
            >
              <img
                src={msg.senderAvatar || DEFAULT_AVATAR}
                alt={msg.senderName}
                className="w-5 h-5 rounded-full object-cover shrink-0 mt-0.5 border border-white/25"
              />
              <div className="min-w-0 leading-snug break-words">
                <span className="inline-flex items-center gap-1 mr-1.5 align-middle">
                  <span
                    className={`font-bold ${
                      msg.isHost ? 'text-amber-300' : 'text-rose-200'
                    }`}
                  >
                    {msg.senderName}
                  </span>
                  {msg.isHost && (
                    <span
                      data-testid="host-chat-badge"
                      className="inline-flex items-center gap-0.5 px-1.5 py-[1px] rounded bg-gradient-to-r from-rose-600 to-amber-500 text-[9px] font-black uppercase tracking-wider text-white shadow-sm"
                    >
                      <Crown className="w-2.5 h-2.5" />
                      HOST
                    </span>
                  )}
                </span>
                <span className="text-zinc-100">{msg.text}</span>
              </div>
            </div>
          ))
        )}
        <div ref={chatBottomRef} />
      </div>

      {/* Bottom Chat Input Bar + Floating Like Trigger */}
      <form onSubmit={handleSendMessage} className="flex items-center gap-2 pt-0.5">
        <input
          type="text"
          data-testid="live-chat-input"
          placeholder={
            mode === 'broadcaster'
              ? 'Tomoshabinlarga javob yozing...'
              : 'Jonli chatga yozing...'
          }
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          className="flex-1 min-w-0 px-4 py-2.5 rounded-full bg-black/55 backdrop-blur-md text-white placeholder-white/50 border border-white/15 text-xs focus:outline-none focus:border-rose-500 transition"
        />
        <button
          type="submit"
          data-testid="live-chat-send"
          className="bg-rose-600 hover:bg-rose-500 text-white p-2.5 rounded-full shadow-lg shadow-rose-950/40 transition active:scale-95 shrink-0 cursor-pointer"
          aria-label="Xabar yuborish"
        >
          <Send className="w-4 h-4" />
        </button>
        {mode === 'broadcaster' && (
          <button
            type="button"
            data-testid="live-like-btn"
            onClick={() => handleSendLike('heart')}
            className="p-2.5 rounded-full bg-black/55 border border-white/15 text-rose-500 hover:bg-rose-500 hover:text-white transition shadow-lg active:scale-125 shrink-0 cursor-pointer"
            aria-label="Yoqtirish"
          >
            <Heart className="w-4 h-4 fill-current" />
          </button>
        )}
      </form>
    </div>
  );

  return (
    <div
      data-testid="live-stream-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-md p-0 md:p-4 animate-in fade-in duration-200"
    >
      <div className="relative w-full h-[100dvh] md:h-[min(860px,92vh)] max-w-[430px] bg-[#09090D] md:rounded-3xl overflow-hidden shadow-2xl flex flex-col justify-between border border-white/10">
        {/* Synchronized Floating Heart / Flame Animations */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-40">
          {hearts.map((h) => (
            <div
              key={h.id}
              className="absolute bottom-20 animate-float-heart"
              style={{ left: `${h.left}%` }}
            >
              {h.variant === 'flame' ? (
                <Flame
                  style={{ width: h.size, height: h.size }}
                  className="text-orange-500 fill-orange-500 drop-shadow-lg"
                />
              ) : (
                <Heart
                  style={{ width: h.size, height: h.size }}
                  className="text-rose-500 fill-rose-500 drop-shadow-lg"
                />
              )}
            </div>
          ))}
        </div>

        {/* --- BROADCASTER (HOST) FLOW --- */}
        {mode === 'broadcaster' ? (
          !isLiveActive ? (
            <div className="flex-1 flex flex-col justify-between p-6 text-white text-center bg-gradient-to-b from-[#13141C] to-[#09090D]">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Radio className="w-5 h-5 text-rose-500 animate-pulse" />
                  <span className="font-bold text-xs tracking-wider uppercase">
                    Jonli Efirga Tayyorlanish
                  </span>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="my-auto space-y-6">
                <div className="relative mx-auto w-24 h-24 rounded-full border-4 border-rose-500/80 p-1 flex items-center justify-center shadow-lg shadow-rose-500/30">
                  <img
                    src={currentUser.avatar || DEFAULT_AVATAR}
                    alt={currentUser.name}
                    className="w-full h-full rounded-full object-cover"
                  />
                  <div className="absolute -bottom-2 bg-rose-600 text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full tracking-wider">
                    Host
                  </div>
                </div>

                <div>
                  <h2 className="text-xl font-bold font-editorial">{currentUser.name}</h2>
                  <p className="text-xs text-zinc-400 mt-1">
                    Efir boshlanganda barcha tomoshabinlar sizni jonli ko‘radi va chat orqali yozadi
                  </p>
                </div>

                {permissionError && (
                  <div className="p-3 bg-rose-500/15 border border-rose-500/40 rounded-2xl flex items-start gap-2.5 text-left text-xs text-rose-200">
                    <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold">Ruxsat yoki qurilma xatosi</p>
                      <p className="mt-0.5 text-[11px] leading-relaxed">{permissionError}</p>
                    </div>
                  </div>
                )}

                <div className="text-left space-y-2">
                  <label className="text-xs font-bold text-zinc-300">Efir sarlavhasi:</label>
                  <input
                    type="text"
                    value={streamTitle}
                    onChange={(e) => setStreamTitle(e.target.value)}
                    placeholder="Efir mavzusi yoki salomlashish..."
                    className="w-full px-4 py-3 rounded-2xl bg-white/10 text-white placeholder-white/40 border border-white/15 text-sm focus:outline-none focus:border-rose-500"
                  />
                </div>
              </div>

              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={() => startBroadcast(false)}
                  disabled={isStarting}
                  data-testid="start-broadcast-btn"
                  className="w-full py-4 rounded-2xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 disabled:opacity-60 text-white font-bold text-sm shadow-xl shadow-rose-900/40 flex items-center justify-center gap-2 transition active:scale-95 cursor-pointer"
                >
                  <Radio className="w-5 h-5" />
                  <span>
                    {isStarting
                      ? 'Ulanmoqda...'
                      : permissionError
                        ? 'Kameraga qayta ruxsat so‘rash'
                        : 'Jonli Efirni Boshlash'}
                  </span>
                </button>

                {permissionError && (
                  <button
                    type="button"
                    onClick={() => startBroadcast(true)}
                    disabled={isStarting}
                    data-testid="start-fallback-broadcast-btn"
                    className="w-full py-3 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/15 text-white font-semibold text-xs flex items-center justify-center gap-2 transition active:scale-95 cursor-pointer"
                  >
                    <VideoOff className="w-4 h-4 text-rose-400" />
                    <span>Kamerasiz jonli efir boshlash (Avatar + Chat)</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="relative flex-1 flex flex-col justify-between overflow-hidden">
              {/* Full-Screen Local Camera Preview */}
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className={`absolute inset-0 w-full h-full object-cover ${
                  facingMode === 'user' ? '-scale-x-100' : ''
                } ${isVideoDisabled ? 'hidden' : ''}`}
              />

              {isVideoDisabled && (
                <div className="absolute inset-0 bg-gradient-to-b from-[#1f0d18] via-[#11121a] to-[#09090d] flex flex-col items-center justify-center text-white gap-3 px-6 text-center">
                  <div className="w-24 h-24 rounded-full p-1 border-2 border-rose-500/80 shadow-2xl shadow-rose-950/50">
                    <img
                      src={currentUser.avatar || DEFAULT_AVATAR}
                      alt={currentUser.name}
                      className="w-full h-full rounded-full object-cover"
                    />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">{currentUser.name}</p>
                    <p className="text-xs text-zinc-400 mt-1">
                      {mediaWarning || "Kamera vaqtincha o'chirilgan"}
                    </p>
                  </div>
                </div>
              )}

              {mediaWarning && !isVideoDisabled && (
                <div className="relative z-30 mx-auto mt-1 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-200 text-[10px] font-medium backdrop-blur-md">
                  {mediaWarning}
                </div>
              )}

              <div className="absolute inset-0 bg-gradient-to-b from-black/75 via-transparent to-black/90 pointer-events-none" />

              {renderTopBar()}

              {/* Right Side Host Media Controls */}
              <div className="absolute right-3.5 top-24 z-30 flex flex-col gap-2.5">
                <button
                  type="button"
                  onClick={handleToggleCamera}
                  title="Kamerani almashtirish (old/orqa)"
                  className="p-3 rounded-full bg-black/50 backdrop-blur-md border border-white/10 text-white hover:bg-black/75 transition shadow-lg active:scale-95 cursor-pointer"
                >
                  <RotateCcw className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={handleToggleMute}
                  title={isMuted ? 'Mikrofonni yoqish' : "Mikrofonni o'chirish"}
                  className={`p-3 rounded-full backdrop-blur-md border transition shadow-lg active:scale-95 cursor-pointer ${
                    isMuted
                      ? 'bg-rose-600 border-rose-400 text-white'
                      : 'bg-black/50 border-white/10 text-white hover:bg-black/75'
                  }`}
                >
                  {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </button>
                <button
                  type="button"
                  onClick={handleToggleVideo}
                  title={isVideoDisabled ? 'Kamerani yoqish' : "Kamerani o'chirish"}
                  className={`p-3 rounded-full backdrop-blur-md border transition shadow-lg active:scale-95 cursor-pointer ${
                    isVideoDisabled
                      ? 'bg-rose-600 border-rose-400 text-white'
                      : 'bg-black/50 border-white/10 text-white hover:bg-black/75'
                  }`}
                >
                  {isVideoDisabled ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
                </button>
              </div>

              {renderChatOverlay()}
            </div>
          )
        ) : (
          /* --- VIEWER FLOW --- */
          <div className="relative flex-1 flex flex-col justify-between overflow-hidden">
            {streamEnded ? (
              <div
                data-testid="stream-ended-banner"
                className="flex-1 flex flex-col items-center justify-center p-6 text-white text-center gap-4 bg-gradient-to-b from-[#13141C] to-[#09090D]"
              >
                <div className="w-16 h-16 rounded-full bg-rose-500/15 border border-rose-500/30 flex items-center justify-center">
                  <Radio className="w-8 h-8 text-rose-400" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-lg font-bold font-editorial">Jonli efir yakunlandi</h3>
                  <p className="text-xs text-zinc-400 max-w-xs">
                    {displayHostName} efirni yakunladi yoki translyatsiya to‘xtatildi.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-6 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-full font-bold text-xs shadow-lg transition active:scale-95 cursor-pointer"
                >
                  Yopish
                </button>
              </div>
            ) : (
              <>
                {/* Full-Screen Vertical Remote Video Player */}
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  muted={isViewerAudioMuted}
                  className="absolute inset-0 w-full h-full object-cover bg-black"
                />

                {!remoteStream && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#09090D]/90 text-white gap-3 z-20 pointer-events-none">
                    <div className="w-12 h-12 rounded-full border-4 border-rose-500 border-t-transparent animate-spin" />
                    <p className="text-xs font-semibold text-zinc-300">
                      Jonli efir videosiga ulanmoqda...
                    </p>
                  </div>
                )}

                <div className="absolute inset-0 bg-gradient-to-b from-black/75 via-transparent to-black/90 pointer-events-none" />

                {renderTopBar()}

                {/* Autoplay Unmute Prompt Pill if browser blocked unmuted autoplay */}
                {needsUnmutePrompt && (
                  <div className="relative z-30 mx-auto mt-1">
                    <button
                      type="button"
                      onClick={handleToggleViewerAudio}
                      className="flex items-center gap-2 px-4 py-2 rounded-full bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-xl shadow-rose-950/60 animate-bounce cursor-pointer"
                    >
                      <VolumeX className="w-4 h-4" />
                      <span>Ovozni yoqish (Unmute)</span>
                    </button>
                  </div>
                )}

                {/* Right Side Audio + Reactions Rail */}
                <div className="absolute right-3.5 bottom-24 z-30 flex flex-col items-center gap-3">
                  <button
                    type="button"
                    onClick={handleToggleViewerAudio}
                    title={isViewerAudioMuted ? 'Ovozni yoqish' : "Ovozni o'chirish"}
                    className={`p-3 rounded-full backdrop-blur-md border transition shadow-xl active:scale-95 cursor-pointer ${
                      isViewerAudioMuted
                        ? 'bg-rose-600/90 border-rose-400 text-white'
                        : 'bg-black/45 border-white/15 text-white hover:bg-black/70'
                    }`}
                  >
                    {isViewerAudioMuted ? (
                      <VolumeX className="w-5 h-5" />
                    ) : (
                      <Volume2 className="w-5 h-5" />
                    )}
                  </button>
                  <button
                    type="button"
                    data-testid="live-like-btn"
                    onClick={() => handleSendLike('heart')}
                    className="p-3 rounded-full bg-black/45 backdrop-blur-md border border-white/15 hover:bg-rose-500/80 text-rose-500 hover:text-white transition shadow-xl active:scale-125 cursor-pointer"
                    aria-label="Yurakcha yuborish"
                  >
                    <Heart className="w-5 h-5 fill-current" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSendLike('flame')}
                    className="p-3 rounded-full bg-black/45 backdrop-blur-md border border-white/15 hover:bg-orange-500/80 text-orange-400 hover:text-white transition shadow-xl active:scale-125 cursor-pointer"
                    aria-label="Olov yuborish"
                  >
                    <Flame className="w-5 h-5 fill-current" />
                  </button>
                </div>

                {renderChatOverlay()}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
