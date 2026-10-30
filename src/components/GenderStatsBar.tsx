import React, { useState, useEffect } from 'react';
import { Users, Heart } from 'lucide-react';
import { getApiUrl, getBaseUrl } from '../config/api';
import { io } from 'socket.io-client';

export const GenderStatsBar: React.FC = () => {
  const [malePercent, setMalePercent] = useState<number>(50);
  const [femalePercent, setFemalePercent] = useState<number>(50);
  const [totalCount, setTotalCount] = useState<number>(0);

  const fetchStats = async () => {
    try {
      const res = await fetch(getApiUrl('/api/stats/gender'));
      const data = await res.json();
      if (data.success) {
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

    const socket = io(getBaseUrl());
    socket.on('active_users_count', (payload: { count: number }) => {
      if (payload && payload.count !== undefined) {
        setTotalCount(prev => Math.max(prev, payload.count));
      }
    });

    socket.on('user_updated', () => {
      fetchStats();
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  return (
    <div className="bg-white border-2 border-black rounded-[28px] p-5 shadow-[0_8px_30px_rgb(0,0,0,0.06)] space-y-3 w-full max-w-md mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-full bg-rose-50 text-[#E8474A] flex items-center justify-center font-bold">
            <Users className="w-4 h-4" />
          </div>
          <div>
            <h4 className="font-black text-sm text-slate-900">Platforma Statistikasi</h4>
            <p className="text-[10px] text-slate-500 font-medium">Jami faol foydalanuvchilar: {totalCount}</p>
          </div>
        </div>
        <div className="flex items-center space-x-1 text-xs font-bold text-rose-500 bg-rose-50 px-2.5 py-1 rounded-full">
          <Heart className="w-3 h-3 fill-current" />
          <span>Real-time</span>
        </div>
      </div>

      <div className="flex justify-between items-center text-xs font-black tracking-wide pt-1">
        <span className="text-sky-600 flex items-center space-x-1">
          <span>👨 ERKAKLAR</span>
          <span className="font-mono text-sm">{malePercent}%</span>
        </span>
        <span className="text-rose-600 flex items-center space-x-1">
          <span className="font-mono text-sm">{femalePercent}%</span>
          <span>AYOLLAR 👩</span>
        </span>
      </div>

      {/* Dynamic Ratio Bar */}
      <div className="relative w-full h-4 bg-slate-100 rounded-full overflow-hidden border-2 border-black flex p-0.5">
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
