import React from "react";
import { cn } from "@/lib/utils";

export interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "card" | "hero" | "subtle";
  interactive?: boolean;
}

export const GlassCard = React.forwardRef<HTMLDivElement, GlassCardProps>(
  ({ className, variant = "card", interactive = false, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "relative overflow-hidden transition-all duration-200",
          "backdrop-blur-[24px] saturate-[180%]",
          "border border-white/[0.12] dark:border-white/[0.12] border-black/[0.08] light:border-black/[0.08]",
          variant === "card" && "rounded-[16px] bg-white/[0.05] dark:bg-white/[0.05] bg-black/[0.03]",
          variant === "hero" && "rounded-[28px] bg-white/[0.08] dark:bg-white/[0.08] bg-black/[0.04] shadow-[0_20px_50px_rgba(0,0,0,0.3)]",
          variant === "subtle" && "rounded-[12px] bg-white/[0.03] dark:bg-white/[0.03] bg-black/[0.02]",
          interactive && "cursor-pointer hover:bg-white/[0.08] active:scale-[0.99] active:transition-transform",
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);
GlassCard.displayName = "GlassCard";

