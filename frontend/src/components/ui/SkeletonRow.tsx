import React from "react";
import { cn } from "@/lib/utils";

export interface SkeletonRowProps {
  className?: string;
  hasCover?: boolean;
}

export function SkeletonRow({ className, hasCover = true }: SkeletonRowProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-3.5 px-4 py-3 min-h-[52px] rounded-[12px] animate-pulse",
        className
      )}
    >
      {hasCover && (
        <div className="w-10 h-10 rounded-[8px] bg-white/[0.08] shrink-0" />
      )}

      <div className="flex-1 space-y-2">
        <div className="h-3.5 bg-white/[0.12] rounded-md w-3/5" />
        <div className="h-2.5 bg-white/[0.06] rounded-md w-2/5" />
      </div>

      <div className="w-10 h-3 bg-white/[0.06] rounded-md shrink-0" />
    </div>
  );
}

