"use client";

import { useRef, useState, useCallback, memo } from "react";
import ReactCrop, {
 centerCrop,
 makeAspectCrop,
 type Crop,
 type PixelCrop,
} from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { X, ZoomIn, ZoomOut, RotateCw, RotateCcw, Check, RefreshCw } from "lucide-react";

export interface CropState {
 crop: Crop | undefined;
 completedCrop: PixelCrop | undefined;
 scale: number;
 rotate: number;
}

interface CoverCropModalProps {
 rawSrc: string;
 initialState?: CropState;
 aspectRatio?: number;
 onDone: (croppedFile: File, previewUrl: string, state: CropState) => void;
 onCancel: () => void;
}

function initCrop(w: number, h: number, aspect: number = 1): Crop {
 return centerCrop(makeAspectCrop({ unit: "%", width: 85 }, aspect, w, h), w, h);
}

export const CoverCropModal = memo(function CoverCropModal({
 rawSrc: src,
 initialState,
 aspectRatio = 1,
 onDone,
 onCancel: onClose,
}: CoverCropModalProps) {
 const imgRef = useRef<HTMLImageElement>(null);

 const [crop, setCrop] = useState<Crop | undefined>(initialState?.crop);
 const [completedCrop, setCompletedCrop] = useState<PixelCrop | undefined>(initialState?.completedCrop);
 const [scale, setScale] = useState(initialState?.scale ?? 1);
 const [rotate, setRotate] = useState(initialState?.rotate ?? 0);
 const [isProcessing, setIsProcessing] = useState(false);

 const onImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
 // If no saved crop, generate a default centred one
 if (!initialState?.completedCrop) {
 const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
 setCrop(initCrop(w, h, aspectRatio));
 }
 }, [initialState?.completedCrop, aspectRatio]);

 const resetAll = () => {
 setScale(1);
 setRotate(0);
 if (imgRef.current) {
 const { naturalWidth: w, naturalHeight: h } = imgRef.current;
 setCrop(initCrop(w, h, aspectRatio));
 setCompletedCrop(undefined);
 }
 };

 const handleApply = () => {
  const img = imgRef.current;
  if (!img) return;

  setIsProcessing(true);

  try {
      const usedCrop = completedCrop ?? (() => {
      const w = img.width;
      const h = Math.min(img.width, img.height);
      return { unit: "px" as const, x: 0, y: 0, width: w, height: h };
      })();

      const canvas = document.createElement("canvas");
      const scaleX = img.naturalWidth / img.width;
      const scaleY = img.naturalHeight / img.height;

      let pixelWidth = (usedCrop.width * scaleX) / scale;
      let pixelHeight = (usedCrop.height * scaleY) / scale;

      const MAX_DIM = 2000;
      let drawScale = 1;
      if (pixelWidth > MAX_DIM) {
          drawScale = MAX_DIM / pixelWidth;
      }
      if (pixelHeight * drawScale > MAX_DIM) {
          drawScale = MAX_DIM / pixelHeight;
      }

      pixelWidth = Math.max(1, Math.floor(pixelWidth * drawScale));
      pixelHeight = Math.max(1, aspectRatio ? Math.floor(pixelWidth / aspectRatio) : Math.floor(pixelHeight * drawScale));

      canvas.width = pixelWidth;
      canvas.height = pixelHeight;

      const ctx = canvas.getContext("2d", { alpha: false })!;
      ctx.imageSmoothingQuality = "high";

      const cropX = usedCrop.x * scaleX;
      const cropY = usedCrop.y * scaleY;
      const centerX = img.naturalWidth / 2;
      const centerY = img.naturalHeight / 2;

      ctx.save();
      
      // If we are downscaling to fit MAX_DIM, apply it here
      ctx.scale(drawScale, drawScale);
      
      // Move crop origin to canvas origin (0,0)
      ctx.translate(-cropX, -cropY);
      
      // Apply transforms from center
      ctx.translate(centerX, centerY);
      ctx.rotate((rotate * Math.PI) / 180);
      ctx.scale(scale, scale);
      ctx.translate(-centerX, -centerY);

      ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight);
      ctx.restore();

      canvas.toBlob((blob) => {
      setIsProcessing(false);
      if (!blob) return;
      const file = new File([blob], "cover-cropped.jpg", { type: "image/jpeg" });
      const state: CropState = { crop, completedCrop, scale, rotate };
      onDone(file, URL.createObjectURL(blob), state);
      }, "image/jpeg", 0.92);
  } catch (error) {
      console.error("Canvas crop failed:", error);
      setIsProcessing(false);
      alert("Failed to crop image. This usually happens if the image source blocks access. Try clicking 'Sync Preview' first.");
  }
  };

 const zoomPct = Math.round(scale * 100);

 return (
 <div
 className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
 style={{ contain: "strict" }}
 onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
 >
 <div className="w-full max-w-sm bg-[#111113] rounded-2xl border border-white/10 shadow-2xl overflow-hidden">

 {/* Header */}
 <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
 <p className="text-[12px] font-bold text-white">Crop Cover Art</p>
 <div className="flex items-center gap-2">
 <button type="button"
 onClick={resetAll}
 className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-colors text-[9px] font-bold uppercase tracking-widest"
 >
 <RefreshCw size={9} /> Reset All
 </button>
 <button type="button"
 onClick={onClose}
 className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white transition-colors"
 >
 <X size={13} />
 </button>
 </div>
 </div>

 {/* Crop canvas */}
 <div className="flex items-center justify-center bg-black/60 overflow-hidden" style={{ maxHeight: 260 }}>
 <ReactCrop
 crop={crop}
 onChange={(c) => setCrop(c)}
 onComplete={(c) => setCompletedCrop(c)}
 aspect={aspectRatio}
 minWidth={40}
 minHeight={40}
 >
 <img
 ref={imgRef}
 src={src}
 alt="Crop preview"
 crossOrigin="anonymous"
 onLoad={onImageLoad}
 style={{
 maxHeight: 260,
 objectFit: "contain",
 transform: `translate3d(0,0,0) scale(${scale}) rotate(${rotate}deg)`,
 willChange: "transform",
 transformOrigin: "center center",
 }}
 />
 </ReactCrop>
 </div>

 {/* Controls */}
 <div className="px-4 pt-3 pb-4 space-y-2.5 border-t border-white/[0.06]">

 {/* Zoom */}
 <div className="flex items-center gap-2">
 <span className="w-9 text-[9px] font-bold text-white/25 uppercase tracking-widest shrink-0">Zoom</span>
 <button type="button" onClick={() => setScale(s => Math.max(0.5, +(s - 0.1).toFixed(1)))} className="shrink-0 w-6 h-6 rounded-md bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white transition-colors">
 <ZoomOut size={11} />
 </button>
 <input
 type="range" min={0.5} max={3} step={0.05} value={scale}
 onChange={(e) => setScale(+e.target.value)}
 className="flex-1 h-1 cursor-pointer rounded-full appearance-none accent-brand"
 style={{ background: `linear-gradient(to right,var(--accent-brand) ${((scale - 0.5) / 2.5) * 100}%,rgba(255,255,255,.06) ${((scale - 0.5) / 2.5) * 100}%)` }}
 />
 <button type="button" onClick={() => setScale(s => Math.min(3, +(s + 0.1).toFixed(1)))} className="shrink-0 w-6 h-6 rounded-md bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white transition-colors">
 <ZoomIn size={11} />
 </button>
 <button type="button" onClick={() => setScale(1)} title="Reset zoom" className="shrink-0 w-5 h-5 rounded-md hover:bg-zinc-900/10 flex items-center justify-center text-brand/20 hover:text-brand transition-colors">
 <RefreshCw size={9} />
 </button>
 <span className="w-8 text-right text-[9px] font-bold text-white/20 tabular-nums shrink-0">{zoomPct}%</span>
 </div>

 {/* Rotate */}
 <div className="flex items-center gap-2">
 <span className="w-9 text-[9px] font-bold text-white/25 uppercase tracking-widest shrink-0">Rotate</span>
 <button type="button" onClick={() => setRotate(r => r - 90)} className="shrink-0 w-6 h-6 rounded-md bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white transition-colors">
 <RotateCcw size={11} />
 </button>
 <input
 type="range" min={-180} max={180} step={1} value={rotate}
 onChange={(e) => setRotate(+e.target.value)}
 className="flex-1 h-1 cursor-pointer rounded-full appearance-none accent-brand"
 style={{ background: `linear-gradient(to right,var(--accent-brand) ${((rotate + 180) / 360) * 100}%,rgba(255,255,255,.06) ${((rotate + 180) / 360) * 100}%)` }}
 />
 <button type="button" onClick={() => setRotate(r => r + 90)} className="shrink-0 w-6 h-6 rounded-md bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white transition-colors">
 <RotateCw size={11} />
 </button>
 <button type="button" onClick={() => setRotate(0)} title="Reset rotation" className="shrink-0 w-5 h-5 rounded-md hover:bg-zinc-900/10 flex items-center justify-center text-brand/20 hover:text-brand transition-colors">
 <RefreshCw size={9} />
 </button>
 <span className="w-8 text-right text-[9px] font-bold text-white/20 tabular-nums shrink-0">{rotate}°</span>
 </div>

 {/* Action buttons */}
 <div className="flex gap-2 pt-1">
 <button type="button"
 onClick={onClose}
 className="flex-1 py-2 rounded-xl bg-white/5 border border-white/10 text-white/50 hover:text-white text-[11px] font-bold uppercase tracking-widest transition-colors hover:bg-white/10"
 >
 Cancel
 </button>
 <button type="button"
 onClick={handleApply}
 disabled={isProcessing}
 className="flex-1 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-900 disabled:opacity-40 text-brand text-[11px] font-bold uppercase tracking-widest transition-colors active:scale-[0.98] flex items-center justify-center gap-1.5 shadow-lg shadow-brand/20"
 >
 <Check size={12} />
 {isProcessing ? "Applying…" : "Apply"}
 </button>
 </div>
 </div>
 </div>
 </div>
 );
});
