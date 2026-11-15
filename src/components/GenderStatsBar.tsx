import React, { useState, useEffect } from 'react';
import { Users, Heart } from 'lucide-react';
import { getApiUrl, getBaseUrl, safeFetchJson } from '../config/api';
import { io } from 'socket.io-client';

export const GenderStatsBar: React.FC = () => {
  const [malePercent, setMalePercent] = useState<number>(50);
  const [femalePercent, setFemalePercent] = useState<number>(50);
  const [totalCount, setTotalCount] = useState<number>(0);

  const fetchStats = async () => {
    try {
      const data = await safeFetchJson(getApiUrl('/api/stats/gender'));
      if (data && data.success) {
        setMalePercent(data.malePercent ?? 50);
        setFemalePercent(data.femalePercent ?? 50);
        setTotalCount(data.totalUsers ?? 0);
      }
    } catch (err) {
      console.warn("Gender stats fetch offline mode:", err);
    }
  };

  useEffect(() => {
    fetchStats();

    const socket = io(getBaseUrl(), {
      reconnection: true,
      reconnectionAttempts: 15,
      reconnectionDelay: 2000,
      timeout: 10000,
      transports: ['websocket', 'polling'],
    });

    socket.on('user_updated', () => {
      fetchStats();
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  return (
    <div className="bg-[#14161F] border border-white/15 rounded-[28px] p-5 shadow-2xl space-y-3 w-full max-w-md mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2.5">
          <div className="w-9 h-9 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center font-bold">
            <Users className="w-4 h-4" />
          </div>
          <div>
            <h4 className="font-black text-sm text-white">Platforma Statistikasi</h4>
            <p className="text-[11px] text-zinc-300 font-semibold">Jami faol foydalanuvchilar: {totalCount}</p>
          </div>
        </div>
        <div className="flex items-center space-x-1 text-xs font-extrabold text-rose-200 bg-rose-950/90 border border-rose-500/40 px-3 py-1 rounded-full shadow-xs">
          <Heart className="w-3 h-3 fill-current text-rose-400" />
          <span>Real-time</span>
        </div>
      </div>

      <div className="flex justify-between items-center text-xs font-black tracking-wide pt-1">
        <span className="text-sky-300 flex items-center space-x-1">
          <span>👨 ERKAKLAR</span>
          <span className="font-mono text-sm">{malePercent}%</span>
        </span>
        <span className="text-rose-300 flex items-center space-x-1">
          <span className="font-mono text-sm">{femalePercent}%</span>
          <span>AYOLLAR 👩</span>
        </span>
      </div>

      {/* Dynamic Ratio Bar */}
      <div className="relative w-full h-4 bg-[#0B0C11] rounded-full overflow-hidden border border-white/15 flex p-0.5">
        <div 
          className="h-full bg-sky-500 rounded-l-full transition-all duration-700 ease-in-out relative"
          style={{ width: `${malePercent}%` }}
        />
        <div 
          className="h-full bg-rose-500 rounded-r-full transition-all duration-700 ease-in-out relative"
          style={{ width: `${femalePercent}%` }}
        />
      </div>
    </div>
  );
};
