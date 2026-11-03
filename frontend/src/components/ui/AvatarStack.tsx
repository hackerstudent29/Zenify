import React from "react";
import { cn } from "@/lib/utils";

export interface AvatarItem {
  id: string;
  name: string;
  avatarUrl?: string | null;
}

export interface AvatarStackProps {
  avatars: AvatarItem[];
  max?: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function AvatarStack({
  avatars,
  max = 4,
  size = "md",
  className,
}: AvatarStackProps) {
  const visible = avatars.slice(0, max);
  const overflow = avatars.length - max;

  const sizeClass =
    size === "sm"
      ? "w-6 h-6 text-[10px]"
      : size === "lg"
      ? "w-10 h-10 text-[14px]"
      : "w-8 h-8 text-[12px]";

  const overlapClass =
    size === "sm" ? "-ml-1.5" : size === "lg" ? "-ml-3" : "-ml-2";

  return (
    <div className={cn("flex items-center", className)}>
      {visible.map((av, idx) => (
        <div
          key={av.id || idx}
          className={cn(
            "relative rounded-full overflow-hidden border-2 border-[#1c1c1e] bg-zinc-800 flex items-center justify-center font-bold text-white shrink-0",
            sizeClass,
            idx > 0 && overlapClass
          )}
          title={av.name}
        >
          {av.avatarUrl ? (
            <img
              src={av.avatarUrl}
              alt={av.name}
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLElement).style.display = "none";
              }}
            />
          ) : (
            <span>{av.name ? av.name.charAt(0).toUpperCase() : "U"}</span>
          )}
        </div>
      ))}

      {overflow > 0 && (
        <div
          className={cn(
            "relative rounded-full border-2 border-[#1c1c1e] bg-white/20 backdrop-blur-md flex items-center justify-center font-bold text-white shrink-0",
            sizeClass,
            overlapClass
          )}
        >
          +{overflow}
        </div>
      )}
    </div>
  );
}

