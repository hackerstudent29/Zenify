"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { motion, useMotionValue, useSpring, useTransform, useVelocity } from "framer-motion";
import {
  SFAppleHome,
  SFAppleGrid,
  SwiftUIHeart,
  SFAppleLibrary,
  SFAppleSearch,
} from "@/components/ui/SwiftUIIcons";
import { cn } from "@/lib/utils";
import { glassSurface, lensSurface } from "@/components/mobile/glass";

const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

const DOCK_H = 62;   // dock + search bubble height (mini player sits 8px above this)
const PAD = 4;       // inner padding of the pill; the lens lives inside it
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

// Lens follows the finger with a lively spring; settles without overshoot into place
const LENS_SPRING = { stiffness: 520, damping: 40, mass: 0.9 };
const PRESS_SPRING = { stiffness: 620, damping: 30, mass: 0.6 };

export function MobileNav() {
  const pathname = usePathname() ?? "/";
  const router = useRouter();

  // Canonical 4 Apple Music dock items (Admin is moved exclusively to the Profile page dropdown)
  const items = [
    { label: "Home", icon: SFAppleHome, href: "/" },
    { label: "Discover", icon: SFAppleGrid, href: "/discover" },
    { label: "Liked", icon: SwiftUIHeart, href: "/liked" },
    { label: "Library", icon: SFAppleLibrary, href: "/local-library" },
  ];
  const n = items.length;

  const activeIdx = items.findIndex((it) =>
    it.href === "/" ? pathname === "/" : pathname === it.href || pathname.startsWith(it.href + "/")
  );
  const searchActive = pathname.startsWith("/search");

  /* ── state ── */
  const innerRef = useRef<HTMLDivElement>(null);
  const [innerW, setInnerW] = useState(0);
  const itemW = innerW / n;

  const [dragging, setDragging] = useState(false);
  const [hover, setHover] = useState(-1);          // tab under the finger
  const [pending, setPending] = useState<number | null>(null); // optimistic tab right after release
  const downX = useRef(0);
  const moved = useRef(false);
  const measured = useRef(false);

  const shownIdx = dragging ? hover : pending ?? activeIdx;

  /* ── lens physics ── */
  const target = useMotionValue(0);
  const x = useSpring(target, LENS_SPRING);
  const velocity = useVelocity(x);
  // liquid stretch: the lens elongates when it moves fast, like a drop of glass
  const stretch = useTransform(velocity, [-1800, 0, 1800], [1.16, 1, 1.16], { clamp: true });
  const press = useSpring(0, PRESS_SPRING);       // 0 idle → 1 finger down
  const pressScale = useTransform(press, [0, 1], [1, 1.1]);
  const scaleX = useTransform([stretch, pressScale], ([a, b]: number[]) => a * b);
  const lensOpacity = useSpring(activeIdx >= 0 ? 1 : 0, { stiffness: 400, damping: 36 });

  useIsoLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const measure = () => setInnerW(el.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Settle the lens on the current tab whenever we aren't dragging
  useIsoLayoutEffect(() => {
    if (!itemW || dragging) return;
    const idx = pending ?? activeIdx;
    lensOpacity.set(idx >= 0 ? 1 : 0);
    if (idx < 0) return;
    const v = idx * itemW;
    target.set(v);
    if (!measured.current) {
      measured.current = true; // first layout: no slide-in from x=0
      (x as any).jump ? (x as any).jump(v) : x.set(v);
    }
  }, [activeIdx, pending, itemW, dragging, target, x, lensOpacity]);

  // Route actually changed → drop the optimistic state
  useEffect(() => {
    setPending(null);
  }, [pathname]);

  /* ── gesture: ONE surface for tap + slide ── */
  const relX = (clientX: number) => {
    const r = innerRef.current!.getBoundingClientRect();
    return clientX - r.left;
  };
  const idxAt = (clientX: number) => clamp(Math.floor(relX(clientX) / itemW), 0, n - 1);
  const followFinger = (clientX: number) => {
    target.set(clamp(relX(clientX) - itemW / 2, 0, (n - 1) * itemW));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || !itemW) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    downX.current = e.clientX;
    moved.current = false;
    setDragging(true);
    setHover(idxAt(e.clientX));
    lensOpacity.set(1);
    press.set(1);
    followFinger(e.clientX);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    if (Math.abs(e.clientX - downX.current) > 4) moved.current = true;
    followFinger(e.clientX);
    const i = idxAt(e.clientX);
    if (i !== hover) {
      setHover(i);
      (navigator as any).vibrate?.(4);
    }
  };

  const finish = (e: React.PointerEvent, commit: boolean) => {
    if (!dragging) return;
    setDragging(false);
    press.set(0);
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
    const i = commit ? idxAt(e.clientX) : activeIdx;
    if (commit && i !== activeIdx) {
      setPending(i);
      target.set(i * itemW);
      router.push(items[i].href);
      setTimeout(() => setPending(null), 800); // safety if the route didn't change
    } else {
      setPending(null);
    }
  };

  return (
    <nav className="pointer-events-none relative w-full select-none" aria-label="Primary">
      {/* Ultra-subtle bottom vignette so liquid glass refractions pop over both dark and bright content */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/25 via-transparent to-transparent" />

      <div className="relative flex items-center gap-2.5 px-3 pb-[calc(env(safe-area-inset-bottom,0px)+8px)]">
        {/* ───────────── Tab pill (Home · Discover · Liked · Library) ───────────── */}
        <div
          className="pointer-events-auto relative flex-1 rounded-full"
          style={{ height: DOCK_H, ...glassSurface }}
        >
          <div
            ref={innerRef}
            role="tablist"
            className="relative h-full touch-none"
            style={{ margin: `0 ${PAD}px`, width: `calc(100% - ${PAD * 2}px)` }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={(e) => finish(e, true)}
            onPointerCancel={(e) => finish(e, false)}
          >
            {/* sliding lens */}
            {itemW > 0 && (
              <motion.div
                className="pointer-events-none absolute rounded-full"
                style={{
                  top: PAD,
                  bottom: PAD,
                  left: 0,
                  width: itemW,
                  x,
                  scaleX,
                  scaleY: pressScale,
                  opacity: lensOpacity,
                  ...lensSurface,
                }}
              />
            )}

            {/* tabs */}
            <div className="relative z-10 flex h-full">
              {items.map((item, i) => {
                const active = shownIdx === i;
                const Icon = item.icon;
                const tone = active ? "text-brand" : "text-white/70";
                return (
                  <button
                    key={item.href}
                    type="button"
                    role="tab"
                    aria-selected={activeIdx === i}
                    aria-label={item.label}
                    onClick={(e) => {
                      if (e.detail === 0 && pathname !== item.href) router.push(item.href);
                    }}
                    className="flex flex-1 flex-col items-center justify-center gap-[3px] bg-transparent outline-none [-webkit-tap-highlight-color:transparent]"
                  >
                    <span className={cn("pointer-events-none transition-colors duration-200", tone)}>
                      <Icon size={24} filled={active} className={cn("transition-all duration-200", tone)} />
                    </span>
                    <span
                      className={cn(
                        "pointer-events-none text-[10.5px] font-semibold leading-none tracking-[-0.005em] transition-colors duration-200",
                        tone
                      )}
                    >
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ───────────── Separate Round Search Dock Button ───────────── */}
        <motion.button
          type="button"
          aria-label="Search"
          onClick={() => {
            if (pathname !== "/search") {
              router.push("/search");
            }
          }}
          whileTap={{ scale: 0.9 }}
          transition={{ type: "spring", stiffness: 520, damping: 26, mass: 0.6 }}
          className={cn(
            "pointer-events-auto flex shrink-0 items-center justify-center rounded-full outline-none [-webkit-tap-highlight-color:transparent] transition-colors duration-200",
            searchActive ? "text-brand" : "text-white/80"
          )}
          style={{ width: DOCK_H, height: DOCK_H, ...glassSurface }}
        >
          <SFAppleSearch size={25} strokeWidth={2.4} />
        </motion.button>
      </div>
    </nav>
  );
}
