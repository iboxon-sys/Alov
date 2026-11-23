import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Crop, RefreshCw, X, ZoomIn, ZoomOut } from 'lucide-react';
import { cn } from '../utils/cn';

export type ImageCropMode = 'avatar' | 'banner';

interface ImageCropModalProps {
  isOpen: boolean;
  mode: ImageCropMode;
  imageSrc: string | null;
  isSubmitting?: boolean;
  onClose: () => void;
  onConfirm: (croppedDataUrl: string) => void | Promise<void>;
}

export const ImageCropModal: React.FC<ImageCropModalProps> = ({
  isOpen,
  mode,
  imageSrc,
  isSubmitting = false,
  onClose,
  onConfirm,
}) => {
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const previewContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isOpen && imageSrc) {
      setScale(1);
      setPan({ x: 0, y: 0 });
      setIsDragging(false);
    }
  }, [isOpen, imageSrc, mode]);

  if (!isOpen || !imageSrc) return null;

  const isBanner = mode === 'banner';

  const handleApply = () => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    let handled = false;

    const render = () => {
      if (handled) return;
      handled = true;

      const outW = isBanner ? 1200 : 360;
      const outH = isBanner ? 525 : 360;

      const box = previewContainerRef.current?.getBoundingClientRect();
      const previewW = box?.width && box.width > 0 ? box.width : isBanner ? 352 : 224;
      const previewH = box?.height && box.height > 0 ? box.height : isBanner ? 154 : 224;

      const panRatioX = outW / previewW;
      const panRatioY = outH / previewH;

      const canvas = document.createElement('canvas');
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        onConfirm(imageSrc);
        return;
      }

      ctx.fillStyle = '#09090D';
      ctx.fillRect(0, 0, outW, outH);

      ctx.save();
      ctx.translate(outW / 2 + pan.x * panRatioX, outH / 2 + pan.y * panRatioY);
      ctx.scale(scale, scale);

      const naturalW = img.naturalWidth || img.width || outW;
      const naturalH = img.naturalHeight || img.height || outH;
      const targetAspect = outW / outH;
      const imgAspect = naturalW / naturalH;

      let drawW = outW;
      let drawH = outH;
      if (imgAspect > targetAspect) {
        drawH = outH;
        drawW = outH * imgAspect;
      } else {
        drawW = outW;
        drawH = outW / imgAspect;
      }

      ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
      ctx.restore();

      try {
        const croppedBase64 = canvas.toDataURL('image/jpeg', 0.9);
        void onConfirm(croppedBase64);
      } catch {
        void onConfirm(imageSrc);
      }
    };

    img.onload = render;
    img.onerror = render;
    img.src = imageSrc;
  };

  return (
    <div
      data-testid={isBanner ? 'banner-crop-modal' : 'avatar-crop-modal'}
      onClick={() => {
        if (!isSubmitting) onClose();
      }}
      className="fixed inset-0 z-[210] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'bg-[#11131C] rounded-[28px] w-full p-5 space-y-4 relative select-none shadow-[0_28px_80px_rgba(0,0,0,0.85)] border border-white/10 text-zinc-100',
          isBanner ? 'max-w-md' : 'max-w-sm'
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <Crop className="w-5 h-5 text-rose-400 shrink-0" />
            <h3 className="font-bold text-sm text-white">
              {isBanner ? 'Bannerni moslashtirish' : 'Rasmni moslashtirish'}
            </h3>
          </div>
          <button
            type="button"
            disabled={isSubmitting}
            aria-label="Rasm tahrirlash oynasini yopish"
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] w-11 h-11 rounded-full bg-white/[0.08] text-zinc-200 hover:text-white hover:bg-rose-600 border border-white/15 flex items-center justify-center transition shrink-0 cursor-pointer disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-[11px] text-zinc-400 leading-relaxed">
          {isBanner
            ? "Barmoq yoki sichqoncha bilan bannerni surib, zoom orqali kerakli qismini ramkaga joylashtiring:"
            : "Barmoq/sichqoncha bilan rasmni suring va zoom orqali joylashuvini to'g'rilang:"}
        </p>

        <div
          ref={previewContainerRef}
          data-testid={isBanner ? 'banner-crop-preview' : 'avatar-crop-preview'}
          className={cn(
            'relative mx-auto overflow-hidden border-[3px] border-rose-500 shadow-lg bg-[#09090D] cursor-move flex items-center justify-center touch-none',
            isBanner ? 'w-full aspect-[16/7] rounded-2xl' : 'w-56 h-56 rounded-full'
          )}
          onMouseDown={(e) => {
            setIsDragging(true);
            dragStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
          }}
          onMouseMove={(e) => {
            if (!isDragging) return;
            setPan({
              x: e.clientX - dragStartRef.current.x,
              y: e.clientY - dragStartRef.current.y,
            });
          }}
          onMouseUp={() => setIsDragging(false)}
          onMouseLeave={() => setIsDragging(false)}
          onTouchStart={(e) => {
            if (e.touches.length === 1) {
              setIsDragging(true);
              dragStartRef.current = {
                x: e.touches[0].clientX - pan.x,
                y: e.touches[0].clientY - pan.y,
              };
            }
          }}
          onTouchMove={(e) => {
            if (isDragging && e.touches.length === 1) {
              setPan({
                x: e.touches[0].clientX - dragStartRef.current.x,
                y: e.touches[0].clientY - dragStartRef.current.y,
              });
            }
          }}
          onTouchEnd={() => setIsDragging(false)}
        >
          <img
            src={imageSrc}
            alt="Crop preview"
            className="max-w-none transition-transform duration-75 pointer-events-none select-none w-full h-full object-cover"
            style={{
              transform: `scale(${scale}) translate(${pan.x / scale}px, ${pan.y / scale}px)`,
            }}
          />
          {isBanner && (
            <div className="pointer-events-none absolute inset-0 border border-white/15 rounded-2xl grid grid-cols-3 grid-rows-2">
              <div className="border-r border-b border-white/10" />
              <div className="border-r border-b border-white/10" />
              <div className="border-b border-white/10" />
              <div className="border-r border-white/10" />
              <div className="border-r border-white/10" />
              <div />
            </div>
          )}
        </div>

        <div className="space-y-2 pt-1">
          <div className="flex items-center space-x-3 px-1">
            <button
              type="button"
              aria-label="Kichiklashtirish"
              onClick={() => setScale((prev) => Math.max(1, Math.round((prev - 0.2) * 100) / 100))}
              className="w-9 h-9 rounded-full bg-white/[0.08] hover:bg-white/[0.15] text-zinc-200 flex items-center justify-center cursor-pointer"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <input
              type="range"
              aria-label="Zoom darajasi"
              min="1"
              max="3"
              step="0.05"
              value={scale}
              onChange={(e) => setScale(parseFloat(e.target.value))}
              className="flex-1 accent-rose-500 h-2 bg-white/15 rounded-lg cursor-pointer"
            />
            <button
              type="button"
              aria-label="Kattalashtirish"
              onClick={() => setScale((prev) => Math.min(3, Math.round((prev + 0.2) * 100) / 100))}
              className="w-9 h-9 rounded-full bg-white/[0.08] hover:bg-white/[0.15] text-zinc-200 flex items-center justify-center cursor-pointer"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center justify-between text-[11px] text-zinc-500 px-2 tabular-nums">
            <span>1x (Oddiy)</span>
            <span>Zoom: {scale.toFixed(2)}x</span>
            <span>3x (Yaqinroq)</span>
          </div>
        </div>

        <div className="flex gap-2.5 pt-1">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => {
              setScale(1);
              setPan({ x: 0, y: 0 });
            }}
            className="min-h-[44px] px-4 rounded-xl bg-white/[0.07] text-zinc-200 font-bold text-xs hover:bg-white/[0.14] transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Tiklash</span>
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            data-testid={isBanner ? 'banner-crop-confirm-btn' : 'avatar-crop-confirm-btn'}
            onClick={handleApply}
            className="flex-1 min-h-[44px] rounded-xl bg-gradient-to-r from-[#E11D48] to-rose-600 text-white font-bold text-xs shadow-md hover:brightness-110 transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
          >
            <span>{isSubmitting ? 'Saqlanmoqda...' : 'Saqlash va Tasdiqlash'}</span>
          </button>
        </div>
      </motion.div>
    </div>
  );
};
