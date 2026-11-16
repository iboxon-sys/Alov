import React, { useState, useEffect } from 'react';
import { Users } from 'lucide-react';
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
      console.warn('Gender stats fetch offline mode:', err);
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
    <div className="bg-[#12131B] border border-white/10 rounded-[24px] p-5 sm:p-6 shadow-2xl space-y-4 w-full">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-500/15 text-rose-400 border border-rose-500/20 flex items-center justify-center shrink-0">
            <Users className="w-4.5 h-4.5" />
          </div>
          <div>
            <h2 className="font-bold text-sm text-white tracking-tight">Hamjamiyat muvozanati</h2>
            <p className="text-xs text-zinc-400 font-medium tabular-nums">
              Ro'yxatdan o'tgan a'zolar: <span className="text-zinc-200 font-semibold font-mono">{totalCount.toLocaleString()}</span>
            </p>
          </div>
        </div>
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-rose-400">
          Jonli statistika
        </span>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between items-center text-xs font-semibold">
          <span className="text-sky-300 flex items-center gap-2">
            <span>Erkaklar</span>
            <span className="font-mono font-bold text-sm tabular-nums text-white">{malePercent}%</span>
          </span>
          <span className="text-rose-300 flex items-center gap-2">
            <span className="font-mono font-bold text-sm tabular-nums text-white">{femalePercent}%</span>
            <span>Ayollar</span>
          </span>
        </div>

        <div className="relative w-full h-2.5 bg-[#09090D] rounded-full overflow-hidden border border-white/10">
          <div
            className="absolute inset-y-0 left-0 w-full bg-gradient-to-r from-sky-500 to-sky-400 origin-left transition-transform duration-700 ease-out will-change-transform"
            style={{ transform: `scaleX(${Math.max(0, Math.min(1, malePercent / 100))})` }}
          />
          <div
            className="absolute inset-y-0 right-0 w-full bg-gradient-to-r from-rose-500 to-rose-400 origin-right transition-transform duration-700 ease-out will-change-transform"
            style={{ transform: `scaleX(${Math.max(0, Math.min(1, femalePercent / 100))})` }}
          />
        </div>
      </div>
    </div>
  );
};
