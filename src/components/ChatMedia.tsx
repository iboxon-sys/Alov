import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, Volume2, VolumeX, Mic, Music, Maximize2, X } from 'lucide-react';
import { formatMediaDuration } from '../utils/chatMessages';

interface VideoPlayerProps {
  url: string;
  className?: string;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ url, className = '' }) => {
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');

  if (isYouTube) {
    const id = url.includes('watch?v=') ? url.split('v=')[1]?.split('&')[0] : url.split('/').pop();
    return (
      <div className={`relative aspect-video w-[260px] sm:w-[300px] rounded-2xl overflow-hidden bg-black ${className}`}>
        <iframe
          src={`https://www.youtube.com/embed/${id}`}
          className="absolute inset-0 w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }

  return (
    <>
      <div
        data-testid="chat-video-player"
        className={`relative rounded-2xl overflow-hidden bg-black group max-w-[270px] sm:max-w-[310px] ${className}`}
      >
        <video
          src={url}
          controls
          preload="metadata"
          playsInline
          className="w-full max-h-[320px] object-contain bg-black block"
        />
        <button
          type="button"
          onClick={() => setIsLightboxOpen(true)}
          aria-label="Videoni kattalashtirish"
          title="Kattalashtirish"
          className="absolute top-2 left-2 min-w-[36px] min-h-[36px] p-2 rounded-full bg-black/65 hover:bg-black/85 text-white/95 opacity-95 sm:opacity-0 sm:group-hover:opacity-100 transition flex items-center justify-center cursor-pointer backdrop-blur-xs border border-white/15"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>

      {isLightboxOpen && (
        <div
          className="fixed inset-0 z-[180] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 pt-[max(1rem,var(--alov-safe-top,0px))]"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsLightboxOpen(false);
          }}
        >
          <button
            type="button"
            onClick={() => setIsLightboxOpen(false)}
            aria-label="Yopish"
            className="absolute top-[calc(1rem+var(--alov-safe-top,0px))] right-4 z-30 min-w-[44px] min-h-[44px] w-11 h-11 flex items-center justify-center rounded-full bg-black/70 hover:bg-rose-600 border border-white/25 text-white shadow-lg transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
          <video
            src={url}
            controls
            autoPlay
            playsInline
            className="max-w-full max-h-[85dvh] rounded-2xl bg-black shadow-2xl"
          />
        </div>
      )}
    </>
  );
};

interface VoiceMessageProps {
  url: string;
  senderId: string;
  durationSec?: number;
}

const WAVE_BARS = [35, 65, 45, 90, 60, 80, 40, 95, 70, 50, 85, 55, 75, 45, 90, 65, 50, 70, 40, 60];

export const VoiceMessage: React.FC<VoiceMessageProps> = ({ url, senderId, durationSec }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState<number>(() => (durationSec && durationSec > 0 ? durationSec : 0));
  const [playbackRate, setPlaybackRate] = useState<1 | 1.5 | 2>(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (durationSec && durationSec > 0 && duration === 0) {
      setDuration(durationSec);
    }
  }, [durationSec, duration]);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      try {
        await audio.play();
        setIsPlaying(true);
      } catch {
        setIsPlaying(false);
      }
    }
  };

  const cycleRate = () => {
    const next: 1 | 1.5 | 2 = playbackRate === 1 ? 1.5 : playbackRate === 1.5 ? 2 : 1;
    setPlaybackRate(next);
    if (audioRef.current) {
      audioRef.current.playbackRate = next;
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !duration || duration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
    audio.currentTime = ratio * duration;
    setCurrentTime(audio.currentTime);
  };

  const effectiveDuration = duration > 0 ? duration : durationSec || 0;
  const progressPct = effectiveDuration > 0 ? Math.min(100, (currentTime / effectiveDuration) * 100) : 0;
  const isMe = senderId === 'me';

  return (
    <div
      data-testid="chat-voice-player"
      className={`flex items-center gap-2.5 py-1.5 px-1 min-w-[215px] max-w-[270px] ${
        isMe ? 'text-white' : 'text-zinc-100'
      }`}
    >
      <button
        type="button"
        onClick={() => void togglePlay()}
        aria-label={isPlaying ? "Ovozli xabarni to'xtatish" : 'Ovozli xabarni tinglash'}
        className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-all active:scale-90 cursor-pointer ${
          isMe ? 'bg-white/25 hover:bg-white/35 text-white' : 'bg-[#E11D48] hover:bg-[#BE123C] text-white'
        }`}
      >
        {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
      </button>

      <div className="flex-1 min-w-0 space-y-1.5">
        <div
          onClick={handleSeek}
          role="slider"
          aria-label="Ovozli xabar vaqti"
          aria-valuemin={0}
          aria-valuemax={Math.round(effectiveDuration)}
          aria-valuenow={Math.round(currentTime)}
          className="h-5 flex items-center gap-[2px] cursor-pointer select-none"
        >
          {WAVE_BARS.map((heightPct, i) => {
            const barPct = ((i + 1) / WAVE_BARS.length) * 100;
            const active = progressPct >= barPct - 3;
            return (
              <span
                key={i}
                style={{ height: `${heightPct}%` }}
                className={`flex-1 rounded-full transition-colors ${
                  active
                    ? isMe
                      ? 'bg-white'
                      : 'bg-rose-400'
                    : isMe
                    ? 'bg-white/35'
                    : 'bg-white/20'
                }`}
              />
            );
          })}
        </div>

        <div className="flex items-center justify-between text-[10px] leading-none">
          <div className="flex items-center gap-1 opacity-90">
            <Mic className="w-3 h-3" />
            <span className="font-mono tabular-nums">
              {isPlaying || currentTime > 0
                ? `${formatMediaDuration(currentTime)} / ${formatMediaDuration(effectiveDuration)}`
                : formatMediaDuration(effectiveDuration)}
            </span>
          </div>
          <button
            type="button"
            onClick={cycleRate}
            className={`px-1.5 py-0.5 rounded-md text-[9.5px] font-bold tabular-nums cursor-pointer transition ${
              isMe ? 'bg-white/15 hover:bg-white/25 text-white' : 'bg-white/[0.08] hover:bg-white/[0.14] text-zinc-300'
            }`}
          >
            {playbackRate}x
          </button>
        </div>
      </div>

      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) setDuration(d);
        }}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onEnded={() => {
          setIsPlaying(false);
          setCurrentTime(0);
        }}
        onPause={() => setIsPlaying(false)}
        className="hidden"
      />
    </div>
  );
};

interface AudioPlayerProps {
  url: string;
  senderId: string;
  title?: string;
  durationSec?: number;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({ url, senderId, title, durationSec }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState<number>(() => (durationSec && durationSec > 0 ? durationSec : 0));
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      try {
        await audio.play();
        setIsPlaying(true);
      } catch {
        setIsPlaying(false);
      }
    }
  };

  const toggleMute = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = !audio.muted;
    setIsMuted(audio.muted);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    if (audioRef.current && Number.isFinite(val)) {
      audioRef.current.currentTime = val;
      setCurrentTime(val);
    }
  };

  const effectiveDuration = duration > 0 ? duration : durationSec || 0;
  const isMe = senderId === 'me';

  return (
    <div
      data-testid="chat-audio-player"
      className={`flex items-center gap-2.5 py-1 min-w-[230px] max-w-[290px] ${
        isMe ? 'text-white' : 'text-zinc-100'
      }`}
    >
      <button
        type="button"
        onClick={() => void togglePlay()}
        aria-label={isPlaying ? "Audioni to'xtatish" : 'Audioni ijro etish'}
        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition active:scale-90 cursor-pointer ${
          isMe ? 'bg-white/20 hover:bg-white/30 text-white' : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30'
        }`}
      >
        {isPlaying ? <Pause className="w-4.5 h-4.5 fill-current" /> : <Play className="w-4.5 h-4.5 fill-current ml-0.5" />}
      </button>

      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-1 min-w-0">
            <Music className={`w-3.5 h-3.5 shrink-0 ${isMe ? 'text-rose-100' : 'text-amber-400'}`} />
            <span className="text-[11.5px] font-bold truncate" title={title || 'Audio fayl'}>
              {title || 'Audio fayl'}
            </span>
          </div>
          <button
            type="button"
            onClick={toggleMute}
            aria-label={isMuted ? 'Ovozni yoqish' : "Ovozni o'chirish"}
            className="p-1 rounded-md hover:bg-white/10 opacity-80 hover:opacity-100 transition cursor-pointer shrink-0"
          >
            {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
          </button>
        </div>

        <input
          type="range"
          min={0}
          max={Math.max(1, Math.floor(effectiveDuration || 100))}
          value={Math.floor(currentTime)}
          onChange={handleSeek}
          aria-label="Audio vaqtini surish"
          className="w-full h-1.5 accent-white cursor-pointer rounded-full"
        />

        <div className="flex items-center justify-between text-[9.5px] font-mono tabular-nums opacity-85">
          <span>{formatMediaDuration(currentTime)}</span>
          <span>{formatMediaDuration(effectiveDuration)}</span>
        </div>
      </div>

      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) setDuration(d);
        }}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onEnded={() => {
          setIsPlaying(false);
          setCurrentTime(0);
        }}
        onPause={() => setIsPlaying(false)}
        className="hidden"
      />
    </div>
  );
};
