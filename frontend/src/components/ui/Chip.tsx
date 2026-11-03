import React from "react";
import { cn } from "@/lib/utils";

export interface ChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  icon?: React.ElementType;
}

export function Chip({
  children,
  active = false,
  icon: Icon,
  className,
  onClick,
  ...props
}: ChipProps) {
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(10);
    }
    onClick?.(e);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full text-[13px] font-medium transition-all duration-150 select-none outline-none cursor-pointer active:scale-95",
        active
          ? "bg-white text-black font-semibold shadow-sm"
          : "bg-white/[0.08] hover:bg-white/[0.14] text-white/80 hover:text-white border border-white/[0.08]",
        className
      )}
      {...props}
    >
      {Icon && <Icon className="w-3.5 h-3.5" />}
      <span>{children}</span>
    </button>
  );
}

