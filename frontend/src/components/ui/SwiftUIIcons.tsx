import React from "react";

interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
  className?: string;
  fill?: string;
}

/**
 * Apple Music Swift UI (SF Symbols) Play Icon: `play.fill`
 */
export function SwiftUIPlay({ size = 20, className = "", fill = "currentColor", ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      className={className}
      {...props}
    >
      <path d="M7.05 4.437C6.015 3.805 4.67 4.55 4.67 5.764v12.472c0 1.214 1.345 1.96 2.38 1.327l10.825-6.236c1.077-.621 1.077-2.173 0-2.794L7.05 4.437z" />
    </svg>
  );
}

/**
 * Apple Music Swift UI (SF Symbols) Pause Icon: `pause.fill`
 */
export function SwiftUIPause({ size = 20, className = "", fill = "currentColor", ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      className={className}
      {...props}
    >
      <path d="M5.75 4.5A1.75 1.75 0 0 0 4 6.25v11.5c0 .966.784 1.75 1.75 1.75h2.5A1.75 1.75 0 0 0 10 17.75V6.25A1.75 1.75 0 0 0 8.25 4.5h-2.5zm8.5 0A1.75 1.75 0 0 0 12.5 6.25v11.5c0 .966.784 1.75 1.75 1.75h2.5a1.75 1.75 0 0 0 1.75-1.75V6.25A1.75 1.75 0 0 0 16.75 4.5h-2.5z" />
    </svg>
  );
}

/**
 * Apple Music Swift UI (SF Symbols) Forward / Next Track: `forward.fill`
 */
export function SwiftUIForward({ size = 20, className = "", fill = "currentColor", ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      className={className}
      {...props}
    >
      <path d="M4.65 5.518a1.2 1.2 0 0 0-1.85 1.025v10.914a1.2 1.2 0 0 0 1.85 1.025l8.15-5.457a1.2 1.2 0 0 0 0-2.05L4.65 5.518zm8.5 0a1.2 1.2 0 0 0-1.85 1.025v10.914a1.2 1.2 0 0 0 1.85 1.025l8.15-5.457a1.2 1.2 0 0 0 0-2.05l-8.15-5.457z" />
    </svg>
  );
}

/**
 * Apple Music Swift UI (SF Symbols) Backward / Previous Track: `backward.fill`
 */
export function SwiftUIBackward({ size = 20, className = "", fill = "currentColor", ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      className={className}
      {...props}
    >
      <path d="M19.35 18.482a1.2 1.2 0 0 0 1.85-1.025V6.543a1.2 1.2 0 0 0-1.85-1.025l-8.15 5.457a1.2 1.2 0 0 0 0 2.05l8.15 5.457zm-8.5 0a1.2 1.2 0 0 0 1.85-1.025V6.543a1.2 1.2 0 0 0-1.85-1.025l-8.15 5.457a1.2 1.2 0 0 0 0 2.05l8.15 5.457z" />
    </svg>
  );
}

/**
 * Apple Music Swift UI (SF Symbols) Shuffle: `shuffle`
 */
export function SwiftUIShuffle({ size = 20, className = "", stroke = "currentColor", ...props }: IconProps & { stroke?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      <path d="M16 3h5v5" />
      <path d="M4 20L21 3" />
      <path d="M21 16v5h-5" />
      <path d="M15 15l6 6" />
      <path d="M4 4l5 5" />
    </svg>
  );
}

/**
 * Apple Music Swift UI (SF Symbols) Repeat Loop: `repeat`
 */
export function SwiftUIRepeat({ size = 20, className = "", stroke = "currentColor", ...props }: IconProps & { stroke?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      <path d="M17 1l4 4-4 4" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <path d="M7 23l-4-4 4-4" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  );
}

/**
 * Apple Music Swift UI (SF Symbols) Repeat One: `repeat.1`
 */
export function SwiftUIRepeatOne({ size = 20, className = "", stroke = "currentColor", ...props }: IconProps & { stroke?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      <path d="M17 1l4 4-4 4" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <path d="M7 23l-4-4 4-4" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
      <path d="M11 10.5h1.5v4" strokeWidth="2" />
    </svg>
  );
}

/**
 * Apple Music Swift UI (SF Symbols) Queue: `music.note.list`
 */
export function SwiftUIQueue({ size = 20, className = "", stroke = "currentColor", ...props }: IconProps & { stroke?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <path d="M3 6h.01" strokeWidth="3" />
      <path d="M3 12h.01" strokeWidth="3" />
      <path d="M3 18h.01" strokeWidth="3" />
    </svg>
  );
}

/**
 * Apple Music Swift UI More Options: `ellipsis`
 */
export function SwiftUIEllipsis({ size = 20, className = "", fill = "currentColor", ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      className={className}
      {...props}
    >
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
    </svg>
  );
}
