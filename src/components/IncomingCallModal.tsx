import React, { useEffect } from 'react';
import { Video, Phone, PhoneOff, Volume2 } from 'lucide-react';
import { callNotification } from '../services/callNotification';

interface IncomingCallModalProps {
  caller: {
    uid: string;
    id?: string;
    name: string;
    avatar?: string;
  };
  onAccept: () => void;
  onReject: () => void;
}

export const IncomingCallModal: React.FC<IncomingCallModalProps> = ({
  caller,
  onAccept,
  onReject
}) => {
  useEffect(() => {
    callNotification.startRingtone();
    callNotification.showCallNotification(caller.name, caller.avatar, caller.uid);

    // Auto-timeout after 35 seconds if caller stops waiting
    const timeout = setTimeout(() => {
      callNotification.dismissNotifications();
      onReject();
    }, 35000);

    return () => {
      callNotification.stopRingtone();
      callNotification.dismissNotifications();
      clearTimeout(timeout);
    };
  }, [caller]);

  const handleAccept = () => {
    callNotification.stopRingtone();
    callNotification.dismissNotifications();
    onAccept();
  };

  const handleReject = () => {
    callNotification.stopRingtone();
    callNotification.dismissNotifications();
    onReject();
  };

  return (
    <>
      {/* --- ANDROID FLOATING HEADS-UP TOP CALL BANNER --- */}
      <div className="fixed top-2 left-2 right-2 md:left-auto md:right-4 md:w-96 z-[9999] bg-slate-900/95 border border-emerald-500/40 rounded-3xl p-3.5 shadow-[0_10px_40px_rgba(0,0,0,0.8)] backdrop-blur-xl animate-in slide-in-from-top-6 duration-300 select-none">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3 min-w-0 pr-2">
            <div className="relative shrink-0">
              <img 
                src={caller.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=600'} 
                alt={caller.name} 
                className="w-12 h-12 rounded-full object-cover border-2 border-emerald-400"
              />
              <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-emerald-500 border-2 border-slate-900 flex items-center justify-center">
                <Video className="w-2.5 h-2.5 text-white animate-pulse" />
              </span>
            </div>
            <div className="min-w-0">
              <h4 className="font-extrabold text-sm text-white truncate">{caller.name}</h4>
              <p className="text-[11px] text-emerald-400 font-semibold animate-pulse flex items-center space-x-1">
                <Volume2 className="w-3 h-3" />
                <span>Kiruvchi video qo'ng'iroq...</span>
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            <button 
              type="button"
              onClick={handleReject}
              className="p-2.5 rounded-full bg-rose-600 hover:bg-rose-500 text-white shadow-md active:scale-90 transition"
              title="Rad etish"
            >
              <PhoneOff className="w-4 h-4" />
            </button>
            <button 
              type="button"
              onClick={handleAccept}
              className="p-2.5 px-3 rounded-full bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-xs shadow-md active:scale-90 transition animate-pulse flex items-center space-x-1"
              title="Javob berish"
            >
              <Phone className="w-4 h-4" />
              <span className="hidden sm:inline">Javob</span>
            </button>
          </div>
        </div>
      </div>

      {/* --- FULLSCREEN INCOMING CALL MODAL --- */}
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 select-none animate-in fade-in duration-300">
        <div className="relative w-full max-w-sm bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border border-white/15 rounded-[36px] p-8 text-center shadow-[0_20px_60px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col items-center">
          
          {/* Ambient background glow */}
          <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-48 h-48 bg-emerald-500/20 rounded-full blur-3xl pointer-events-none" />

          {/* Top small app badge */}
          <div className="flex items-center space-x-1.5 bg-white/10 px-3 py-1 rounded-full text-[10px] text-emerald-300 font-bold uppercase tracking-wider mb-6">
            <Video className="w-3 h-3 text-emerald-400 animate-pulse" />
            <span>Alov.uz Video Qo'ng'iroq</span>
          </div>

          {/* Avatar with pulsing wave rings */}
          <div className="relative my-4">
            <div className="absolute -inset-3 rounded-full bg-emerald-500/20 animate-ping" />
            <div className="absolute -inset-6 rounded-full border border-emerald-500/20 animate-pulse" />
            <div className="relative w-28 h-28 rounded-full overflow-hidden border-4 border-emerald-400/80 shadow-[0_0_35px_rgba(16,185,129,0.5)]">
              <img 
                src={caller.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=600'} 
                alt={caller.name} 
                className="w-full h-full object-cover"
              />
            </div>
            <div className="absolute bottom-0 right-1 w-7 h-7 rounded-full bg-emerald-500 border-2 border-slate-900 flex items-center justify-center shadow-lg">
              <Volume2 className="w-4 h-4 text-white animate-bounce" />
            </div>
          </div>

          {/* Caller Details */}
          <div className="mt-4 mb-8 space-y-1">
            <h3 className="text-xl font-extrabold text-white tracking-tight">{caller.name}</h3>
            <p className="text-xs text-emerald-400 font-medium animate-pulse flex items-center justify-center space-x-1">
              <span>Kiruvchi video qo'ng'iroq...</span>
            </p>
          </div>

          {/* Action Buttons: WhatsApp / Telegram style */}
          <div className="flex items-center justify-between w-full px-4">
            {/* Reject Button (Red) */}
            <div className="flex flex-col items-center space-y-2">
              <button 
                type="button"
                onClick={handleReject}
                className="w-16 h-16 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center shadow-xl shadow-rose-600/30 active:scale-90 transition transform"
                title="Rad etish"
              >
                <PhoneOff className="w-7 h-7" />
              </button>
              <span className="text-xs text-rose-300 font-bold">Rad etish</span>
            </div>

            {/* Accept Button (Green) */}
            <div className="flex flex-col items-center space-y-2">
              <button 
                type="button"
                onClick={handleAccept}
                className="w-16 h-16 rounded-full bg-emerald-500 hover:bg-emerald-400 text-white flex items-center justify-center shadow-xl shadow-emerald-500/40 active:scale-90 transition transform animate-pulse"
                title="Javob berish"
              >
                <Phone className="w-7 h-7 animate-bounce" />
              </button>
              <span className="text-xs text-emerald-300 font-bold">Javob berish</span>
            </div>
          </div>

        </div>
      </div>
    </>
  );
};
