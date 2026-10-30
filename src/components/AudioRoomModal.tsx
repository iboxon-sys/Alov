import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, PhoneOff, Radio, Users, Volume2, Sparkles, Shield, User } from 'lucide-react';
import { io, Socket } from 'socket.io-client';

interface Participant {
  socketId: string;
  user: {
    uid: string;
    name: string;
    avatar?: string;
  };
  isMuted?: boolean;
  isSpeaking?: boolean;
}

interface AudioRoomModalProps {
  roomCode?: string;
  roomTitle?: string;
  currentUser: {
    uid: string;
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

export const AudioRoomModal: React.FC<AudioRoomModalProps> = ({
  roomCode = 'alov_general_room',
  roomTitle = 'Alov.uz Jonli Ovozli Xona 🎙️',
  currentUser,
  onClose
}) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState<number>(0);

  const socketRef = useRef<Socket | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    // Initialize Socket.io connection for signaling
    const socket = io();
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Connected to signaling server, joining audio room:', roomCode);
      socket.emit('join_audio_room', { roomCode, user: currentUser });
    });

    // Handle new user joined audio room
    socket.on('user_joined_audio', async ({ socketId, user }) => {
      console.log('User joined audio room:', user.name, socketId);
      setParticipants(prev => [...prev.filter(p => p.socketId !== socketId), { socketId, user }]);

      // Create WebRTC Offer as initiator
      try {
        const pc = createPeerConnection(socketId, true);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        socket.emit('webrtc_offer', {
          targetSocketId: socketId,
          offer,
          sender: currentUser
        });
      } catch (err) {
        console.error('Error creating WebRTC offer:', err);
      }
    });

    // Handle incoming WebRTC Offer
    socket.on('webrtc_offer', async ({ senderSocketId, offer, sender }) => {
      console.log('Received WebRTC offer from:', sender.name, senderSocketId);
      setParticipants(prev => {
        if (!prev.some(p => p.socketId === senderSocketId)) {
          return [...prev, { socketId: senderSocketId, user: sender }];
        }
        return prev;
      });

      try {
        const pc = createPeerConnection(senderSocketId, false);
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit('webrtc_answer', {
          targetSocketId: senderSocketId,
          answer,
          sender: currentUser
        });
      } catch (err) {
        console.error('Error handling WebRTC offer:', err);
      }
    });

    // Handle incoming WebRTC Answer
    socket.on('webrtc_answer', async ({ senderSocketId, answer }) => {
      console.log('Received WebRTC answer from:', senderSocketId);
      const pc = peerConnectionsRef.current.get(senderSocketId);
      if (pc) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
        } catch (err) {
          console.error('Error setting remote description from answer:', err);
        }
      }
    });

    // Handle incoming ICE Candidate
    socket.on('webrtc_ice_candidate', async ({ senderSocketId, candidate }) => {
      const pc = peerConnectionsRef.current.get(senderSocketId);
      if (pc && candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.error('Error adding received ICE candidate:', err);
        }
      }
    });

    // Handle user left
    socket.on('user_left_audio', ({ socketId }) => {
      console.log('User left audio room:', socketId);
      removePeer(socketId);
    });

    // Start local audio stream
    startMicrophone();

    return () => {
      leaveRoom();
    };
  }, [roomCode]);

  const startMicrophone = async () => {
    setErrorMsg(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Brauzeringiz mikrofonni qo'llab-quvvatlamaydi.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });

      localStreamRef.current = stream;
      setIsConnected(true);

      // Setup audio analyzer for speaking indicator
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyserRef.current = analyser;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const checkAudioLevel = () => {
          if (analyserRef.current && !isMuted) {
            analyserRef.current.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
              sum += dataArray[i];
            }
            const avg = sum / dataArray.length;
            setAudioLevel(avg);
          } else {
            setAudioLevel(0);
          }
          animationFrameRef.current = requestAnimationFrame(checkAudioLevel);
        };
        checkAudioLevel();
      } catch (e) {
        console.warn('AudioContext visualization setup failed:', e);
      }

    } catch (err: any) {
      console.error('Microphone access error:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setErrorMsg("Mikrofonga ruxsat berilmadi. Iltimos, brauzer sozlamalaridan ruxsat bering!");
      } else {
        setErrorMsg(err.message || "Mikrofonni yoqib bo'lmadi.");
      }
    }
  };

  const createPeerConnection = (remoteSocketId: string, isInitiator: boolean): RTCPeerConnection => {
    if (peerConnectionsRef.current.has(remoteSocketId)) {
      return peerConnectionsRef.current.get(remoteSocketId)!;
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnectionsRef.current.set(remoteSocketId, pc);

    // Add local audio tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    // ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        socketRef.current.emit('webrtc_ice_candidate', {
          targetSocketId: remoteSocketId,
          candidate: event.candidate,
          sender: currentUser
        });
      }
    };

    // Remote audio stream received
    pc.ontrack = (event) => {
      console.log('Received remote audio track from:', remoteSocketId);
      const remoteStream = event.streams[0];
      if (remoteStream) {
        let audioEl = audioElementsRef.current.get(remoteSocketId);
        if (!audioEl) {
          audioEl = document.createElement('audio');
          audioEl.autoplay = true;
          audioEl.setAttribute('playsinline', 'true');
          document.body.appendChild(audioEl);
          audioElementsRef.current.set(remoteSocketId, audioEl);
        }
        audioEl.srcObject = remoteStream;
      }
    };

    return pc;
  };

  const removePeer = (socketId: string) => {
    const pc = peerConnectionsRef.current.get(socketId);
    if (pc) {
      pc.close();
      peerConnectionsRef.current.delete(socketId);
    }
    const audioEl = audioElementsRef.current.get(socketId);
    if (audioEl) {
      audioEl.srcObject = null;
      audioEl.remove();
      audioElementsRef.current.delete(socketId);
    }
    setParticipants(prev => prev.filter(p => p.socketId !== socketId));
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = isMuted; // toggle
        setIsMuted(!isMuted);
      }
    }
  };

  const leaveRoom = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
    }
    peerConnectionsRef.current.forEach(pc => pc.close());
    peerConnectionsRef.current.clear();
    audioElementsRef.current.forEach(audio => {
      audio.srcObject = null;
      audio.remove();
    });
    audioElementsRef.current.clear();

    if (socketRef.current) {
      socketRef.current.emit('leave_audio_room', roomCode);
      socketRef.current.disconnect();
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fadeIn">
      <div className="w-full max-w-xl bg-slate-900 border border-rose-500/30 rounded-3xl shadow-2xl overflow-hidden flex flex-col text-white">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-rose-600 via-pink-600 to-purple-600 p-6 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center animate-pulse">
              <Radio className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-wide">{roomTitle}</h2>
              <p className="text-xs text-rose-100 flex items-center space-x-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                <span>Render Signaling • P2P WebRTC Audio</span>
              </p>
            </div>
          </div>
          <button 
            onClick={leaveRoom}
            className="w-9 h-9 rounded-full bg-black/30 hover:bg-black/50 flex items-center justify-center transition"
          >
            <PhoneOff className="w-5 h-5 text-rose-300" />
          </button>
        </div>

        {/* Error Notification */}
        {errorMsg && (
          <div className="bg-rose-500/20 border-b border-rose-500/40 p-4 text-rose-200 text-sm flex items-center space-x-2">
            <Shield className="w-5 h-5 flex-shrink-0 text-rose-400" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Room Body / Participants Grid */}
        <div className="p-6 flex-1 flex flex-col items-center justify-center min-h-[320px]">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 w-full max-w-md">
            
            {/* Current User Card */}
            <div className={`relative flex flex-col items-center p-4 rounded-2xl border transition-all duration-300 ${
              isMuted 
                ? 'bg-slate-800/60 border-slate-700 opacity-80' 
                : audioLevel > 15 
                  ? 'bg-rose-950/40 border-rose-500 shadow-lg shadow-rose-500/20 scale-105' 
                  : 'bg-slate-800/80 border-slate-600'
            }`}>
              {/* Speaking pulse ring */}
              {!isMuted && audioLevel > 15 && (
                <div className="absolute inset-0 rounded-2xl border-2 border-rose-500 animate-ping opacity-30 pointer-events-none"></div>
              )}

              <div className="relative mb-3">
                <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-rose-500 to-purple-600 flex items-center justify-center text-2xl font-bold shadow-md overflow-hidden border-2 border-white/20">
                  {currentUser.avatar ? (
                    <img src={currentUser.avatar} alt={currentUser.name} className="w-full h-full object-cover" />
                  ) : (
                    <span>{currentUser.name?.[0]?.toUpperCase() || 'S'}</span>
                  )}
                </div>
                <div className={`absolute bottom-0 right-0 w-6 h-6 rounded-full flex items-center justify-center border-2 border-slate-900 ${
                  isMuted ? 'bg-rose-600' : 'bg-emerald-500'
                }`}>
                  {isMuted ? <MicOff className="w-3 h-3 text-white" /> : <Mic className="w-3 h-3 text-white" />}
                </div>
              </div>

              <span className="font-semibold text-sm truncate max-w-[120px]">{currentUser.name} (Siz)</span>
              <span className="text-xs text-rose-400 mt-0.5">
                {isMuted ? 'Mikrofon o\'chiq' : audioLevel > 15 ? 'Gaplashmoqda... 🗣️' : 'Onlayn'}
              </span>
            </div>

            {/* Other Participants */}
            {participants.map((p) => (
              <div 
                key={p.socketId}
                className="relative flex flex-col items-center p-4 rounded-2xl bg-slate-800/80 border border-slate-700 transition-all duration-300"
              >
                <div className="relative mb-3">
                  <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-2xl font-bold shadow-md overflow-hidden border-2 border-white/20">
                    {p.user.avatar ? (
                      <img src={p.user.avatar} alt={p.user.name} className="w-full h-full object-cover" />
                    ) : (
                      <span>{p.user.name?.[0]?.toUpperCase() || 'U'}</span>
                    )}
                  </div>
                  <div className="absolute bottom-0 right-0 w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center border-2 border-slate-900">
                    <Mic className="w-3 h-3 text-white" />
                  </div>
                </div>

                <span className="font-semibold text-sm truncate max-w-[120px]">{p.user.name}</span>
                <span className="text-xs text-emerald-400 mt-0.5">Ovozli ulanish</span>
              </div>
            ))}

            {participants.length === 0 && (
              <div className="col-span-1 sm:col-span-2 flex flex-col items-center justify-center text-center p-6 border border-dashed border-slate-700 rounded-2xl text-slate-400">
                <Users className="w-8 h-8 text-slate-500 mb-2" />
                <p className="text-sm">Hozircha xonada boshqa ishtirokchilar yo'q.</p>
                <p className="text-xs text-slate-500 mt-1">Boshqa foydalanuvchilar kirishini kuting...</p>
              </div>
            )}

          </div>
        </div>

        {/* Footer Controls */}
        <div className="bg-slate-950 p-5 flex items-center justify-center space-x-6 border-t border-slate-800">
          <button
            onClick={toggleMute}
            className={`flex items-center space-x-2 px-6 py-3 rounded-full font-medium transition shadow-lg ${
              isMuted 
                ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/30' 
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
            }`}
          >
            {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5 text-emerald-400" />}
            <span>{isMuted ? "Mikrofonni yoqish" : "Ovozni o'chirish (Mute)"}</span>
          </button>

          <button
            onClick={leaveRoom}
            className="flex items-center space-x-2 px-6 py-3 rounded-full bg-rose-600 hover:bg-rose-500 text-white font-medium shadow-lg shadow-rose-600/30 transition"
          >
            <PhoneOff className="w-5 h-5" />
            <span>Xonadan chiqish</span>
          </button>
        </div>

      </div>
    </div>
  );
};
