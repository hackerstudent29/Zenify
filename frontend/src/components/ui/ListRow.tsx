import React from "react";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";

export interface ListRowProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  icon?: React.ElementType;
  tint?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  trailing?: React.ReactNode;
  showChevron?: boolean;
  interactive?: boolean;
}

export function ListRow({
  icon: Icon,
  tint = "text-white/70 bg-white/10",
  title,
  subtitle,
  trailing,
  showChevron = false,
  interactive = false,
  className,
  onClick,
  ...props
}: ListRowProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "flex items-center gap-3.5 px-4 py-3 min-h-[52px]",
        "rounded-[12px] transition-colors duration-150 select-none",
        interactive && "cursor-pointer hover:bg-white/[0.06] active:bg-white/[0.1] active:scale-[0.99]",
        className
      )}
      {...props}
    >
      {Icon && (
        <div
          className={cn(
            "w-9 h-9 rounded-[9px] flex items-center justify-center shrink-0 border border-white/[0.08]",
            tint
          )}
        >
          <Icon className="w-5 h-5" />
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className="text-[15px] font-semibold text-white tracking-tight leading-tight truncate">
          {title}
        </div>
        {subtitle && (
          <div className="text-[13px] text-white/50 leading-normal truncate mt-0.5">
            {subtitle}
          </div>
        )}
      </div>

      {trailing && <div className="shrink-0 flex items-center gap-2">{trailing}</div>}

      {showChevron && (
        <ChevronRight className="w-4 h-4 text-white/30 shrink-0 ml-1" />
      )}
    </div>
  );
}
