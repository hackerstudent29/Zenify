import React from "react";

export interface IconProps extends React.SVGProps<SVGSVGElement> {
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
      <path d="M7 4.75v14.5c0 .85.92 1.38 1.66.95l12-7.25c.74-.46.74-1.54 0-1.99l-12-7.25c-.74-.43-1.66.1-1.66.95z" />
    </svg>
  );
}
export const SFPlay = SwiftUIPlay;

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
      <rect x="6" y="4.5" width="3.75" height="15" rx="1.5" />
      <rect x="14.25" y="4.5" width="3.75" height="15" rx="1.5" />
    </svg>
  );
}
export const SFPause = SwiftUIPause;

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
export const SFForward = SwiftUIForward;

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
export const SFBackward = SwiftUIBackward;

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
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      <path d="M3 7h2.6c2 0 3.3.9 4.3 2.4l3.2 5.2c1 1.5 2.3 2.4 4.3 2.4H20" />
      <path d="M3 17h2.6c2 0 3.3-.9 4.3-2.4l3.2-5.2c1-1.5 2.3-2.4 4.3-2.4H20" />
      <path d="M17.2 4.4L20.2 7l-3 2.6" />
      <path d="M17.2 14.4L20.2 17l-3 2.6" />
    </svg>
  );
}
export const SFShuffle = SwiftUIShuffle;

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
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      <path d="M4 11v-1a3 3 0 0 1 3-3h12.2" />
      <path d="M16.4 4.4L19.4 7l-3 2.6" />
      <path d="M20 13v1a3 3 0 0 1-3 3H4.8" />
      <path d="M7.6 14.4L4.6 17l3 2.6" />
    </svg>
  );
}
export const SFRepeat = SwiftUIRepeat;

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
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      <path d="M4 11v-1a3 3 0 0 1 3-3h12.2" />
      <path d="M16.4 4.4L19.4 7l-3 2.6" />
      <path d="M20 13v1a3 3 0 0 1-3 3H4.8" />
      <path d="M7.6 14.4L4.6 17l3 2.6" />
      <path d="M11 10.5h1.5v4" strokeWidth="2" />
    </svg>
  );
}
export const SFRepeatOne = SwiftUIRepeatOne;

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
      strokeWidth={2.2}
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
export const SFQueue = SwiftUIQueue;

/**
 * Apple Music Swift UI (SF Symbols) Lyrics: `quote.bubble`
 */
export function SwiftUILyrics({ size = 20, className = "", stroke = "currentColor", ...props }: IconProps & { stroke?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      <path d="M5 4h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-7l-5 4v-4H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
      <path d="M8 9h8M8 12.5h5" />
    </svg>
  );
}
export const SFLyrics = SwiftUILyrics;

/**
 * Apple Music Swift UI (SF Symbols) Studio FX / Equalizer / Sliders: `slider.horizontal.3`
 */
export function SwiftUIFx({ size = 20, className = "", stroke = "currentColor", ...props }: IconProps & { stroke?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth={2}
      strokeLinecap="round"
      className={className}
      {...props}
    >
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </svg>
  );
}
export const SFFx = SwiftUIFx;

/**
 * Apple Music Swift UI (SF Symbols) Speaker / Volume: `speaker.wave.2.fill`
 */
export function SwiftUISpeaker({
  size = 20,
  level = 1,
  className = "",
  stroke = "currentColor",
  fill = "currentColor",
  ...props
}: IconProps & { level?: number; stroke?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4z" fill={fill} />
      {level === 0 ? (
        <path d="M16 9.5l5 5M21 9.5l-5 5" />
      ) : (
        <>
          <path d="M15.5 9a4 4 0 0 1 0 6" />
          {level > 0.5 && <path d="M18.2 6.5a8 8 0 0 1 0 11" />}
        </>
      )}
    </svg>
  );
}
export const SFSpeaker = SwiftUISpeaker;

/**
 * Apple Music Swift UI (SF Symbols) Expand / Fullscreen: `arrow.up.left.and.arrow.down.right`
 */
export function SwiftUIExpand({ size = 20, className = "", stroke = "currentColor", ...props }: IconProps & { stroke?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      <path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" />
    </svg>
  );
}
export const SFExpand = SwiftUIExpand;

/**
 * Apple Music Swift UI (SF Symbols) Info: `info.circle`
 */
export function SwiftUIInfo({ size = 20, className = "", stroke = "currentColor", ...props }: IconProps & { stroke?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" strokeWidth={2.5} />
    </svg>
  );
}
export const SFInfo = SwiftUIInfo;

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
export const SFEllipsis = SwiftUIEllipsis;

/**
 * Apple Music Swift UI (SF Symbols) Heart: `heart` / `heart.fill`
 * Universal heart symbol used across the global player and everywhere in Zenify.
 */
export function SwiftUIHeart({
  size = 20,
  filled,
  className = "",
  fill,
  stroke = "currentColor",
  strokeWidth = 2,
  ...props
}: IconProps & { filled?: boolean; stroke?: string; strokeWidth?: number }) {
  const isFilled = filled !== undefined ? filled : (fill && fill !== "none") || (className && className.includes("fill-"));
  const finalFill = isFilled ? (fill && fill !== "none" ? fill : "currentColor") : (fill || "none");
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={finalFill}
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      <path d="M12 21s-7-4.35-9.5-9C.9 8.6 2.6 4.5 6.5 4.5c2.1 0 3.9 1.1 5.5 3.2 1.6-2.1 3.4-3.2 5.5-3.2 3.9 0 5.6 4.1 4 7.5-2.5 4.65-9.5 9-9.5 9z" />
    </svg>
  );
}
export const SFHeart = SwiftUIHeart;

/**
 * Apple Music Swift UI (SF Symbols) Home: `house.fill` / `house`
 */
export function SwiftUIHome({
  size = 20,
  className = "",
  fill = "none",
  fillOpacity,
  stroke = "currentColor",
  strokeWidth = 1.8,
  ...props
}: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      fillOpacity={fillOpacity}
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      <path d="M3 10.5L12 3l9 7.5V20a1.5 1.5 0 0 1-1.5 1.5h-4.5a1 1 0 0 1-1-1v-4.5a1 1 0 0 0-1-1h-2a1 1 0 0 0-1 1V20a1 1 0 0 1-1 1H4.5A1.5 1.5 0 0 1 3 20v-9.5z" />
    </svg>
  );
}
export const SFHome = SwiftUIHome;

/**
 * Apple Music Swift UI (SF Symbols) Discover / Safari: `safari` / `compass`
 */
export function SwiftUICompass({
  size = 20,
  className = "",
  fill = "none",
  fillOpacity,
  stroke = "currentColor",
  strokeWidth = 1.8,
  ...props
}: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      fillOpacity={fillOpacity}
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      <circle cx="12" cy="12" r="9.5" />
      <polygon
        points="15.8 8.2 13.5 13.5 8.2 15.8 10.5 10.5 15.8 8.2"
        fill={fill !== "none" ? fill : "currentColor"}
        fillOpacity={fillOpacity !== undefined ? fillOpacity : 0.3}
      />
    </svg>
  );
}
export const SFCompass = SwiftUICompass;

/**
 * Apple Music Swift UI (SF Symbols) Playlists: `music.note.list`
 */
export function SwiftUIPlaylists({
  size = 20,
  className = "",
  fill = "none",
  fillOpacity,
  stroke = "currentColor",
  strokeWidth = 1.8,
  ...props
}: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      fillOpacity={fillOpacity}
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      <path d="M21 15V6a2 2 0 0 0-2-2H9" />
      <path d="M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" />
      <path d="M3 6h12" />
      <path d="M3 10h12" />
    </svg>
  );
}
export const SFPlaylists = SwiftUIPlaylists;

/**
 * Apple Music Swift UI (SF Symbols) Artists: `person.2.fill` / `person.crop.circle`
 * Distinctive multi-artist / musician avatar silhouette replacing generic microphone.
 */
export function SwiftUIArtist({
  size = 20,
  className = "",
  fill = "none",
  fillOpacity,
  stroke = "currentColor",
  strokeWidth = 1.8,
  ...props
}: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      fillOpacity={fillOpacity}
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      <circle cx="9" cy="7.5" r="3.75" />
      <path d="M2.5 19.5c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5" />
      <path d="M15.5 4.5a3.75 3.75 0 0 1 0 7" />
      <path d="M21.5 19.5c0-3.1-2.2-5.6-5.2-6.2" />
    </svg>
  );
}
export const SFArtist = SwiftUIArtist;

/**
 * Apple Music Swift UI (SF Symbols) Device / Storage: `internaldrive`
 */
export function SwiftUIDevice({
  size = 20,
  className = "",
  fill = "none",
  fillOpacity,
  stroke = "currentColor",
  strokeWidth = 1.8,
  ...props
}: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      fillOpacity={fillOpacity}
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <line x1="7" y1="15" x2="7.01" y2="15" strokeWidth={2.5} />
      <line x1="16" y1="15" x2="18" y2="15" />
    </svg>
  );
}
export const SFDevice = SwiftUIDevice;

/**
 * Apple Music Swift UI (SF Symbols) Settings: `gearshape.fill`
 */
export function SwiftUISettings({
  size = 20,
  className = "",
  fill = "none",
  fillOpacity,
  stroke = "currentColor",
  strokeWidth = 1.8,
  ...props
}: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      fillOpacity={fillOpacity}
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
export const SFSettings = SwiftUISettings;

/**
 * Apple Music Swift UI (SF Symbols) Shield / Admin: `shield.checkered`
 */
export function SwiftUIAdmin({
  size = 20,
  className = "",
  fill = "none",
  fillOpacity,
  stroke = "currentColor",
  strokeWidth = 1.8,
  ...props
}: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      fillOpacity={fillOpacity}
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}
export const SFAdmin = SwiftUIAdmin;

