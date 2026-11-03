"use client";

import React from "react";
import { BottomSheet } from "./BottomSheet";
import { AlertTriangle } from "lucide-react";

export interface ConfirmSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDestructive?: boolean;
}

export function ConfirmSheet({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  isDestructive = false,
}: ConfirmSheetProps) {
  const handleConfirm = () => {
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(10);
    }
    onConfirm();
    onClose();
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} detent="auto" title={title}>
      <div className="flex flex-col items-center text-center py-2">
        {isDestructive && (
          <div className="w-12 h-12 rounded-full bg-rose-500/15 border border-rose-500/20 flex items-center justify-center text-rose-400 mb-3">
            <AlertTriangle className="w-6 h-6" />
          </div>
        )}

        <p className="text-[14px] text-white/60 mb-6 max-w-sm leading-relaxed">
          {message}
        </p>

        <div className="flex flex-col w-full gap-2.5">
          <button
            type="button"
            onClick={handleConfirm}
            className={`w-full h-11 rounded-[14px] font-semibold text-[14px] transition-all cursor-pointer active:scale-[0.98] ${
              isDestructive
                ? "bg-rose-500 hover:bg-rose-600 text-white shadow-lg shadow-rose-500/20"
                : "bg-white text-black hover:bg-white/90"
            }`}
          >
            {confirmLabel}
          </button>

          <button
            type="button"
            onClick={onClose}
            className="w-full h-11 rounded-[14px] bg-white/[0.08] hover:bg-white/[0.12] text-white font-medium text-[14px] transition-all cursor-pointer active:scale-[0.98]"
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}

