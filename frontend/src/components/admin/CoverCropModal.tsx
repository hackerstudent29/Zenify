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
    onDone: (croppedFile: File, previewUrl: string, state: CropState) => void;
    onCancel: () => void;
}

function initCrop(w: number, h: number): Crop {
    return centerCrop(makeAspectCrop({ unit: "%", width: 85 }, 1, w, h), w, h);
}

export const CoverCropModal = memo(function CoverCropModal({
    rawSrc,
    initialState,
    onDone,
    onCancel,
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
            setCrop(initCrop(w, h));
        }
    }, [initialState?.completedCrop]);

    const resetAll = () => {
        setScale(1);
        setRotate(0);
        if (imgRef.current) {
            const { naturalWidth: w, naturalHeight: h } = imgRef.current;
            setCrop(initCrop(w, h));
            setCompletedCrop(undefined);
        }
    };

    const handleApply = () => {
        // Allow apply even if user hasn't dragged (use last completedCrop or wait for image)
        const img = imgRef.current;
        if (!img) return;

        setIsProcessing(true);

        // If completedCrop is not set yet (e.g. re-crop with saved state but no drag),
        // we must trigger onComplete by temporarily resetting crop — simplest is just
        // use the full image as fallback.
        const usedCrop = completedCrop ?? (() => {
            const w = img.width;
            const h = Math.min(img.width, img.height);
            return { unit: "px" as const, x: 0, y: 0, width: w, height: h };
        })();

        const canvas = document.createElement("canvas");
        const SIZE = 1000;
        canvas.width = SIZE;
        canvas.height = SIZE;
        const ctx = canvas.getContext("2d")!;
        const scaleX = img.naturalWidth / img.width;
        const scaleY = img.naturalHeight / img.height;

        ctx.save();
        if (rotate !== 0) {
            ctx.translate(SIZE / 2, SIZE / 2);
            ctx.rotate((rotate * Math.PI) / 180);
            ctx.translate(-SIZE / 2, -SIZE / 2);
        }
        ctx.drawImage(
            img,
            usedCrop.x * scaleX,
            usedCrop.y * scaleY,
            usedCrop.width * scaleX,
            usedCrop.height * scaleY,
            0, 0, SIZE, SIZE,
        );
        ctx.restore();

        canvas.toBlob((blob) => {
            setIsProcessing(false);
            if (!blob) return;
            const file = new File([blob], "cover-cropped.jpg", { type: "image/jpeg" });
            const state: CropState = { crop, completedCrop, scale, rotate };
            onDone(file, URL.createObjectURL(blob), state);
        }, "image/jpeg", 0.92);
    };

    const zoomPct = Math.round(scale * 100);

    return (
        <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
            style={{ contain: "strict" }}
            onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
        >
            <div className="w-full max-w-sm bg-[#111113] rounded-2xl border border-white/10 shadow-2xl overflow-hidden">

                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
                    <p className="text-[12px] font-bold text-white">Crop Cover Art</p>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={resetAll}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-colors text-[9px] font-bold uppercase tracking-widest"
                        >
                            <RefreshCw size={9} /> Reset All
                        </button>
                        <button
                            onClick={onCancel}
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
                        aspect={1}
                        minWidth={40}
                        minHeight={40}
                    >
                        <img
                            ref={imgRef}
                            src={rawSrc}
                            alt="Crop preview"
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
                        <button onClick={() => setScale(s => Math.max(0.5, +(s - 0.1).toFixed(1)))} className="shrink-0 w-6 h-6 rounded-md bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white transition-colors">
                            <ZoomOut size={11} />
                        </button>
                        <input
                            type="range" min={0.5} max={3} step={0.05} value={scale}
                            onChange={(e) => setScale(+e.target.value)}
                            className="flex-1 h-1 cursor-pointer rounded-full appearance-none accent-rose-500"
                            style={{ background: `linear-gradient(to right,#f43f5e ${((scale - 0.5) / 2.5) * 100}%,rgba(255,255,255,.06) ${((scale - 0.5) / 2.5) * 100}%)` }}
                        />
                        <button onClick={() => setScale(s => Math.min(3, +(s + 0.1).toFixed(1)))} className="shrink-0 w-6 h-6 rounded-md bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white transition-colors">
                            <ZoomIn size={11} />
                        </button>
                        <button onClick={() => setScale(1)} title="Reset zoom" className="shrink-0 w-5 h-5 rounded-md hover:bg-rose-500/10 flex items-center justify-center text-white/20 hover:text-rose-400 transition-colors">
                            <RefreshCw size={9} />
                        </button>
                        <span className="w-8 text-right text-[9px] font-bold text-white/20 tabular-nums shrink-0">{zoomPct}%</span>
                    </div>

                    {/* Rotate */}
                    <div className="flex items-center gap-2">
                        <span className="w-9 text-[9px] font-bold text-white/25 uppercase tracking-widest shrink-0">Rotate</span>
                        <button onClick={() => setRotate(r => r - 90)} className="shrink-0 w-6 h-6 rounded-md bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white transition-colors">
                            <RotateCcw size={11} />
                        </button>
                        <input
                            type="range" min={-180} max={180} step={1} value={rotate}
                            onChange={(e) => setRotate(+e.target.value)}
                            className="flex-1 h-1 cursor-pointer rounded-full appearance-none accent-rose-500"
                            style={{ background: `linear-gradient(to right,#f43f5e ${((rotate + 180) / 360) * 100}%,rgba(255,255,255,.06) ${((rotate + 180) / 360) * 100}%)` }}
                        />
                        <button onClick={() => setRotate(r => r + 90)} className="shrink-0 w-6 h-6 rounded-md bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white transition-colors">
                            <RotateCw size={11} />
                        </button>
                        <button onClick={() => setRotate(0)} title="Reset rotation" className="shrink-0 w-5 h-5 rounded-md hover:bg-rose-500/10 flex items-center justify-center text-white/20 hover:text-rose-400 transition-colors">
                            <RefreshCw size={9} />
                        </button>
                        <span className="w-8 text-right text-[9px] font-bold text-white/20 tabular-nums shrink-0">{rotate}°</span>
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-2 pt-1">
                        <button
                            onClick={onCancel}
                            className="flex-1 py-2 rounded-xl bg-white/5 border border-white/10 text-white/50 hover:text-white text-[11px] font-bold uppercase tracking-widest transition-colors hover:bg-white/10"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleApply}
                            disabled={isProcessing}
                            className="flex-1 py-2 rounded-xl bg-rose-500 hover:bg-rose-400 disabled:opacity-40 text-white text-[11px] font-bold uppercase tracking-widest transition-colors active:scale-[0.98] flex items-center justify-center gap-1.5 shadow-lg shadow-rose-500/20"
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
