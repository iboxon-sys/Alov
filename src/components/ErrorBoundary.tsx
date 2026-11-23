import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || "Noma'lum xatolik yuz berdi.",
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('Application ErrorBoundary caught:', error, info.componentStack);
  }

  private handleReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      let friendlyMsg = "Ma'lumotlarni yuklashda vaqtinchalik xatolik yuz berdi. Sahifani qayta yuklab ko'ring.";
      try {
        const parsed = JSON.parse(this.state.errorMessage);
        if (parsed && typeof parsed === 'object' && parsed.operationType) {
          friendlyMsg = `Baza bilan ishlashda ruxsat yoki ulanish xatoligi (${parsed.operationType}): sahifani yangilang yoki qayta kiring.`;
        }
      } catch {
        // plain error message
      }

      return (
        <div className="min-h-screen bg-[#09090D] text-zinc-100 flex items-center justify-center p-6">
          <div className="max-w-md w-full rounded-[24px] bg-[#12141E] border border-white/10 p-6 text-center space-y-4 shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6 text-rose-400" />
            </div>
            <h2 className="text-lg font-bold text-white">Alov.uz — Tizim xatoligi</h2>
            <p className="text-xs text-zinc-400 leading-relaxed">{friendlyMsg}</p>
            <button
              type="button"
              onClick={this.handleReload}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Sahifani qayta yuklash</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
