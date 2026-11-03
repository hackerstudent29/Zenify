import React from "react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  icon: React.ElementType;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center p-8 min-h-[260px]",
        className
      )}
    >
      <div className="w-16 h-16 rounded-full bg-white/[0.06] border border-white/[0.1] flex items-center justify-center text-white/60 mb-4 shadow-inner">
        <Icon className="w-8 h-8" />
      </div>

      <h3 className="text-[19px] font-bold text-white tracking-tight mb-1.5">
        {title}
      </h3>

      {description && (
        <p className="text-[14px] text-white/50 max-w-sm mb-6 leading-relaxed">
          {description}
        </p>
      )}

      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="h-10 px-5 rounded-full bg-white text-black text-[13px] font-semibold hover:bg-white/90 active:scale-95 transition-all cursor-pointer shadow-md"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

