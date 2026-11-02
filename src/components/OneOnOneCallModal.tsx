import React, { useState, useEffect, useRef } from 'react';
import { 
  PhoneOff, Mic, MicOff, Video as VideoIcon, VideoOff, 
  Monitor, MonitorOff, User, RefreshCw, AlertTriangle, ShieldCheck
} from 'lucide-react';
import { Socket } from 'socket.io-client';

export interface OneOnOneCallModalProps {
  socket: Socket | null;
  currentUser: {
    uid: string;
    name: string;
    avatar?: string;
  };
  remoteUser: {
    uid: string;
    id?: string;
    name: string;
    avatar?: string;
    status?: string;
  };
  isIncoming?: boolean;
  incomingOffer?: any;
  onClose: () => void;
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

// Creates a dummy media stream so WebRTC connection works even if hardware access is restricted
function createFallbackMediaStream(userName: string = 'Siz'): MediaStream {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 480;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 640, 480);
    ctx.fillStyle = '#e11d48';
    ctx.beginPath();
    ctx.arc(320, 210, 60, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 44px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((userName.charAt(0) || 'U').toUpperCase(), 320, 210);
    ctx.font = 'bold 16px sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('Kamera ruxsati berilmagan', 320, 310);
  }
  const videoStream = canvas.captureStream ? canvas.captureStream(5) : new MediaStream();
  const videoTrack = videoStream.getVideoTracks()[0];

  let audioTrack: MediaStreamTrack | null = null;
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      const audioCtx = new AudioContextClass();
      const oscillator = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      gain.gain.value = 0; // pure silence
      oscillator.connect(gain);
      const dest = audioCtx.createMediaStreamDestination();
      gain.connect(dest);
      oscillator.start();
      audioTrack = dest.stream.getAudioTracks()[0];
    }
  } catch (e) {
    // AudioContext restricted in some sandboxes
  }

  const stream = new MediaStream();
  if (videoTrack) stream.addTrack(videoTrack);
  if (audioTrack) stream.addTrack(audioTrack);
  return stream;
}

export const OneOnOneCallModal: React.FC<OneOnOneCallModalProps> = ({
  socket,
  currentUser,
  remoteUser,
  isIncoming = false,
  incomingOffer = null,
  onClose
}) => {
  // Call status
  const [callStatus, setCallStatus] = useState<'calling' | 'connected' | 'ended'>('calling');
  const [isMicEnabled, setIsMicEnabled] = useState(true);
  const [isCameraEnabled, setIsCameraEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [remoteIsScreenSharing, setRemoteIsScreenSharing] = useState(false);
  const [permissionWarning, setPermissionWarning] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);

  // References
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const originalCameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const timerRef = useRef<any>(null);

  const targetUid = remoteUser.uid || remoteUser.id;

  // 1. Initialize WebRTC Call & Signaling with multi-tier fallback
  useEffect(() => {
    let isCancelled = false;

    const startCall = async () => {
      let stream: MediaStream | null = null;

      try {
        // Tier 1: Try Camera + Mic
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
      } catch (camErr: any) {
        console.warn("Camera/Mic initial access warning:", camErr?.message || camErr);
        // Tier 2: Try Audio only if camera is blocked or not available
        try {
          const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const fallback = createFallbackMediaStream(currentUser.name);
          const fallbackVideoTrack = fallback.getVideoTracks()[0];
          stream = new MediaStream([audioStream.getAudioTracks()[0]]);
          if (fallbackVideoTrack) stream.addTrack(fallbackVideoTrack);
          setIsCameraEnabled(false);
          setPermissionWarning("Kameraga ruxsat berilmadi yoki kamera topilmadi (Audio ulandi).");
        } catch (audioErr: any) {
          console.warn("Microphone access warning:", audioErr?.message || audioErr);
          // Tier 3: Synthetic fallback stream so call stays alive and remote peer can be seen/heard!
          stream = createFallbackMediaStream(currentUser.name);
          setIsCameraEnabled(false);
          setIsMicEnabled(false);
          setPermissionWarning("Kamera va mikrofonga ruxsat berilmadi. Iltimos brauzer sozlamalaridan ruxsat bering.");
        }
      }

      if (isCancelled) {
        stream?.getTracks().forEach(t => t.stop());
        return;
      }

      localStreamRef.current = stream;
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        originalCameraTrackRef.current = videoTrack;
      }

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      // 2. Create RTCPeerConnection
      try {
        const pc = new RTCPeerConnection(ICE_SERVERS);
        peerConnectionRef.current = pc;

        // Add local tracks to peer connection
        stream.getTracks().forEach(track => {
          pc.addTrack(track, stream!);
        });

        // Remote track received
        pc.ontrack = (event) => {
          if (remoteVideoRef.current && event.streams && event.streams[0]) {
            remoteVideoRef.current.srcObject = event.streams[0];
            setCallStatus('connected');
          }
        };

        // ICE candidate generation
        pc.onicecandidate = (event) => {
          if (event.candidate && socket) {
            socket.emit('ice-candidate', {
              targetUid,
              candidate: event.candidate.toJSON()
            });
          }
        };

        // Connection state monitoring
        pc.onconnectionstatechange = () => {
          if (pc.connectionState === 'connected') {
            setCallStatus('connected');
          } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
            handleHangup();
          }
        };

        // 3. Signaling: Handle Caller vs Callee
        if (isIncoming && incomingOffer) {
          await pc.setRemoteDescription(new RTCSessionDescription(incomingOffer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          const answerPayload = {
            targetUid,
            answer,
            callee: currentUser
          };
          socket?.emit('accept-call', answerPayload);
          socket?.emit('make-answer', answerPayload);
        } else {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);

          socket?.emit('call-user', {
            targetUid,
            offer,
            caller: currentUser
          });
        }
      } catch (err: any) {
        console.warn("Peer connection setup notice:", err?.message || err);
      }
    };

    startCall();

    // Socket listeners for 1-on-1 WebRTC signaling
    if (socket) {
      const handleRemoteAnswer = async ({ answer }: any) => {
        const pc = peerConnectionRef.current;
        if (pc && !pc.currentRemoteDescription && answer) {
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
            setCallStatus('connected');
          } catch (e) {
            console.warn("Set remote description notice:", e);
          }
        }
      };

      socket.on('call-accepted', handleRemoteAnswer);
      socket.on('answer-made', handleRemoteAnswer);

      const handleRemoteCandidate = async ({ candidate }: any) => {
        const pc = peerConnectionRef.current;
        if (pc && candidate) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (e) {
            console.warn("Add ICE candidate notice:", e);
          }
        }
      };

      socket.on('ice-candidate', handleRemoteCandidate);
      socket.on('ice-candidate-received', handleRemoteCandidate);

      socket.on('screen-share-changed', ({ isSharing }: any) => {
        setRemoteIsScreenSharing(!!isSharing);
      });

      socket.on('call-rejected', () => {
        handleHangup(false);
      });

      socket.on('call-ended', () => {
        handleHangup(false);
      });
    }

    return () => {
      isCancelled = true;
      if (socket) {
        socket.off('call-accepted');
        socket.off('answer-made');
        socket.off('ice-candidate');
        socket.off('ice-candidate-received');
        socket.off('screen-share-changed');
        socket.off('call-rejected');
        socket.off('call-ended');
      }
      cleanup();
    };
  }, []);

  // Duration timer when connected
  useEffect(() => {
    if (callStatus === 'connected') {
      timerRef.current = setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [callStatus]);

  // Clean all tracks and connections
  const cleanup = () => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
  };

  // Hangup
  const handleHangup = (notifyPeer: boolean = true) => {
    setCallStatus('ended');
    if (notifyPeer && socket) {
      socket.emit('end-call', { targetUid });
    }
    cleanup();
    setTimeout(() => {
      onClose();
    }, 300);
  };

  // Retry requesting media permissions without closing call
  const requestMediaPermissionsAgain = async () => {
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      localStreamRef.current = newStream;
      const newVideoTrack = newStream.getVideoTracks()[0];
      const newAudioTrack = newStream.getAudioTracks()[0];

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = newStream;
      }

      if (peerConnectionRef.current) {
        const senders = peerConnectionRef.current.getSenders();
        if (newVideoTrack) {
          originalCameraTrackRef.current = newVideoTrack;
          const vSender = senders.find(s => s.track?.kind === 'video');
          if (vSender) vSender.replaceTrack(newVideoTrack);
          setIsCameraEnabled(true);
        }
        if (newAudioTrack) {
          const aSender = senders.find(s => s.track?.kind === 'audio');
          if (aSender) aSender.replaceTrack(newAudioTrack);
          setIsMicEnabled(true);
        }
      }
      setPermissionWarning(null);
    } catch (err: any) {
      console.warn("Retry permission notice:", err?.message);
    }
  };

  // Toggle Microphone (Audio)
  const toggleMic = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMicEnabled(audioTrack.enabled);
      }
    }
  };

  // Toggle Camera (Video)
  const toggleCamera = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsCameraEnabled(videoTrack.enabled);
      }
    }
  };

  // Toggle Screen Sharing (getDisplayMedia & replaceTrack)
  const toggleScreenSharing = async () => {
    const pc = peerConnectionRef.current;
    if (!pc) return;

    if (isScreenSharing) {
      stopScreenSharing();
    } else {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            frameRate: { ideal: 15, max: 20 },
            width: { max: 1280 },
            height: { max: 720 }
          },
          audio: false
        });

        screenStreamRef.current = screenStream;
        const screenTrack = screenStream.getVideoTracks()[0];

        if (!screenTrack) return;

        const videoSender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (videoSender) {
          await videoSender.replaceTrack(screenTrack);
          try {
            const parameters = videoSender.getParameters();
            if (parameters.encodings && parameters.encodings.length > 0) {
              parameters.encodings[0].maxBitrate = 1500000; // 1.5 Mbps for crisp text and zero lag
              await videoSender.setParameters(parameters);
            }
          } catch (e) {
            console.warn("Could not set maxBitrate parameters:", e);
          }
        }

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = screenStream;
        }

        setIsScreenSharing(true);
        socket?.emit('screen-share-toggle', { targetUid, isSharing: true });

        screenTrack.onended = () => {
          stopScreenSharing();
        };

      } catch (err: any) {
        console.warn("Screen share notice:", err?.message);
      }
    }
  };

  // Helper to revert screen share back to camera track
  const stopScreenSharing = async () => {
    const pc = peerConnectionRef.current;
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;
    }

    if (pc && originalCameraTrackRef.current) {
      const videoSender = pc.getSenders().find(s => s.track?.kind === 'video');
      if (videoSender) {
        await videoSender.replaceTrack(originalCameraTrackRef.current);
      }
    }

    if (localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }

    setIsScreenSharing(false);
    socket?.emit('screen-share-toggle', { targetUid, isSharing: false });
  };

  // Format seconds to mm:ss
  const formatDuration = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const remainingSecs = sec % 60;
    return `${mins.toString().padStart(2, '0')}:${remainingSecs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-md select-none animate-in fade-in duration-200">
      <div className="relative w-full h-full md:max-w-4xl md:h-[90vh] bg-slate-950 md:rounded-3xl overflow-hidden shadow-2xl flex flex-col justify-between border border-white/10">

        {/* Permission Warning Banner (if camera or mic was denied) */}
        {permissionWarning && (
          <div className="absolute top-16 left-4 right-4 z-40 bg-amber-500/90 backdrop-blur-md text-white text-xs px-4 py-2.5 rounded-2xl flex items-center justify-between shadow-xl border border-amber-400/40 animate-in slide-in-from-top-4 duration-200">
            <div className="flex items-center space-x-2 min-w-0 pr-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-200" />
              <span className="truncate">{permissionWarning}</span>
            </div>
            <button 
              type="button"
              onClick={requestMediaPermissionsAgain}
              className="ml-2 px-3 py-1 bg-white text-amber-900 rounded-full font-bold text-[11px] hover:bg-amber-100 active:scale-95 transition shrink-0 shadow-sm"
            >
              Ruxsat berish
            </button>
          </div>
        )}

        {/* Remote Video (Full Screen background or dominant feed) */}
        <div className="relative flex-1 w-full h-full bg-slate-900 flex items-center justify-center overflow-hidden">
          <video 
            ref={remoteVideoRef} 
            autoPlay 
            playsInline 
            className={`w-full h-full object-cover transition-transform duration-300 ${
              remoteIsScreenSharing ? 'object-contain bg-black' : ''
            }`}
          />

          {/* Placeholder when remote video is connecting or not yet rendered */}
          {callStatus === 'calling' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-slate-900/90 to-black/95 z-10 space-y-4">
              <div className="relative">
                <div className="w-28 h-28 rounded-full overflow-hidden border-4 border-rose-500/80 shadow-[0_0_40px_rgba(244,63,94,0.6)] animate-pulse">
                  <img 
                    src={remoteUser.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=600'} 
                    alt={remoteUser.name} 
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="absolute -inset-2 rounded-full border border-rose-500/30 animate-ping pointer-events-none" />
              </div>
              <div className="text-center space-y-1">
                <h3 className="text-xl font-bold text-white">{remoteUser.name}</h3>
                <p className="text-sm text-rose-300 font-medium animate-pulse flex items-center justify-center space-x-1.5">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>{isIncoming ? "Ulanmoqda..." : (remoteUser.status === 'online' ? "Jiringlamoqda..." : "Kutilmoqda...")}</span>
                </p>
              </div>
            </div>
          )}

          {/* Local PiP (Picture-in-Picture) Preview */}
          <div className="absolute top-4 right-4 z-20 w-28 h-40 md:w-44 md:h-60 rounded-2xl overflow-hidden border-2 border-white/20 bg-slate-800 shadow-2xl backdrop-blur-md">
            <video 
              ref={localVideoRef} 
              autoPlay 
              playsInline 
              muted 
              className={`w-full h-full object-cover ${!isScreenSharing ? '-scale-x-100' : ''}`}
            />
            {!isCameraEnabled && !isScreenSharing && (
              <div className="absolute inset-0 bg-slate-900/90 flex flex-col items-center justify-center text-white/70">
                <VideoOff className="w-6 h-6 mb-1 text-rose-400" />
                <span className="text-[10px] font-semibold">Kamera o'chiq</span>
              </div>
            )}
            <div className="absolute bottom-1.5 left-1.5 bg-black/60 backdrop-blur-sm px-2 py-0.5 rounded-full text-[10px] text-white font-medium flex items-center space-x-1">
              <span>{isScreenSharing ? "Ekraningiz" : "Siz"}</span>
            </div>
          </div>

          {/* Top Status Banner */}
          <div className="absolute top-4 left-4 z-20 flex items-center space-x-3 bg-black/50 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-white/10 text-white">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-bold">{remoteUser.name}</span>
            {callStatus === 'connected' && (
              <span className="text-xs text-slate-300 font-mono pl-1 border-l border-white/20">
                {formatDuration(duration)}
              </span>
            )}
            {remoteIsScreenSharing && (
              <span className="text-[10px] bg-blue-500/80 text-white font-bold px-2 py-0.5 rounded-full flex items-center space-x-1">
                <Monitor className="w-3 h-3" />
                <span>Ekran ulashilmoqda</span>
              </span>
            )}
          </div>
        </div>

        {/* Bottom Control Bar */}
        <div className="p-4 md:p-6 bg-slate-950/90 backdrop-blur-xl border-t border-white/10 flex items-center justify-center space-x-4 md:space-x-6 z-20">
          
          {/* Microphone Mute/Unmute */}
          <button 
            type="button"
            onClick={toggleMic}
            className={`p-3.5 md:p-4 rounded-full transition active:scale-90 shadow-lg ${
              isMicEnabled 
                ? 'bg-white/15 hover:bg-white/25 text-white' 
                : 'bg-rose-600 text-white'
            }`}
            title={isMicEnabled ? "Mikrofonni o'chirish" : "Mikrofonni yoqish"}
          >
            {isMicEnabled ? <Mic className="w-5 h-5 md:w-6 md:h-6" /> : <MicOff className="w-5 h-5 md:w-6 md:h-6" />}
          </button>

          {/* Camera On/Off */}
          <button 
            type="button"
            onClick={toggleCamera}
            disabled={isScreenSharing}
            className={`p-3.5 md:p-4 rounded-full transition active:scale-90 shadow-lg ${
              isCameraEnabled && !isScreenSharing
                ? 'bg-white/15 hover:bg-white/25 text-white' 
                : 'bg-rose-600 text-white'
            } ${isScreenSharing ? 'opacity-40 cursor-not-allowed' : ''}`}
            title={isCameraEnabled ? "Kamerani o'chirish" : "Kamerani yoqish"}
          >
            {isCameraEnabled ? <VideoIcon className="w-5 h-5 md:w-6 md:h-6" /> : <VideoOff className="w-5 h-5 md:w-6 md:h-6" />}
          </button>

          {/* Screen Sharing (getDisplayMedia) */}
          <button 
            type="button"
            onClick={toggleScreenSharing}
            className={`p-3.5 md:p-4 rounded-full transition active:scale-90 shadow-lg ${
              isScreenSharing 
                ? 'bg-blue-600 text-white ring-4 ring-blue-500/40 animate-pulse' 
                : 'bg-white/15 hover:bg-white/25 text-white'
            }`}
            title={isScreenSharing ? "Ekran ulashishni to'xtatish" : "Ekranni ulashish (Screen Share)"}
          >
            {isScreenSharing ? <MonitorOff className="w-5 h-5 md:w-6 md:h-6" /> : <Monitor className="w-5 h-5 md:w-6 md:h-6" />}
          </button>

          {/* End Call (Hangup) */}
          <button 
            type="button"
            onClick={() => handleHangup(true)}
            className="p-3.5 md:p-4 rounded-full bg-rose-600 hover:bg-rose-700 text-white transition active:scale-90 shadow-xl shadow-rose-600/30"
            title="Qo'ng'iroqni tugatish"
          >
            <PhoneOff className="w-5 h-5 md:w-6 md:h-6" />
          </button>

        </div>

      </div>
    </div>
  );
};
