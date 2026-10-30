import React, { useState, useEffect, useRef } from 'react';
import { 
  Mic, MicOff, PhoneOff, Radio, Users, Volume2, Sparkles, Shield, User, 
  X, Plus, Send, Heart, Flame, Image as ImageIcon, Settings, LogOut, Check
} from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import { getBaseUrl } from '../config/api';

export interface AudioSeat {
  seatIndex: number;
  user: {
    uid: string;
    name: string;
    avatar?: string;
    socketId?: string;
  } | null;
  isMuted?: boolean;
  isSpeaking?: boolean;
}

export interface RoomChatMessage {
  id: string;
  senderUid: string;
  senderName: string;
  senderAvatar?: string;
  text: string;
  isSystem?: boolean;
  time: string;
}

interface AudioRoomModalProps {
  roomCode?: string;
  roomTitle?: string;
  currentUser: {
    uid: string;
    id?: string;
    name: string;
    avatar?: string;
  };
  onClose: () => void;
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

// Curated safe ambient background presets
const PRESET_BACKGROUNDS = [
  { id: 'neon', name: 'Neon Cyber', url: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?auto=format&fit=crop&q=80&w=1200' },
  { id: 'club', name: 'VIP Club', url: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&q=80&w=1200' },
  { id: 'sunset', name: 'Romantic Sunset', url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&q=80&w=1200' },
  { id: 'lounge', name: 'Cozy Lounge', url: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&q=80&w=1200' },
  { id: 'cosmic', name: 'Cosmic Night', url: 'https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?auto=format&fit=crop&q=80&w=1200' }
];

export const AudioRoomModal: React.FC<AudioRoomModalProps> = ({
  roomCode = 'room_general',
  roomTitle = 'Alov.uz Jonli Ovozli Xona 🎙️',
  currentUser,
  onClose
}) => {
  // Room state
  const [currentTitle, setCurrentTitle] = useState(roomTitle);
  const [backgroundUrl, setBackgroundUrl] = useState<string>('');
  const [ownerUid, setOwnerUid] = useState<string>('');
  const [membersCount, setMembersCount] = useState<number>(1);
  const [seats, setSeats] = useState<AudioSeat[]>(
    Array.from({ length: 8 }, (_, i) => ({ seatIndex: i, user: null, isMuted: false, isSpeaking: false }))
  );

  // Chat state
  const [messages, setMessages] = useState<RoomChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [floatingReactions, setFloatingReactions] = useState<{ id: number; left: number; emoji: string }[]>([]);

  // User status in room
  const [mySeatIndex, setMySeatIndex] = useState<number | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakingLocally, setIsSpeakingLocally] = useState(false);
  const [showBgModal, setShowBgModal] = useState(false);
  const [moderationError, setModerationError] = useState<string | null>(null);

  // Audio / WebRTC Refs
  const socketRef = useRef<Socket | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  const isOwner = ownerUid === currentUser.uid || (!ownerUid && roomCode === `room_${currentUser.uid}`);

  // 1. Connect to Socket.io & Join Room
  useEffect(() => {
    const socket = io(getBaseUrl());
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('join_audio_room', {
        roomCode,
        user: {
          uid: currentUser.uid,
          name: currentUser.name,
          avatar: currentUser.avatar
        }
      });
    });

    // Room Initial State
    socket.on('audio_room_state', (roomData: any) => {
      if (roomData) {
        if (roomData.title) setCurrentTitle(roomData.title);
        if (roomData.ownerUid) setOwnerUid(roomData.ownerUid);
        if (roomData.backgroundUrl) setBackgroundUrl(roomData.backgroundUrl);
        if (Array.isArray(roomData.seats)) {
          setSeats(roomData.seats);
          const foundIndex = roomData.seats.findIndex((s: any) => s.user && s.user.uid === currentUser.uid);
          setMySeatIndex(foundIndex > -1 ? foundIndex : null);
        }
        if (Array.isArray(roomData.messages)) {
          setMessages(roomData.messages);
          setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        }
      }
    });

    // Seats update broadcast
    socket.on('seats_updated', ({ seats: updatedSeats }: { seats: AudioSeat[] }) => {
      if (Array.isArray(updatedSeats)) {
        setSeats(updatedSeats);
        const myIndex = updatedSeats.findIndex(s => s.user && s.user.uid === currentUser.uid);
        setMySeatIndex(myIndex > -1 ? myIndex : null);
      }
    });

    // Seat status update (speaking/mute)
    socket.on('seat_status_changed', ({ seats: updatedSeats }: { seats: AudioSeat[] }) => {
      if (Array.isArray(updatedSeats)) {
        setSeats(updatedSeats);
      }
    });

    // Chat messages
    socket.on('receive_room_chat_message', (msg: RoomChatMessage) => {
      setMessages(prev => {
        if (prev.some(m => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);
    });

    // Room Background
    socket.on('room_background_updated', ({ backgroundUrl: bg }: { backgroundUrl: string }) => {
      setBackgroundUrl(bg);
    });

    // Members count
    socket.on('room_members_count', ({ count }: { count: number }) => {
      if (typeof count === 'number') setMembersCount(count);
    });

    // WebRTC: when peer joined
    socket.on('user_joined_audio', async ({ socketId, user }: any) => {
      if (mySeatIndex !== null && localStreamRef.current) {
        // Initiator creates offer to new user
        try {
          const pc = createPeerConnection(socketId);
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit('webrtc_offer', {
            targetSocketId: socketId,
            offer,
            sender: currentUser
          });
        } catch (e) {
          console.warn("Peer offer error:", e);
        }
      }
    });

    // WebRTC: offer received
    socket.on('webrtc_offer', async ({ senderSocketId, offer }: any) => {
      try {
        const pc = createPeerConnection(senderSocketId);
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('webrtc_answer', {
          targetSocketId: senderSocketId,
          answer,
          sender: currentUser
        });
      } catch (e) {
        console.warn("Peer answer error:", e);
      }
    });

    // WebRTC: answer received
    socket.on('webrtc_answer', async ({ senderSocketId, answer }: any) => {
      const pc = peerConnectionsRef.current.get(senderSocketId);
      if (pc && !pc.currentRemoteDescription) {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
      }
    });

    // WebRTC: ice candidate
    socket.on('webrtc_ice_candidate', async ({ senderSocketId, candidate }: any) => {
      const pc = peerConnectionsRef.current.get(senderSocketId);
      if (pc && candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.warn("ICE candidate error:", e);
        }
      }
    });

    // WebRTC: user left
    socket.on('user_left_audio', ({ socketId }: { socketId: string }) => {
      const pc = peerConnectionsRef.current.get(socketId);
      if (pc) {
        pc.close();
        peerConnectionsRef.current.delete(socketId);
      }
    });

    return () => {
      socket.emit('leave_audio_room', { roomCode, user: currentUser });
      socket.disconnect();
      cleanupAudio();
    };
  }, [roomCode, currentUser]);

  // Create WebRTC Peer Connection
  const createPeerConnection = (peerSocketId: string) => {
    let pc = peerConnectionsRef.current.get(peerSocketId);
    if (pc) return pc;

    pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnectionsRef.current.set(peerSocketId, pc);

    // Add local tracks if seated
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc!.addTrack(track, localStreamRef.current!);
      });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        socketRef.current.emit('webrtc_ice_candidate', {
          targetSocketId: peerSocketId,
          candidate: event.candidate.toJSON(),
          sender: currentUser
        });
      }
    };

    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        const audio = new Audio();
        audio.srcObject = event.streams[0];
        audio.play().catch(console.warn);
      }
    };

    return pc;
  };

  // Start Local Microphone when user sits down
  const startLocalAudio = async () => {
    if (localStreamRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      localStreamRef.current = stream;

      // Add tracks to existing peer connections
      peerConnectionsRef.current.forEach(pc => {
        stream.getTracks().forEach(track => pc.addTrack(track, stream));
      });

      // Initialize Web Audio level detector for glowing avatar effect
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let speakingDebounce = false;

      const checkVolume = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const average = sum / dataArray.length;

        const isSpeaking = average > 18 && !isMuted;
        if (isSpeaking !== speakingDebounce) {
          speakingDebounce = isSpeaking;
          setIsSpeakingLocally(isSpeaking);
          if (socketRef.current && mySeatIndex !== null) {
            socketRef.current.emit('update_seat_status', {
              roomCode,
              seatIndex: mySeatIndex,
              uid: currentUser.uid,
              isSpeaking
            });
          }
        }
        animFrameRef.current = requestAnimationFrame(checkVolume);
      };
      checkVolume();

    } catch (err) {
      console.warn("Could not access microphone:", err);
    }
  };

  const cleanupAudio = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
    }
    peerConnectionsRef.current.forEach(pc => pc.close());
    peerConnectionsRef.current.clear();
  };

  // Toggle Mute
  const handleToggleMute = () => {
    const nextMute = !isMuted;
    setIsMuted(nextMute);
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(t => {
        t.enabled = !nextMute;
      });
    }
    if (socketRef.current && mySeatIndex !== null) {
      socketRef.current.emit('update_seat_status', {
        roomCode,
        seatIndex: mySeatIndex,
        uid: currentUser.uid,
        isMuted: nextMute,
        isSpeaking: false
      });
    }
  };

  // Occupy or change seat
  const handleSeatClick = async (seatIndex: number) => {
    const targetSeat = seats[seatIndex];
    if (targetSeat.user && targetSeat.user.uid === currentUser.uid) {
      // User clicked their own seat -> prompt leave seat or mute
      return;
    }

    if (targetSeat.user) {
      // Seat already occupied by someone else
      return;
    }

    // Occupy seat
    socketRef.current?.emit('take_seat', {
      roomCode,
      seatIndex,
      user: currentUser
    });
    setMySeatIndex(seatIndex);
    await startLocalAudio();
  };

  // Leave Seat (become listener only)
  const handleLeaveSeat = () => {
    if (mySeatIndex !== null) {
      socketRef.current?.emit('leave_seat', {
        roomCode,
        seatIndex: mySeatIndex,
        user: currentUser
      });
      setMySeatIndex(null);
      cleanupAudio();
    }
  };

  // Send Chat message
  const handleSendChatMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const newMsg: RoomChatMessage = {
      id: 'msg_' + Date.now() + Math.random().toString(36).slice(2, 5),
      senderUid: currentUser.uid,
      senderName: currentUser.name || 'Mehmon',
      senderAvatar: currentUser.avatar || '',
      text: inputText.trim(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    socketRef.current?.emit('send_room_chat_message', {
      roomCode,
      message: newMsg
    });
    setInputText('');
  };

  // Floating Reactions
  const handleTriggerReaction = (emoji: string) => {
    const id = Date.now();
    const left = Math.floor(Math.random() * 60) + 20;
    setFloatingReactions(prev => [...prev.slice(-12), { id, left, emoji }]);
    setTimeout(() => {
      setFloatingReactions(prev => prev.filter(r => r.id !== id));
    }, 2000);
  };

  // NSFW Image Filter (Canvas pixel-based skin detector)
  const handleBackgroundUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setModerationError(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (!dataUrl) return;

      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        // Sample on small canvas for skin tone ratio analysis
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const size = 100;
        canvas.width = size;
        canvas.height = size;
        if (!ctx) return;

        ctx.drawImage(img, 0, 0, size, size);
        const imageData = ctx.getImageData(0, 0, size, size);
        const data = imageData.data;
        let skinPixels = 0;
        const totalPixels = size * size;

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          // Standard skin color bounding heuristic (Peers & Kovac algorithm)
          const isSkin = 
            r > 95 && g > 40 && b > 20 &&
            Math.max(r, g, b) - Math.min(r, g, b) > 15 &&
            Math.abs(r - g) > 15 &&
            r > g && r > b;
          if (isSkin) skinPixels++;
        }

        const skinRatio = skinPixels / totalPixels;
        // Block only extreme nudity where concentrated skin pixels exceed 82%
        if (skinRatio > 0.82) {
          setModerationError("Bu rasm xona foni uchun mos emas (Rasm moderatsiyadan o'tmadi).");
          return;
        }

        // Passed moderation! Update background
        setBackgroundUrl(dataUrl);
        socketRef.current?.emit('update_room_background', {
          roomCode,
          backgroundUrl: dataUrl
        });
        setShowBgModal(false);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleSelectPresetBg = (url: string) => {
    setBackgroundUrl(url);
    socketRef.current?.emit('update_room_background', {
      roomCode,
      backgroundUrl: url
    });
    setShowBgModal(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-0 md:p-4 select-none animate-in fade-in duration-200">
      <div 
        className="relative w-full h-full max-w-md bg-slate-950 md:rounded-[36px] overflow-hidden shadow-2xl flex flex-col justify-between border border-white/10"
        style={{
          backgroundImage: backgroundUrl ? `url(${backgroundUrl})` : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center'
        }}
      >
        {/* Dark readability overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/85 via-slate-950/75 to-slate-950/95 pointer-events-none" />

        {/* Floating Reactions */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-40">
          {floatingReactions.map(r => (
            <div 
              key={r.id}
              className="absolute bottom-24 text-3xl animate-float-heart drop-shadow-md"
              style={{ left: `${r.left}%` }}
            >
              {r.emoji}
            </div>
          ))}
        </div>

        {/* --- Top Header --- */}
        <header className="relative z-20 p-4 pt-5 flex items-center justify-between text-white border-b border-white/10">
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-pink-500 to-rose-600 p-0.5 flex items-center justify-center shrink-0 shadow-lg shadow-pink-500/20">
              <Radio className="w-5 h-5 text-white animate-pulse" />
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-sm text-white truncate max-w-[170px]">{currentTitle}</h2>
              <div className="flex items-center space-x-2 text-[10px] text-pink-200 font-medium mt-0.5">
                <span className="flex items-center space-x-1">
                  <Users className="w-3 h-3 text-pink-400" />
                  <span>{membersCount} ishtirokchi</span>
                </span>
                <span>•</span>
                <span className="text-emerald-400 font-bold flex items-center space-x-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping inline-block" />
                  <span>ONLAYN</span>
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-1.5">
            {isOwner && (
              <button 
                onClick={() => setShowBgModal(true)}
                title="Xona fonini o'zgartirish"
                className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition active:scale-95"
              >
                <ImageIcon className="w-4 h-4" />
              </button>
            )}

            <button 
              onClick={onClose}
              className="p-2 px-3 rounded-full bg-rose-600/80 hover:bg-rose-600 text-white font-bold text-xs flex items-center space-x-1 shadow-md transition active:scale-95"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Chiqish</span>
            </button>
          </div>
        </header>

        {/* --- 8-Seat Microphone Grid (Clubhouse / Bigo Style: 2 rows of 4) --- */}
        <section className="relative z-20 px-4 py-3 flex-1 flex flex-col justify-start">
          <div className="flex items-center justify-between mb-3 px-1">
            <span className="text-[11px] font-bold tracking-wider text-pink-300 uppercase flex items-center space-x-1">
              <Sparkles className="w-3.5 h-3.5 text-pink-400" />
              <span>Mikrofon O'rinlari (8 ta Slot)</span>
            </span>
            {mySeatIndex !== null && (
              <button
                onClick={handleLeaveSeat}
                className="text-[10px] font-bold text-rose-300 hover:text-white bg-rose-950/60 border border-rose-500/30 px-2.5 py-0.5 rounded-full transition"
              >
                O'rindiqdan turish ✕
              </button>
            )}
          </div>

          {/* 2x4 Seats Grid */}
          <div className="grid grid-cols-4 gap-3 bg-black/40 backdrop-blur-xl p-3.5 rounded-[28px] border border-white/10 shadow-inner">
            {seats.slice(0, 8).map((seat) => {
              const isOccupied = !!seat.user;
              const isMe = seat.user?.uid === currentUser.uid;
              const isSpeaking = isMe ? isSpeakingLocally : seat.isSpeaking;

              return (
                <div 
                  key={seat.seatIndex} 
                  onClick={() => handleSeatClick(seat.seatIndex)}
                  className="flex flex-col items-center space-y-1.5 cursor-pointer group"
                >
                  <div className="relative">
                    {/* Glowing Aura if speaking */}
                    {isSpeaking && (
                      <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 opacity-90 blur-sm animate-pulse" />
                    )}

                    {isOccupied ? (
                      <div className={`relative w-14 h-14 rounded-full overflow-hidden border-2 transition-all ${
                        isSpeaking 
                          ? 'border-pink-400 ring-4 ring-pink-500/60 shadow-[0_0_20px_rgba(236,72,153,0.8)] scale-105' 
                          : isMe 
                            ? 'border-emerald-400 ring-2 ring-emerald-400/30' 
                            : 'border-white/40'
                      }`}>
                        <img 
                          src={seat.user?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=600'} 
                          alt={seat.user?.name || ''} 
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="w-14 h-14 rounded-full border-2 border-dashed border-white/30 bg-white/5 hover:bg-white/10 flex flex-col items-center justify-center transition-all group-hover:scale-105 group-hover:border-pink-400/80">
                        <Plus className="w-5 h-5 text-white/50 group-hover:text-pink-400 transition" />
                      </div>
                    )}

                    {/* Muted mic badge */}
                    {isOccupied && seat.isMuted && (
                      <div className="absolute bottom-0 right-0 w-4 h-4 bg-rose-600 rounded-full flex items-center justify-center shadow-md border border-white">
                        <MicOff className="w-2.5 h-2.5 text-white" />
                      </div>
                    )}

                    {/* Unmuted green indicator */}
                    {isOccupied && !seat.isMuted && (
                      <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-500 rounded-full flex items-center justify-center shadow-md border border-white">
                        <span className="w-1.5 h-1.5 rounded-full bg-white" />
                      </div>
                    )}
                  </div>

                  {/* Seat Title or User Name */}
                  <div className="text-center w-full">
                    {isOccupied ? (
                      <span className={`text-[11px] font-bold block truncate max-w-[65px] ${isMe ? 'text-emerald-300 font-extrabold' : 'text-slate-200'}`}>
                        {isMe ? 'Siz' : seat.user?.name}
                      </span>
                    ) : (
                      <span className="text-[10px] text-white/40 font-medium block">
                        No. {seat.seatIndex + 1}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Quick Guidance Alert */}
          {mySeatIndex === null ? (
            <p className="text-[11px] text-center text-pink-200/70 mt-2">
              🎙️ Gapirish uchun bo'sh o'rindiqni tanlang va mikrofoningizni yoqing!
            </p>
          ) : (
            <p className="text-[11px] text-center text-emerald-300 font-medium mt-2">
              ✓ Siz No. {mySeatIndex + 1} o'rindig'idasiz. Mikrofondan erkin foydalanishingiz mumkin.
            </p>
          )}
        </section>

        {/* --- Room Real-time Chat Section --- */}
        <section className="relative z-20 p-4 pt-0 flex flex-col justify-end">
          <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1 scrollbar-none mb-3">
            {messages.length === 0 ? (
              <div className="text-white/50 text-xs italic bg-black/40 backdrop-blur-md p-2.5 rounded-2xl inline-block">
                Xonaga xush kelibsiz! Savol va fikrlaringizni yozib qoldiring.
              </div>
            ) : (
              messages.map(msg => {
                if (msg.isSystem) {
                  return (
                    <div key={msg.id} className="flex items-center space-x-1.5 bg-gradient-to-r from-pink-950/60 to-purple-950/60 border border-pink-500/30 px-3 py-1 rounded-full text-[11px] text-pink-200 w-fit">
                      <Sparkles className="w-3 h-3 text-pink-400" />
                      <span className="font-semibold">{msg.text}</span>
                    </div>
                  );
                }
                const isMe = msg.senderUid === currentUser.uid;
                return (
                  <div key={msg.id} className="flex items-start space-x-2 bg-black/50 backdrop-blur-md px-3 py-1.5 rounded-2xl max-w-[88%] text-xs text-white border border-white/5">
                    <img 
                      src={msg.senderAvatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=600'} 
                      alt="" 
                      className="w-5 h-5 rounded-full object-cover shrink-0 mt-0.5 border border-white/20"
                    />
                    <div className="min-w-0">
                      <span className={`font-bold mr-1.5 ${isMe ? 'text-emerald-300' : 'text-pink-300'}`}>
                        {msg.senderName}:
                      </span>
                      <span className="text-slate-100 break-words">{msg.text}</span>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={chatBottomRef} />
          </div>

          {/* Chat Form & Control Buttons */}
          <div className="flex items-center space-x-2">
            {mySeatIndex !== null && (
              <button 
                type="button"
                onClick={handleToggleMute}
                className={`p-3 rounded-full shadow-lg transition active:scale-95 shrink-0 ${
                  isMuted 
                    ? 'bg-rose-600 text-white' 
                    : 'bg-emerald-600 text-white animate-pulse'
                }`}
                title={isMuted ? "Mikrofonni yoqish" : "Mikrofonni o'chirish"}
              >
                {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>
            )}

            <form onSubmit={handleSendChatMessage} className="flex-1 flex items-center space-x-2">
              <input 
                type="text" 
                placeholder="Xabar yozing..." 
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                className="flex-1 px-4 py-2.5 rounded-full bg-black/60 backdrop-blur-xl text-white placeholder-white/40 border border-white/15 text-xs focus:outline-none focus:border-pink-500"
              />
              <button 
                type="submit"
                className="p-2.5 rounded-full bg-pink-600 hover:bg-pink-500 text-white shadow-lg transition active:scale-95 shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>

            <button 
              type="button"
              onClick={() => handleTriggerReaction('💖')}
              className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-pink-400 transition active:scale-125 shrink-0"
            >
              <Heart className="w-4 h-4 fill-current" />
            </button>
            <button 
              type="button"
              onClick={() => handleTriggerReaction('🔥')}
              className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-orange-400 transition active:scale-125 shrink-0"
            >
              <Flame className="w-4 h-4 fill-current" />
            </button>
          </div>
        </section>

        {/* --- Background Customization & Moderation Modal --- */}
        {showBgModal && (
          <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-xl p-5 flex flex-col justify-between animate-in fade-in duration-200">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center space-x-2">
                <ImageIcon className="w-5 h-5 text-pink-400" />
                <h3 className="font-bold text-sm text-white">Xona Fonini Tanlash</h3>
              </div>
              <button onClick={() => setShowBgModal(false)} className="p-1 rounded-full text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 my-auto overflow-y-auto py-2">
              {moderationError && (
                <div className="p-3 rounded-2xl bg-rose-500/20 border border-rose-500/50 text-rose-200 text-xs">
                  {moderationError}
                </div>
              )}

              {/* Upload custom background */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-2">O'z rasmingizni yuklash:</label>
                <label className="flex flex-col items-center justify-center p-4 rounded-2xl border-2 border-dashed border-pink-500/40 bg-pink-500/5 hover:bg-pink-500/10 cursor-pointer transition">
                  <ImageIcon className="w-6 h-6 text-pink-400 mb-1" />
                  <span className="text-xs font-bold text-white">Rasm tanlash (Galereyadan)</span>
                  <span className="text-[10px] text-slate-400 mt-0.5">Avtomatik xavfsizlik filtri ishlaydi</span>
                  <input type="file" accept="image/*" className="hidden" onChange={handleBackgroundUpload} />
                </label>
              </div>

              {/* Curated Presets */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-2">Tayyor mavzular:</label>
                <div className="grid grid-cols-2 gap-2">
                  {PRESET_BACKGROUNDS.map(preset => (
                    <button
                      key={preset.id}
                      onClick={() => handleSelectPresetBg(preset.url)}
                      className="relative h-20 rounded-xl overflow-hidden border border-white/20 group text-left p-2 flex flex-col justify-end"
                      style={{ backgroundImage: `url(${preset.url})`, backgroundSize: 'cover' }}
                    >
                      <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition" />
                      <span className="relative z-10 text-xs font-bold text-white drop-shadow">
                        {preset.name}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button 
              onClick={() => setShowBgModal(false)}
              className="w-full py-3 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs"
            >
              Yopish
            </button>
          </div>
        )}

      </div>
    </div>
  );
};
