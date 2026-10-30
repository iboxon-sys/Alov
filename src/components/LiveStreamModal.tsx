import React, { useState, useEffect, useRef } from 'react';
import { 
  X, Video, VideoOff, Mic, MicOff, Send, Heart, Flame, Users, Radio, 
  RotateCcw, Sparkles, MessageCircle, AlertCircle, CheckCircle2, ShieldAlert
} from 'lucide-react';
import { getBaseUrl } from '../config/api';
import { io, Socket } from 'socket.io-client';
import { 
  createLiveStream, 
  stopLiveStream, 
  BroadcasterSignaling, 
  ViewerSignaling,
  LiveChatMessage
} from '../services/webrtc';

interface LiveStreamModalProps {
  mode: 'broadcaster' | 'viewer';
  streamId?: string;
  hostUser?: {
    uid: string;
    id?: string;
    name: string;
    avatar?: string;
  };
  currentUser: {
    uid: string;
    id?: string;
    name: string;
    avatar?: string;
  };
  onClose: () => void;
}

export const LiveStreamModal: React.FC<LiveStreamModalProps> = ({
  mode,
  streamId: initialStreamId,
  hostUser,
  currentUser,
  onClose
}) => {
  // Broadcaster states
  const [activeStreamId, setActiveStreamId] = useState<string | null>(initialStreamId || null);
  const [streamTitle, setStreamTitle] = useState("Jonli Efir 🔥");
  const [isLiveActive, setIsLiveActive] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoDisabled, setIsVideoDisabled] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');

  // Viewer states
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [streamData, setStreamData] = useState<any>(null);
  const [streamEnded, setStreamEnded] = useState(false);

  // Common Chat & UI states
  const [chatMessages, setChatMessages] = useState<LiveChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [viewerCount, setViewerCount] = useState(1);
  const [hearts, setHearts] = useState<{ id: number; left: number }[]>([]);
  const [durationSec, setDurationSec] = useState(0);

  // Media Refs
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const broadcasterSignalingRef = useRef<BroadcasterSignaling | null>(null);
  const viewerSignalingRef = useRef<ViewerSignaling | null>(null);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  // Timer for live duration
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isLiveActive || (mode === 'viewer' && !streamEnded)) {
      timer = setInterval(() => {
        setDurationSec(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isLiveActive, mode, streamEnded]);

  // Format seconds to mm:ss
  const formatTime = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Effect to attach camera stream to video element when live becomes active
  useEffect(() => {
    if (isLiveActive && localVideoRef.current && localStreamRef.current) {
      const videoEl = localVideoRef.current;
      videoEl.srcObject = localStreamRef.current;
      videoEl.muted = true; // prevent audio feedback loop locally
      videoEl.play().catch(err => console.warn("Local video play error:", err));
    }
  }, [isLiveActive, isVideoDisabled]);

  // 1. BROADCASTER INITIALIZATION FLOW
  const startBroadcast = async () => {
    setPermissionError(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Brauzeringiz kamera va mikrofondan foydalanishni (getUserMedia) qo'llab-quvvatlamaydi. HTTPS yoki xavfsiz ulanishni tekshiring.");
      }

      let stream: MediaStream;
      try {
        // Try high quality camera + mic
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true
        });
      } catch (firstErr: any) {
        console.warn("Primary getUserMedia failed, trying basic constraints:", firstErr);
        try {
          // Fallback to basic video + audio
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        } catch (secondErr: any) {
          console.warn("Basic video+audio failed, trying audio-only fallback:", secondErr);
          // Fallback to audio-only stream
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        }
      }

      localStreamRef.current = stream;

      // Create Live Stream record
      const newStreamId = await createLiveStream(currentUser, streamTitle);
      setActiveStreamId(newStreamId);
      setIsLiveActive(true);

      // Initialize WebRTC signaling for viewers
      const broadcaster = new BroadcasterSignaling(newStreamId, stream);
      broadcaster.startListening();
      broadcasterSignalingRef.current = broadcaster;

    } catch (err: any) {
      console.error("Camera/Mic Permission Error:", err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setPermissionError("Kamera yoki mikrofonga ruxsat berilmadi. Iltimos, brauzer/telefon sozlamalaridan ruxsat bering!");
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setPermissionError("Qurilmadagi kamera yoki mikrofon topilmadi.");
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        setPermissionError("Kameradan foydalanib bo'lmadi. Kamera boshqa dastur tomonidan band bo'lishi mumkin.");
      } else {
        setPermissionError(err.message || "Jonli efirni boshlashda kutilmagan xatolik yuz berdi.");
      }
    }
  };

  // Switch Camera
  const handleToggleCamera = async () => {
    if (!localStreamRef.current) return;
    const newFacing = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(newFacing);
    try {
      localStreamRef.current.getVideoTracks().forEach(t => t.stop());
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: newFacing },
        audio: true
      });
      localStreamRef.current = newStream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = newStream;
        localVideoRef.current.play().catch(console.warn);
      }
    } catch (e) {
      console.warn("Could not switch camera:", e);
    }
  };

  // Toggle Mute Audio
  const handleToggleMute = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = isMuted;
      });
      setIsMuted(!isMuted);
    }
  };

  // Toggle Video On/Off
  const handleToggleVideo = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach(track => {
        track.enabled = isVideoDisabled;
      });
      setIsVideoDisabled(!isVideoDisabled);
    }
  };

  // Broadcaster Stop Stream
  const handleStopBroadcast = async () => {
    if (activeStreamId) {
      await stopLiveStream(activeStreamId, currentUser.uid);
    }
    if (broadcasterSignalingRef.current) {
      broadcasterSignalingRef.current.destroy();
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    setIsLiveActive(false);
    onClose();
  };

  // 2. VIEWER INITIALIZATION FLOW (100% Socket.io, No Firestore)
  useEffect(() => {
    if (mode === 'viewer' && activeStreamId) {
      // Initialize WebRTC connection to receive Host's live video via Socket.io
      const viewer = new ViewerSignaling(
        activeStreamId,
        currentUser.uid,
        { name: currentUser.name, avatar: currentUser.avatar },
        (stream) => {
          setRemoteStream(stream);
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = stream;
            remoteVideoRef.current.play().catch(console.warn);
          }
        }
      );
      viewer.connect();
      viewerSignalingRef.current = viewer;

      return () => {
        viewer.destroy();
      };
    }
  }, [mode, activeStreamId, currentUser]);

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop());
      }
      if (broadcasterSignalingRef.current) {
        broadcasterSignalingRef.current.destroy();
      }
      if (viewerSignalingRef.current) {
        viewerSignalingRef.current.destroy();
      }
    };
  }, []);

  const liveSocketRef = useRef<Socket | null>(null);

  // 3. SHARED LIVE CHAT & REAL-TIME VIEWER COUNTER LISTENER (Socket.io)
  useEffect(() => {
    if (!activeStreamId) return;

    const socket = io(getBaseUrl());
    liveSocketRef.current = socket;

    socket.emit('join_live_stream', { streamId: activeStreamId, user: currentUser });

    socket.on('live_stream_chat_history', (history: LiveChatMessage[]) => {
      if (Array.isArray(history) && history.length > 0) {
        setChatMessages(history);
        setTimeout(() => {
          chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      }
    });

    socket.on('receive_live_chat_message', (msg: LiveChatMessage) => {
      setChatMessages(prev => {
        if (prev.some(m => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      setTimeout(() => {
        chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    });

    socket.on('live_stream_viewer_count', ({ count }: { count: number }) => {
      if (typeof count === 'number') {
        setViewerCount(count);
      }
    });

    socket.on('stream_stopped', ({ streamId }: { streamId: string }) => {
      if (streamId === activeStreamId) {
        setStreamEnded(true);
      }
    });

    return () => {
      socket.emit('leave_live_stream', { streamId: activeStreamId });
      socket.disconnect();
    };
  }, [activeStreamId, currentUser]);

  // Send message to shared live chat via Socket.io
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputMessage.trim() || !activeStreamId) return;

    const text = inputMessage.trim();
    setInputMessage('');

    const msg: LiveChatMessage = {
      id: 'live_msg_' + Date.now() + Math.random().toString(36).substring(2, 5),
      senderUid: currentUser.uid,
      senderName: currentUser.name || 'Mehmon',
      senderAvatar: currentUser.avatar || '',
      text,
      createdAt: new Date().toISOString()
    };

    liveSocketRef.current?.emit('send_live_chat_message', {
      streamId: activeStreamId,
      message: msg
    });
  };

  // Send Floating Heart Particle
  const handleSendHeart = () => {
    const id = Date.now();
    const left = Math.floor(Math.random() * 60) + 20; // 20% to 80%
    setHearts(prev => [...prev.slice(-15), { id, left }]);
    setTimeout(() => {
      setHearts(prev => prev.filter(h => h.id !== id));
    }, 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-0 md:p-4 animate-in fade-in duration-200">
      <div className="relative w-full h-full max-w-md bg-slate-950 md:rounded-3xl overflow-hidden shadow-2xl flex flex-col justify-between border border-white/10">
        
        {/* Floating Heart Animations */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-40">
          {hearts.map(h => (
            <div 
              key={h.id}
              className="absolute bottom-20 transition-all duration-1000 animate-float-heart"
              style={{ left: `${h.left}%` }}
            >
              <Heart className="w-8 h-8 text-rose-500 fill-rose-500 drop-shadow-lg" />
            </div>
          ))}
        </div>

        {/* --- BROADCASTER VIEW --- */}
        {mode === 'broadcaster' ? (
          <>
            {!isLiveActive ? (
              // Setup Screen before starting
              <div className="flex-1 flex flex-col justify-between p-6 text-white text-center">
                <div className="flex justify-between items-center">
                  <div className="flex items-center space-x-2">
                    <Radio className="w-5 h-5 text-red-500 animate-pulse" />
                    <span className="font-bold text-sm tracking-wide">JONLI EFIRGA TAYYORLANISH</span>
                  </div>
                  <button onClick={onClose} className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="my-auto space-y-6">
                  <div className="relative mx-auto w-24 h-24 rounded-full border-4 border-red-500/80 p-1 flex items-center justify-center shadow-lg shadow-red-500/30">
                    <img 
                      src={currentUser.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=600'} 
                      alt={currentUser.name} 
                      className="w-full h-full rounded-full object-cover" 
                    />
                    <div className="absolute -bottom-2 bg-red-600 text-[10px] font-black uppercase px-2 py-0.5 rounded-full tracking-wider">
                      Strimer
                    </div>
                  </div>

                  <div>
                    <h2 className="text-xl font-bold font-editorial">{currentUser.name}</h2>
                    <p className="text-xs text-slate-400 mt-1">Xaritada barcha foydalanuvchilar sizning jonli efiringizni ko'radi</p>
                  </div>

                  {permissionError && (
                    <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-2xl flex items-start space-x-2.5 text-left text-xs text-red-200">
                      <ShieldAlert className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold">Ruxsat berilmadi</p>
                        <p className="mt-0.5 text-[11px] leading-relaxed">{permissionError}</p>
                      </div>
                    </div>
                  )}

                  <div className="text-left space-y-2">
                    <label className="text-xs font-bold text-slate-300">Efir sarlavhasi:</label>
                    <input 
                      type="text" 
                      value={streamTitle}
                      onChange={(e) => setStreamTitle(e.target.value)}
                      placeholder="Efir mavzusi yoki salomlashish..."
                      className="w-full px-4 py-3 rounded-2xl bg-white/10 text-white placeholder-white/40 border border-white/15 text-sm focus:outline-none focus:border-red-500"
                    />
                  </div>
                </div>

                <button 
                  onClick={startBroadcast}
                  className="w-full py-4 rounded-2xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-bold text-sm shadow-xl shadow-red-600/40 flex items-center justify-center space-x-2 transition transform active:scale-95"
                >
                  <Radio className="w-5 h-5" />
                  <span>Jonli Efirni Boshlash</span>
                </button>
              </div>
            ) : (
              // Live Broadcaster Screen
              <div className="relative flex-1 flex flex-col justify-between overflow-hidden">
                {/* Local Camera Video */}
                <video 
                  ref={localVideoRef} 
                  autoPlay 
                  playsInline 
                  muted 
                  className={`absolute inset-0 w-full h-full object-cover ${isVideoDisabled ? 'hidden' : ''}`}
                />
                
                {isVideoDisabled && (
                  <div className="absolute inset-0 bg-slate-900 flex flex-col items-center justify-center text-white space-y-3">
                    <VideoOff className="w-16 h-16 text-slate-500" />
                    <p className="text-sm font-medium text-slate-400">Kamera vaqtincha o'chirilgan</p>
                  </div>
                )}

                {/* Gradient Overlays */}
                <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-transparent to-black/90 pointer-events-none" />

                {/* Top Controls Header */}
                <div className="relative z-30 p-4 pt-6 flex items-center justify-between text-white">
                  <div className="flex items-center space-x-2">
                    <span className="flex items-center space-x-1.5 bg-red-600 px-3 py-1 rounded-full text-xs font-black tracking-wider shadow-lg shadow-red-600/40 animate-pulse">
                      <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                      <span>LIVE</span>
                    </span>
                    <span className="bg-black/50 backdrop-blur-md px-3 py-1 rounded-full text-xs font-semibold">
                      {formatTime(durationSec)}
                    </span>
                  </div>

                  <div className="flex items-center space-x-2">
                    <div className="flex items-center space-x-1 bg-black/50 backdrop-blur-md px-2.5 py-1 rounded-full text-xs">
                      <Users className="w-3.5 h-3.5 text-slate-300" />
                      <span className="font-bold">{viewerCount}</span>
                    </div>

                    <button 
                      onClick={handleStopBroadcast}
                      className="px-3 py-1.5 rounded-full bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-md transition"
                    >
                      Efirni tugatish
                    </button>
                  </div>
                </div>

                {/* Right Quick Actions (Camera toggle, Mute) */}
                <div className="absolute right-4 top-24 z-30 flex flex-col space-y-3">
                  <button 
                    onClick={handleToggleCamera} 
                    title="Kamerani aylantirish"
                    className="p-3 rounded-full bg-black/40 backdrop-blur-md text-white hover:bg-black/60 transition shadow-lg"
                  >
                    <RotateCcw className="w-5 h-5" />
                  </button>
                  <button 
                    onClick={handleToggleMute} 
                    title={isMuted ? "Ovozni yoqish" : "Ovozni o'chirish"}
                    className={`p-3 rounded-full backdrop-blur-md transition shadow-lg ${isMuted ? 'bg-red-600 text-white' : 'bg-black/40 text-white hover:bg-black/60'}`}
                  >
                    {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                  </button>
                  <button 
                    onClick={handleToggleVideo} 
                    title={isVideoDisabled ? "Videoni yoqish" : "Videoni o'chirish"}
                    className={`p-3 rounded-full backdrop-blur-md transition shadow-lg ${isVideoDisabled ? 'bg-red-600 text-white' : 'bg-black/40 text-white hover:bg-black/60'}`}
                  >
                    {isVideoDisabled ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
                  </button>
                </div>

                {/* Bottom Shared Chat Section */}
                <div className="relative z-30 p-4 space-y-2">
                  {/* Chat Messages Scrolling Container */}
                  <div className="max-h-48 overflow-y-auto space-y-1.5 pr-2 pb-1 scrollbar-none">
                    {chatMessages.length === 0 ? (
                      <div className="text-white/60 text-xs italic bg-black/30 backdrop-blur-sm p-2 rounded-xl inline-block">
                        Jonli efir boshlandi! Foydalanuvchilar yozgan xabarlar bu yerda ko'rinadi.
                      </div>
                    ) : (
                      chatMessages.map(msg => (
                        <div key={msg.id} className="flex items-start space-x-2 bg-black/40 backdrop-blur-sm px-3 py-1.5 rounded-2xl max-w-[85%] text-xs text-white">
                          <img 
                            src={msg.senderAvatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=600'} 
                            alt="" 
                            className="w-5 h-5 rounded-full object-cover shrink-0 mt-0.5 border border-white/20"
                          />
                          <div>
                            <span className="font-bold text-rose-300 mr-1.5">{msg.senderName}:</span>
                            <span className="text-slate-100">{msg.text}</span>
                          </div>
                        </div>
                      ))
                    )}
                    <div ref={chatBottomRef} />
                  </div>

                  {/* Chat Input */}
                  <form onSubmit={handleSendMessage} className="flex items-center space-x-2 pt-1">
                    <input 
                      type="text" 
                      placeholder="Tomoshabinlarga javob yozing..." 
                      value={inputMessage}
                      onChange={(e) => setInputMessage(e.target.value)}
                      className="flex-1 px-4 py-2.5 rounded-full bg-black/60 backdrop-blur-md text-white placeholder-white/50 border border-white/20 text-xs focus:outline-none focus:border-red-500"
                    />
                    <button 
                      type="submit"
                      className="bg-red-600 hover:bg-red-500 text-white p-2.5 rounded-full shadow-lg transition active:scale-95"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                    <button 
                      type="button"
                      onClick={handleSendHeart}
                      className="p-2.5 rounded-full bg-black/50 text-rose-500 hover:bg-rose-500 hover:text-white transition shadow-lg active:scale-95"
                    >
                      <Heart className="w-4 h-4 fill-current" />
                    </button>
                  </form>
                </div>
              </div>
            )}
          </>
        ) : (
          // --- VIEWER VIEW ---
          <div className="relative flex-1 flex flex-col justify-between overflow-hidden">
            {streamEnded ? (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-white text-center space-y-4">
                <Radio className="w-16 h-16 text-slate-500 animate-pulse" />
                <h3 className="text-lg font-bold">Jonli efir yakunlandi</h3>
                <p className="text-xs text-slate-400">Strimer efirni to'xtatdi yoki ulanish uzildi.</p>
                <button 
                  onClick={onClose}
                  className="px-6 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-full font-bold text-xs shadow-lg transition"
                >
                  Xaritaga qaytish
                </button>
              </div>
            ) : (
              <>
                {/* Remote Video Stream from Host */}
                <video 
                  ref={remoteVideoRef} 
                  autoPlay 
                  playsInline 
                  className="absolute inset-0 w-full h-full object-cover bg-black"
                />

                {!remoteStream && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/90 text-white space-y-3 z-20">
                    <div className="w-12 h-12 rounded-full border-4 border-red-500 border-t-transparent animate-spin" />
                    <p className="text-xs font-semibold text-slate-300">Jonli efirga ulanmoqda...</p>
                  </div>
                )}

                {/* Gradient Overlays */}
                <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-transparent to-black/90 pointer-events-none" />

                {/* Top Header - Streamer info & Exit */}
                <div className="relative z-30 p-4 pt-6 flex items-center justify-between text-white">
                  <div className="flex items-center space-x-2.5 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full">
                    <img 
                      src={hostUser?.avatar || streamData?.hostAvatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=600'} 
                      alt="" 
                      className="w-8 h-8 rounded-full object-cover border border-red-500"
                    />
                    <div>
                      <div className="font-bold text-xs">{hostUser?.name || streamData?.hostName || 'Alov Strimer'}</div>
                      <div className="text-[10px] text-slate-300">{streamData?.title || 'Jonli Efir'}</div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <div className="flex items-center space-x-1 bg-black/50 backdrop-blur-md px-2.5 py-1 rounded-full text-xs">
                      <Users className="w-3.5 h-3.5 text-slate-300" />
                      <span className="font-bold">{viewerCount}</span>
                    </div>
                    <span className="flex items-center space-x-1.5 bg-red-600 px-2.5 py-1 rounded-full text-[10px] font-black tracking-wider shadow-lg animate-pulse">
                      ● LIVE
                    </span>
                    <button 
                      onClick={onClose}
                      className="p-2 rounded-full bg-black/40 backdrop-blur-md hover:bg-black/60 transition"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Right Side Like Reactions */}
                <div className="absolute right-4 bottom-24 z-30 flex flex-col items-center space-y-3">
                  <button 
                    onClick={handleSendHeart}
                    className="p-3.5 rounded-full bg-black/40 backdrop-blur-md hover:bg-rose-500/80 text-rose-500 hover:text-white transition shadow-xl transform active:scale-125"
                  >
                    <Heart className="w-6 h-6 fill-current" />
                  </button>
                  <button 
                    onClick={handleSendHeart}
                    className="p-3.5 rounded-full bg-black/40 backdrop-blur-md hover:bg-orange-500/80 text-orange-500 hover:text-white transition shadow-xl transform active:scale-125"
                  >
                    <Flame className="w-6 h-6 fill-current" />
                  </button>
                </div>

                {/* Bottom Shared Chat Section */}
                <div className="relative z-30 p-4 space-y-2">
                  <div className="max-h-48 overflow-y-auto space-y-1.5 pr-2 pb-1 scrollbar-none">
                    {chatMessages.length === 0 ? (
                      <div className="text-white/60 text-xs italic bg-black/30 backdrop-blur-sm p-2 rounded-xl inline-block">
                        Efirga xush kelibsiz! Savol yoki fikringizni yozing.
                      </div>
                    ) : (
                      chatMessages.map(msg => (
                        <div key={msg.id} className="flex items-start space-x-2 bg-black/40 backdrop-blur-sm px-3 py-1.5 rounded-2xl max-w-[85%] text-xs text-white">
                          <img 
                            src={msg.senderAvatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=600'} 
                            alt="" 
                            className="w-5 h-5 rounded-full object-cover shrink-0 mt-0.5 border border-white/20"
                          />
                          <div>
                            <span className="font-bold text-rose-300 mr-1.5">{msg.senderName}:</span>
                            <span className="text-slate-100">{msg.text}</span>
                          </div>
                        </div>
                      ))
                    )}
                    <div ref={chatBottomRef} />
                  </div>

                  <form onSubmit={handleSendMessage} className="flex items-center space-x-2 pt-1">
                    <input 
                      type="text" 
                      placeholder="Strimerga xabar yozing..." 
                      value={inputMessage}
                      onChange={(e) => setInputMessage(e.target.value)}
                      className="flex-1 px-4 py-2.5 rounded-full bg-black/60 backdrop-blur-md text-white placeholder-white/50 border border-white/20 text-xs focus:outline-none focus:border-red-500"
                    />
                    <button 
                      type="submit"
                      className="bg-red-600 hover:bg-red-500 text-white p-2.5 rounded-full shadow-lg transition active:scale-95"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </form>
                </div>
              </>
            )}
          </div>
        )}

      </div>
    </div>
  );
};
