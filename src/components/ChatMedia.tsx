import React from 'react';
import { Play, Pause, Volume2, Mic } from 'lucide-react';

interface VideoPlayerProps {
  url: string;
  className?: string;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ url, className }) => {
  const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');

  if (isYouTube) {
    const id = url.includes('watch?v=') ? url.split('v=')[1]?.split('&')[0] : url.split('/').pop();
    return (
      <div className={`relative aspect-video rounded-xl overflow-hidden shadow-lg ${className}`}>
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
    <div className={`relative rounded-xl overflow-hidden shadow-lg group ${className}`}>
      <video
        src={url}
        controls
        className="w-full h-full max-h-[300px] object-contain bg-black"
        playsInline
      />
    </div>
  );
};

interface VoiceMessageProps {
  url: string;
  senderId: string;
}

export const VoiceMessage: React.FC<VoiceMessageProps> = ({ url, senderId }) => {
  const [isPlaying, setIsPlaying] = React.useState(false);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  return (
    <div className={`flex items-center space-x-3 py-2 px-3 rounded-2xl ${senderId === 'me' ? 'bg-[#E8474A] text-white' : 'bg-slate-100 text-slate-900'}`}>
      <button 
        onClick={togglePlay}
        className={`w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-90 ${senderId === 'me' ? 'bg-white/20 hover:bg-white/30' : 'bg-[#E8474A] text-white'}`}
      >
        {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
      </button>
      
      <div className="flex-1 space-y-1 min-w-[120px]">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-1">
            <Mic className={`w-3 h-3 ${senderId === 'me' ? 'text-rose-200' : 'text-slate-400'}`} />
            <span className={`text-[10px] font-bold ${senderId === 'me' ? 'text-rose-100' : 'text-slate-500'}`}>Ovozli xabar</span>
          </div>
          <span className={`text-[10px] ${senderId === 'me' ? 'text-rose-200' : 'text-slate-400'}`}>0:12</span>
        </div>
        <div className={`h-1 rounded-full overflow-hidden ${senderId === 'me' ? 'bg-white/20' : 'bg-slate-200'}`}>
          <div className={`h-full bg-current w-1/3`} />
        </div>
      </div>
      
      <audio 
        ref={audioRef} 
        src={url} 
        onEnded={() => setIsPlaying(false)} 
        className="hidden" 
      />
    </div>
  );
};
