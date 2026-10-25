"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ElementType,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  motion,
  AnimatePresence,
  MotionConfig,
  useDragControls,
  type Variants,
  type Transition,
} from "framer-motion";
import * as Slider from "@radix-ui/react-slider";
import { X, ChevronLeft, Loader2, Check } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/* ==========================================================================
   Motion. Only transform + opacity are animated (compositor only, no reflow).
   No filter/blur animation, no backdrop-filter on anything that moves.
   ========================================================================== */
const SPRING_WINDOW: Transition = { type: "spring", stiffness: 380, damping: 32, mass: 0.85 };
const SPRING_SHEET: Transition = { type: "spring", stiffness: 340, damping: 36, mass: 0.9 };
const SPRING_CONTENT: Transition = { type: "spring", stiffness: 420, damping: 36, mass: 0.7 };
const SPRING_PILL: Transition = { type: "spring", stiffness: 560, damping: 40, mass: 0.7 };
const SPRING_KNOB: Transition = { type: "spring", stiffness: 700, damping: 35, mass: 0.6 };
const EXIT_EASE = [0.4, 0, 1, 1] as const;

const windowV: Variants = {
  initial: { opacity: 0, scale: 0.96, y: 12 },
  animate: { opacity: 1, scale: 1, y: 0, transition: SPRING_WINDOW },
  exit: { opacity: 0, scale: 0.98, y: 6, transition: { duration: 0.16, ease: EXIT_EASE } },
};
const sheetV: Variants = {
  initial: { y: "100%" },
  animate: { y: 0, transition: SPRING_SHEET },
  exit: { y: "100%", transition: { duration: 0.24, ease: [0.4, 0, 0.9, 0.4] } },
};

/* ==========================================================================
   Kept for API compatibility with other screens that import them
   ========================================================================== */
export const TINT = {
  blue: "#0a84ff",
  green: "#30d158",
  red: "#ff453a",
  pink: "#ff375f",
  purple: "#bf5af2",
  orange: "#ff9f0a",
  teal: "#40c8e0",
  indigo: "#5e5ce6",
  gray: "#8e8e93",
} as const;

export function TintIcon({
  icon: Icon,
  tint = TINT.gray,
  size = 28,
}: {
  icon: ElementType;
  tint?: string;
  size?: number;
}) {
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center text-white"
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.26), background: tint }}
    >
      <Icon size={Math.round(size * 0.55)} strokeWidth={2.2} />
    </span>
  );
}

/* ==========================================================================
   Window shell
   - Desktop: centered window, spring scale-in, tabs in the title bar
   - Mobile : bottom sheet, spring slide-up, drag the handle to dismiss
   ========================================================================== */
export type NavItem = {
  id: string;
  label: string;
  icon: ElementType;
  tint?: string;
  desktopOnly?: boolean;
};

type Status = "idle" | "saving" | "saved" | "error";

export function SettingsWindow({
  title,
  nav,
  backHref,
  backLabel = "Settings",
  reducedMotion = false,
  scrollKey,
  isOpen,
  onClose,
  children,
}: {
  title: string;
  nav?: { items: readonly NavItem[]; active: string; onSelect: (id: string) => void };
  /** @deprecated kept so existing callers still compile; saving feedback now lives on each Row */
  status?: Status;
  backHref?: string;
  backLabel?: string;
  reducedMotion?: boolean;
  scrollKey?: string;
  isOpen?: boolean;
  onClose?: () => void;
  children: ReactNode;
}) {
  const router = useRouter();
  // null until the client has measured, so SSR/hydration can never mismatch or flash the wrong layout
  const [mode, setMode] = useState<"window" | "sheet" | null>(null);
  const [internalOpen, setInternalOpen] = useState(isOpen !== undefined ? isOpen : true);
  const target = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const controls = useDragControls();

  useEffect(() => {
    if (isOpen !== undefined) setInternalOpen(isOpen);
  }, [isOpen]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const apply = () => setMode(mq.matches ? "sheet" : "window");
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // Lock page scroll without the page jumping sideways when the scrollbar disappears
  useEffect(() => {
    if (!internalOpen) return;
    const body = document.body;
    const prevOverflow = body.style.overflow;
    const prevPadding = body.style.paddingRight;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = "hidden";
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
    return () => {
      body.style.overflow = prevOverflow;
      body.style.paddingRight = prevPadding;
    };
  }, [internalOpen]);

  const close = useCallback((to?: string) => {
    target.current = to ?? null;
    setInternalOpen(false);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (document.body.dataset.recordingShortcut) return;
      close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  const finish = () => {
    if (onClose) {
      onClose();
      return;
    }
    const t = target.current;
    if (t) router.push(t);
    else if (window.history.length > 1) router.back();
    else router.push("/");
  };

  if (!mode) return null;
  const sheet = mode === "sheet";
  const sideW = backHref ? 88 : 40;

  return createPortal(
    <MotionConfig reducedMotion={reducedMotion ? "always" : "user"}>
      <AnimatePresence onExitComplete={finish}>
        {internalOpen && (
          <div key="settings-root" className="fixed inset-0 z-[9000]">
            {/* One static blur layer. Only its opacity animates. */}
            <motion.div
              aria-hidden
              className="absolute inset-0 bg-black/45 backdrop-blur-lg"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
              onPointerDown={() => close()}
            />

            <div
              className={cn(
                "pointer-events-none absolute inset-0 flex",
                sheet ? "items-end" : "items-center justify-center p-4"
              )}
            >
              <motion.div
                role="dialog"
                aria-modal="true"
                aria-label={title}
                variants={sheet ? sheetV : windowV}
                initial="initial"
                animate="animate"
                exit="exit"
                drag={sheet ? "y" : false}
                dragControls={controls}
                dragListener={false}
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={{ top: 0, bottom: 0.7 }}
                onDragEnd={(_, info) => {
                  if (info.offset.y > 120 || info.velocity.y > 600) close();
                }}
                style={{ paddingBottom: sheet ? "env(safe-area-inset-bottom)" : undefined }}
                className={cn(
                  "pointer-events-auto relative flex flex-col overflow-hidden text-white",
                  // Solid-ish surface: no backdrop-filter on the moving element, so it can never flicker
                  "bg-[#232326] border border-white/[0.09]",
                  "shadow-[0_30px_80px_rgba(0,0,0,0.6)]",
                  sheet
                    ? "h-[92dvh] w-full rounded-t-[24px]"
                    : "h-[min(620px,90vh)] w-[min(760px,94vw)] rounded-[20px]"
                )}
              >
                {/* Title bar: tabs live here */}
                <header className="relative z-10 shrink-0">
                  {sheet && (
                    <div
                      onPointerDown={(e) => controls.start(e)}
                      style={{ touchAction: "none" }}
                      className="flex h-6 cursor-grab items-center justify-center"
                    >
                      <span className="h-[5px] w-9 rounded-full bg-white/25" />
                    </div>
                  )}

                  <div className={cn("flex items-center gap-2 px-3", sheet ? "h-12" : "h-16")}>
                    <div className="flex shrink-0 items-center" style={{ width: sideW }}>
                      {backHref && (
                        <button
                          type="button"
                          onClick={() => close(backHref)}
                          className="flex h-8 cursor-pointer items-center rounded-full pl-1 pr-2 text-[13px] font-medium text-brand outline-none transition-opacity hover:opacity-70 focus-visible:ring-2 focus-visible:ring-white/30"
                        >
                          <ChevronLeft size={19} strokeWidth={2.6} />
                          {backLabel}
                        </button>
                      )}
                    </div>

                    {/* Top navigation: segmented tabs with a spring-sliding pill */}
                    <div className="no-scrollbar min-w-0 flex-1 overflow-x-auto" onPointerDown={(e) => e.stopPropagation()}>
                      {nav ? (
                        <div
                          role="tablist"
                          aria-label={title}
                          className="mx-auto flex w-max items-center gap-0.5 rounded-full bg-white/[0.06] p-[3px]"
                        >
                          {nav.items.map((item) => {
                            const active = nav.active === item.id;
                            const Icon = item.icon;
                            return (
                              <button
                                key={item.id}
                                type="button"
                                role="tab"
                                aria-selected={active}
                                onClick={(e) => {
                                  nav.onSelect(item.id);
                                  e.currentTarget.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
                                }}
                                className={cn(
                                  "relative z-10 h-8 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[13px] font-medium outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-white/30",
                                  item.desktopOnly ? "hidden md:flex" : "flex",
                                  active ? "text-white" : "text-white/55 hover:text-white/85"
                                )}
                              >
                                {active && (
                                  <motion.span
                                    layoutId="settings-tab-pill"
                                    transition={SPRING_PILL}
                                    className="absolute inset-0 -z-10 rounded-full bg-white/[0.16]"
                                  />
                                )}
                                <Icon size={15} strokeWidth={2} />
                                <span>{item.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <h2 className="text-center text-[14px] font-semibold tracking-tight text-white">{title}</h2>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center justify-end" style={{ width: sideW }}>
                      <motion.button
                        type="button"
                        aria-label="Close"
                        whileTap={{ scale: 0.88 }}
                        transition={SPRING_KNOB}
                        onClick={() => close()}
                        className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-white/[0.1] text-white/70 outline-none transition-colors hover:bg-white/[0.18] hover:text-white focus-visible:ring-2 focus-visible:ring-white/30"
                      >
                        <X size={14} strokeWidth={2.6} />
                      </motion.button>
                    </div>
                  </div>
                  <div className="h-px bg-white/[0.07]" />
                </header>

                {/* Content: fixed size window, so switching tabs never resizes or jumps */}
                <div
                  ref={scrollRef}
                  className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-10 pt-6 [scrollbar-gutter:stable] md:px-8"
                  style={{ WebkitOverflowScrolling: "touch" }}
                >
                  <div className="mx-auto w-full max-w-[560px]">
                    <AnimatePresence
                      mode="wait"
                      initial={false}
                      onExitComplete={() => scrollRef.current?.scrollTo({ top: 0 })}
                    >
                      <motion.div
                        key={scrollKey ?? "content"}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0, transition: SPRING_CONTENT }}
                        exit={{ opacity: 0, transition: { duration: 0.1 } }}
                      >
                        {children}
                      </motion.div>
                    </AnimatePresence>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </MotionConfig>,
    document.body
  );
}

/* ==========================================================================
   Content building blocks (flat, minimal)
   ========================================================================== */
export function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.02em] text-white">{title}</h1>
        {subtitle && <p className="mt-1 text-[13px] text-white/45">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

export function Group({
  header,
  footer,
  children,
}: {
  header?: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mb-7">
      {header && <h3 className="mb-2 px-1 text-[12px] font-medium text-white/40">{header}</h3>}
      <div className="divide-y divide-white/[0.06] overflow-hidden rounded-[14px] bg-white/[0.04]">
        {children}
      </div>
      {footer && <p className="mt-2 px-1 text-[12px] leading-snug text-white/35">{footer}</p>}
    </section>
  );
}

export function Row({
  label,
  description,
  icon: Icon,
  badge,
  isSaving,
  isSaved,
  className,
  children,
}: {
  label: string;
  description?: ReactNode;
  icon?: ElementType;
  /** @deprecated kept for compatibility, ignored in the minimal design */
  tint?: string;
  badge?: string;
  isSaving?: boolean;
  isSaved?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={cn("group flex min-h-[52px] items-center gap-4 px-4 py-3", className)}>
      {Icon && <Icon size={16} strokeWidth={2} className="shrink-0 text-white/45" />}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[14px] font-medium leading-tight text-white">{label}</span>
          {badge && (
            <span className="rounded-full bg-white/[0.08] px-1.5 py-px text-[10px] font-medium text-white/60">
              {badge}
            </span>
          )}
        </div>
        {description && <p className="mt-0.5 text-[12.5px] leading-snug text-white/45">{description}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {/* Fixed-size slot, both icons stacked and cross-faded with CSS: no layout shift, no mount/unmount flicker */}
        <span className="relative flex h-4 w-4 items-center justify-center" aria-hidden>
          <Loader2
            size={14}
            className={cn(
              "absolute text-white/45 transition-opacity duration-150",
              isSaving ? "animate-spin opacity-100" : "opacity-0"
            )}
          />
          <Check
            size={14}
            strokeWidth={2.6}
            className={cn(
              "absolute text-[#30d158] transition-opacity duration-200",
              !isSaving && isSaved ? "opacity-100" : "opacity-0"
            )}
          />
        </span>
        {children}
      </div>
    </div>
  );
}

/* ==========================================================================
   Controls
   ========================================================================== */
export function Toggle({
  checked,
  onCheckedChange,
  disabled,
  label,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  const [pressed, setPressed] = useState(false);
  const w = pressed ? 28 : 22;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
      className={cn(
        "relative h-[26px] w-[44px] shrink-0 cursor-pointer rounded-full outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-white/40 disabled:cursor-not-allowed disabled:opacity-40",
        checked ? "bg-[#30d158]" : "bg-white/[0.2]"
      )}
    >
      <motion.span
        initial={false}
        animate={{ width: w, x: checked ? 44 - 4 - w : 0 }}
        transition={SPRING_KNOB}
        className="absolute left-[2px] top-[2px] h-[22px] rounded-full bg-white shadow-[0_2px_5px_rgba(0,0,0,0.3)]"
      />
    </button>
  );
}

export function PopUp({
  value,
  onValueChange,
  disabled,
  options,
}: {
  value: string;
  onValueChange: (v: string) => void;
  disabled?: boolean;
  options: { value: string; label: string }[];
}) {
  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger className="h-8 w-auto min-w-[120px] gap-1.5 rounded-[9px] border-0 bg-white/[0.08] px-3 text-[13px] font-medium text-white shadow-none transition-colors hover:bg-white/[0.13] focus:ring-2 focus:ring-white/25">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="z-[10000] rounded-xl border border-white/10 bg-[#2a2a2d] text-white shadow-2xl">
        {options.map((o) => (
          <SelectItem
            key={o.value}
            value={o.value}
            className="rounded-lg text-[13px] font-medium focus:bg-white/10 focus:text-white"
          >
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function AppleSlider({
  value,
  min,
  max,
  onValueChange,
}: {
  value: number;
  min: number;
  max: number;
  onValueChange: (v: number) => void;
}) {
  return (
    <Slider.Root
      className="relative flex h-6 w-full flex-grow cursor-pointer select-none items-center"
      style={{ touchAction: "none" }}
      value={[value]}
      min={min}
      max={max}
      onValueChange={([v]) => onValueChange(v)}
    >
      <Slider.Track className="relative h-[4px] grow rounded-full bg-white/[0.16]">
        <Slider.Range className="absolute h-full rounded-full bg-brand" />
      </Slider.Track>
      <Slider.Thumb
        aria-label="Value"
        className="block h-[18px] w-[18px] rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.4)] outline-none transition-transform duration-200 focus-visible:ring-2 focus-visible:ring-white/40 active:scale-110"
      />
    </Slider.Root>
  );
}

export function AppButton({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-[9px] bg-white/[0.08] px-3 text-[13px] font-medium text-white/85 outline-none transition-[background-color,color,transform] duration-150 hover:bg-white/[0.14] hover:text-white focus-visible:ring-2 focus-visible:ring-white/30 active:scale-[0.97] disabled:opacity-40",
        className
      )}
    >
      {children}
    </button>
  );
}

export function KeyCap({ children }: { children: ReactNode }) {
  return (
    <kbd className="min-w-[26px] rounded-[6px] bg-white/[0.08] px-2 py-1 text-center font-sans text-[11px] font-medium text-white/85">
      {children}
    </kbd>
  );
}