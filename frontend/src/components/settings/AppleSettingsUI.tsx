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
import { X, ChevronLeft, Loader2, CheckCircle, AlertTriangle } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/* ==========================================================================
   Spring physics. Only transform + opacity are ever animated (GPU, no reflow)
   ========================================================================== */
const SPRING_WINDOW: Transition = { type: "spring", stiffness: 340, damping: 30, mass: 0.9 };
const SPRING_SHEET: Transition = { type: "spring", stiffness: 320, damping: 34, mass: 0.9 };
const SPRING_SOFT: Transition = { type: "spring", stiffness: 300, damping: 28, mass: 0.8 };
const SPRING_PILL: Transition = { type: "spring", stiffness: 520, damping: 38, mass: 0.7 };
const SPRING_KNOB: Transition = { type: "spring", stiffness: 700, damping: 35, mass: 0.6 };

const windowV: Variants = {
  initial: { opacity: 0, scale: 0.92, y: 18 },
  animate: { opacity: 1, scale: 1, y: 0, transition: SPRING_WINDOW },
  exit: { opacity: 0, scale: 0.96, y: 8, transition: { duration: 0.18, ease: [0.4, 0, 1, 1] } },
};
const sheetV: Variants = {
  initial: { y: "100%" },
  animate: { y: 0, transition: SPRING_SHEET },
  exit: { y: "100%", transition: { duration: 0.26, ease: [0.4, 0, 0.9, 0.4] } },
};
const sectionV: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.045, delayChildren: 0.02 } },
};
const itemV: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: SPRING_SOFT },
};

/* ==========================================================================
   Apple system colors for icon tiles
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
      className="flex shrink-0 items-center justify-center text-white shadow-[inset_0_0.5px_0_rgba(255,255,255,0.35),0_1px_2px_rgba(0,0,0,0.3)]"
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.26),
        background: `linear-gradient(180deg, color-mix(in srgb, ${tint}, white 20%), ${tint})`,
      }}
    >
      <Icon size={Math.round(size * 0.55)} strokeWidth={2.2} />
    </span>
  );
}

/* ==========================================================================
   Floating window / sheet shell
   - Desktop: centered floating window with spring scale-in
   - Mobile : bottom sheet with spring slide-up + drag-to-dismiss
   - Blurs and dims everything behind it (one static blur layer, only opacity animates)
   ========================================================================== */
export type NavItem = {
  id: string;
  label: string;
  icon: ElementType;
  tint: string;
  desktopOnly?: boolean;
};

type Status = "idle" | "saving" | "saved" | "error";

export function SettingsWindow({
  title,
  nav,
  status = "idle",
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
  const [mode, setMode] = useState<"window" | "sheet">(() =>
    typeof window !== "undefined" && window.innerWidth <= 767 ? "sheet" : "window"
  );
  const [internalOpen, setInternalOpen] = useState(isOpen !== undefined ? isOpen : true);
  const target = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const controls = useDragControls();

  useEffect(() => {
    if (isOpen !== undefined) {
      setInternalOpen(isOpen);
    }
  }, [isOpen]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const apply = () => setMode(mq.matches ? "sheet" : "window");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (!internalOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
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

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [scrollKey]);

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

  return createPortal(
    <MotionConfig reducedMotion={reducedMotion ? "always" : "user"}>
      <AnimatePresence onExitComplete={finish}>
        {internalOpen && (
          <div key="settings-root" className="fixed inset-0 z-[9000]">
            {/* Blur + dim backdrop: match search scrim glass */}
            <motion.div
              aria-hidden
              className="absolute inset-0 bg-black/60 backdrop-blur-xl backdrop-saturate-150"
              style={{ willChange: "opacity", transform: "translateZ(0)" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.24, ease: [0.32, 0.72, 0, 1] }}
              onPointerDown={() => close()}
            />

            <div
              className={cn(
                "pointer-events-none absolute inset-0 flex",
                sheet ? "items-end" : "items-center justify-center p-3 sm:p-5"
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
                style={{
                  willChange: "transform",
                  paddingBottom: sheet ? "env(safe-area-inset-bottom)" : undefined,
                }}
                className={cn(
                  "pointer-events-auto relative flex flex-col overflow-hidden text-white",
                  "bg-zinc-900/85 border border-white/[0.12] backdrop-blur-3xl backdrop-saturate-180",
                  "shadow-[0_28px_90px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,255,255,0.18)]",
                  sheet
                    ? "h-[92dvh] w-full rounded-t-[26px]"
                    : "h-[min(660px,92vh)] w-[min(900px,94vw)] rounded-[22px]"
                )}
              >
                {/* Title bar (also the drag handle on mobile) */}
                <header
                  className="relative z-10 shrink-0 bg-white/[0.02] backdrop-blur-md"
                  onPointerDown={(e) => sheet && controls.start(e)}
                  style={{ touchAction: sheet ? "none" : undefined }}
                >
                  {sheet && <div className="mx-auto mt-2 h-[5px] w-9 rounded-full bg-white/25" />}
                  <div className="flex h-12 items-center justify-between px-3 md:px-4">
                    <div className="flex w-24 items-center">
                      {backHref && (
                        <button
                          type="button"
                          data-no-spring
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={() => close(backHref)}
                          className="flex h-8 cursor-pointer items-center rounded-full pl-1 pr-2 text-[13px] font-medium text-brand outline-none transition-opacity hover:opacity-70 focus-visible:ring-2 focus-visible:ring-white/30"
                        >
                          <ChevronLeft size={19} strokeWidth={2.6} />
                          {backLabel}
                        </button>
                      )}
                    </div>

                    <h2 className="text-[14px] font-bold tracking-tight text-white">{title}</h2>

                    <div className="flex w-24 items-center justify-end gap-2">
                      <AnimatePresence initial={false} mode="popLayout">
                        {status !== "idle" && (
                          <motion.span
                            key={status}
                            initial={{ opacity: 0, scale: 0.85 }}
                            animate={{ opacity: 1, scale: 1, transition: SPRING_SOFT }}
                            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.12 } }}
                            className={cn(
                              "flex items-center gap-1 text-[11px] font-semibold",
                              status === "saving" && "text-white/55",
                              status === "saved" && "text-[#30d158]",
                              status === "error" && "text-[#ff453a]"
                            )}
                          >
                            {status === "saving" && <Loader2 size={13} className="animate-spin" />}
                            {status === "saved" && <CheckCircle size={13} />}
                            {status === "error" && <AlertTriangle size={13} />}
                            <span className="hidden sm:inline">
                              {status === "saving" ? "Saving" : status === "saved" ? "Saved" : "Failed"}
                            </span>
                          </motion.span>
                        )}
                      </AnimatePresence>

                      <motion.button
                        type="button"
                        data-no-spring
                        aria-label="Close"
                        whileTap={{ scale: 0.86 }}
                        transition={SPRING_KNOB}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => close()}
                        className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-white/[0.12] text-white/70 outline-none transition-colors hover:bg-white/20 hover:text-white focus-visible:ring-2 focus-visible:ring-white/30"
                      >
                        <X size={14} strokeWidth={2.8} />
                      </motion.button>
                    </div>
                  </div>
                  <div className="h-px bg-white/[0.08]" />
                </header>

                <div className="flex min-h-0 flex-1 flex-col md:flex-row">
                  {nav && (
                    <nav
                      role="tablist"
                      aria-label={title}
                      className="no-scrollbar flex shrink-0 gap-1 overflow-x-auto border-b border-white/[0.08] px-3 py-2 md:w-[224px] md:flex-col md:overflow-x-visible md:overflow-y-auto md:border-b-0 md:border-r md:px-3 md:py-3"
                    >
                      {nav.items.map((item) => {
                        const active = nav.active === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            role="tab"
                            aria-selected={active}
                            onClick={() => nav.onSelect(item.id)}
                            className={cn(
                              "relative shrink-0 cursor-pointer items-center gap-2.5 whitespace-nowrap rounded-[10px] px-3 py-2 text-[13px] font-semibold outline-none transition-all duration-150 focus-visible:ring-2 focus-visible:ring-white/25",
                              item.desktopOnly ? "hidden md:flex" : "flex",
                              active
                                ? "bg-white/[0.14] text-white shadow-sm ring-1 ring-white/10"
                                : "text-white/60 hover:text-white hover:bg-white/[0.06]"
                            )}
                          >
                            <TintIcon icon={item.icon} tint={item.tint} size={24} />
                            <span>{item.label}</span>
                          </button>
                        );
                      })}
                    </nav>
                  )}

                  <div
                    ref={scrollRef}
                    className="min-w-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-10 pt-5 md:px-8 md:pt-7"
                    style={{ WebkitOverflowScrolling: "touch" }}
                  >
                    <div className="mx-auto w-full max-w-[640px]">{children}</div>
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
   Content building blocks
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
    <div className="animate-in fade-in-50 duration-150">
      <div className="mb-5">
        <h1 className="text-[24px] font-bold leading-tight tracking-[-0.022em] text-white">{title}</h1>
        {subtitle && <p className="mt-1 text-[13px] font-medium text-white/50">{subtitle}</p>}
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
    <section className="mb-6">
      {header && (
        <h3 className="mb-2 px-3 text-[11px] font-bold uppercase tracking-[0.07em] text-white/40">
          {header}
        </h3>
      )}
      <div className="divide-y divide-white/[0.06] overflow-hidden rounded-[16px] bg-white/[0.04] backdrop-blur-md ring-1 ring-inset ring-white/[0.08] shadow-sm">
        {children}
      </div>
      {footer && <p className="mt-2 px-3 text-[12px] leading-snug text-white/40">{footer}</p>}
    </section>
  );
}

export function Row({
  label,
  description,
  icon,
  tint,
  badge,
  isSaving,
  isSaved,
  className,
  children,
}: {
  label: string;
  description?: ReactNode;
  icon?: ElementType;
  tint?: string;
  badge?: string;
  isSaving?: boolean;
  isSaved?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={cn("group flex min-h-[54px] items-center gap-3 px-4 py-2.5", className)}>
      {icon && <TintIcon icon={icon} tint={tint} />}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13.5px] font-semibold leading-tight tracking-[-0.005em] text-white">
            {label}
          </span>
          {badge && (
            <span className="rounded-full bg-brand/15 px-1.5 py-px text-[10px] font-bold text-brand">
              {badge}
            </span>
          )}
        </div>
        {description && (
          <p className="mt-0.5 text-[12px] font-medium leading-snug text-white/50">{description}</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2.5">
        {/* Fixed-size status slot: never causes layout shift */}
        <span className="flex h-4 w-4 items-center justify-center">
          <AnimatePresence initial={false} mode="wait">
            {isSaving && (
              <motion.span
                key="s"
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.6 }}
                transition={{ duration: 0.12 }}
                className="text-white/50"
              >
                <Loader2 size={14} className="animate-spin" />
              </motion.span>
            )}
            {!isSaving && isSaved && (
              <motion.span
                key="ok"
                initial={{ opacity: 0, scale: 0.4 }}
                animate={{ opacity: 1, scale: 1, transition: SPRING_KNOB }}
                exit={{ opacity: 0, scale: 0.6, transition: { duration: 0.12 } }}
                className="text-[#30d158]"
              >
                <CheckCircle size={14} />
              </motion.span>
            )}
          </AnimatePresence>
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
      data-no-spring
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
      className={cn(
        "relative h-[26px] w-[44px] shrink-0 cursor-pointer rounded-full outline-none transition-colors duration-300 focus-visible:ring-2 focus-visible:ring-white/40 disabled:cursor-not-allowed disabled:opacity-40",
        checked ? "bg-[#30d158]" : "bg-white/[0.22]"
      )}
    >
      <motion.span
        initial={false}
        animate={{ width: w, x: checked ? 44 - 4 - w : 0 }}
        transition={SPRING_KNOB}
        className="absolute left-[2px] top-[2px] h-[22px] rounded-full bg-white shadow-[0_2px_5px_rgba(0,0,0,0.35)]"
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
      <SelectTrigger className="h-7 w-auto min-w-[112px] gap-1.5 rounded-[8px] border-0 bg-white/10 px-2.5 text-[12.5px] font-semibold text-white shadow-none transition-colors hover:bg-white/[0.16] focus:ring-2 focus:ring-white/25">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="z-[10000] rounded-xl border border-white/10 bg-[#2a2a2c]/95 text-white shadow-2xl backdrop-blur-xl">
        {options.map((o) => (
          <SelectItem
            key={o.value}
            value={o.value}
            className="rounded-lg text-[12.5px] font-medium focus:bg-white/10 focus:text-white"
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
      <Slider.Track className="relative h-[4px] grow rounded-full bg-white/[0.18]">
        <Slider.Range className="absolute h-full rounded-full bg-brand" />
      </Slider.Track>
      <Slider.Thumb
        aria-label="Value"
        className="block h-[18px] w-[18px] rounded-full bg-white shadow-[0_2px_8px_rgba(0,0,0,0.5)] outline-none transition-transform duration-300 [transition-timing-function:var(--spring-snappy)] focus-visible:ring-2 focus-visible:ring-white/40 active:scale-125"
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
        "inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-[8px] bg-white/10 px-3 text-[12px] font-semibold text-white/85 outline-none transition-colors hover:bg-white/[0.16] hover:text-white focus-visible:ring-2 focus-visible:ring-white/30 disabled:opacity-40",
        className
      )}
    >
      {children}
    </button>
  );
}

export function KeyCap({ children }: { children: ReactNode }) {
  return (
    <kbd className="min-w-[26px] rounded-[6px] bg-white/10 px-2 py-1 text-center font-sans text-[11px] font-semibold text-white/90 ring-1 ring-inset ring-white/10">
      {children}
    </kbd>
  );
}
