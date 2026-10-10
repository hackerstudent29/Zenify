"use client";

import React, { useEffect, useRef, useState } from "react";

interface ZenifyLogoSplashProps {
  onComplete?: () => void;
}

const LETTER_SOURCES = [
  "/assets/letters/letter_0.png", // Z
  "/assets/letters/letter_1.png", // E
  "/assets/letters/letter_2.png", // N
  "/assets/letters/letter_3.png", // I
  "/assets/letters/letter_4.png", // F
  "/assets/letters/letter_5.png", // Y
];

const LETTER_STYLES: React.CSSProperties[] = [
  { left: "7.820%", top: "24.609%", width: "15.166%" },
  { left: "24.171%", top: "24.219%", width: "15.047%" },
  { left: "40.521%", top: "23.828%", width: "14.810%" },
  { left: "57.227%", top: "23.828%", width: "2.844%" },
  { left: "61.493%", top: "24.609%", width: "15.047%" },
  { left: "77.962%", top: "23.828%", width: "13.981%" },
];

export function ZenifyLogoSplash({ onComplete }: ZenifyLogoSplashProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const letterRefs = useRef<(HTMLImageElement | null)[]>([]);
  const hasCompletedRef = useRef(false);
  const [isFadingOut, setIsFadingOut] = useState(false);

  useEffect(() => {
    // Register CSS @property for browsers supporting it
    try {
      if (typeof window !== "undefined" && (window as any).CSS?.registerProperty) {
        (window as any).CSS.registerProperty({
          name: "--a",
          syntax: "<angle>",
          inherits: false,
          initialValue: "0deg",
        });
      }
    } catch {
      // Ignored if already registered
    }

    const expo = "cubic-bezier(.16,1,.3,1)";
    const B = "blur(5px)";
    const N = "blur(0px)";

    const fx: Array<{
      d: number;
      t: number;
      o?: string;
      e?: string;
      k: Keyframe[];
    }> = [
      // Z: drawn on from left with a subtle skew that straightens
      {
        d: 0,
        t: 1700,
        k: [
          { opacity: 1, clipPath: "inset(0 100% 0 0)", transform: "translateX(-8%) skewX(-14deg)", filter: B },
          { opacity: 1, clipPath: "inset(0 -2% 0 0)", transform: "none", filter: N },
        ],
      },
      // E: a circular sweep draws the letter as it unspins
      {
        d: 280,
        t: 1800,
        k: [
          { opacity: 0, ["--a" as any]: "-10deg", transform: "rotate(-120deg) scale(.7)", filter: B },
          { opacity: 1, offset: 0.12, ["--a" as any]: "-10deg" },
          { opacity: 1, ["--a" as any]: "360deg", transform: "none", filter: N },
        ],
      },
      // N: rises up like a curtain
      {
        d: 560,
        t: 1700,
        k: [
          { opacity: 1, clipPath: "inset(100% 0 0 0)", transform: "translateY(14%)", filter: B },
          { opacity: 1, clipPath: "inset(-2% 0 0 0)", transform: "none", filter: N },
        ],
      },
      // I: drops in stretched and lands with a soft squash
      {
        d: 840,
        t: 1600,
        o: "bottom",
        e: "linear",
        k: [
          { opacity: 0, transform: "translateY(-260%) scaleY(2.2)", easing: expo },
          { opacity: 1, offset: 0.7, transform: "translateY(0) scaleY(.92)", easing: "ease-out" },
          { opacity: 1, transform: "none" },
        ],
      },
      // F: slides in from the right with a speed stretch
      {
        d: 1120,
        t: 1700,
        o: "left",
        k: [
          { opacity: 1, clipPath: "inset(0 0 0 100%)", transform: "translateX(80%) scaleX(1.8)", filter: B },
          { opacity: 1, clipPath: "inset(0 0 0 -2%)", transform: "none", filter: N },
        ],
      },
      // Y: flips up from its base like a pop-up card
      {
        d: 1400,
        t: 1800,
        o: "bottom",
        k: [
          { opacity: 0, transform: "perspective(700px) rotateX(-100deg)", filter: B },
          { opacity: 1, offset: 0.25 },
          { opacity: 1, transform: "none", filter: N },
        ],
      },
    ];

    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReducedMotion) {
      letterRefs.current.forEach((el) => {
        if (el) el.style.opacity = "1";
      });
      const timer = setTimeout(() => {
        setIsFadingOut(true);
        setTimeout(() => {
          if (!hasCompletedRef.current) {
            hasCompletedRef.current = true;
            onComplete?.();
          }
        }, 500);
      }, 1200);
      return () => clearTimeout(timer);
    }

    // Play letter animations
    letterRefs.current.forEach((el, i) => {
      if (!el) return;
      const f = fx[i];
      el.style.transformOrigin = f.o || "center";
      el.animate(f.k, {
        duration: f.t,
        delay: f.d,
        easing: f.e || expo,
        fill: "both",
      });
    });

    // Logo entrance scale animation (~3400ms)
    if (containerRef.current) {
      containerRef.current.animate(
        [{ transform: "scale(1.04)" }, { transform: "scale(1)" }],
        { duration: 3400, easing: expo, fill: "both" }
      );
    }

    // Seamless "going inside" zoom and backdrop dissolve after wordmark hold (~4000ms, completes at ~4600ms)
    const zoomTimer = setTimeout(() => {
      setIsFadingOut(true);

      if (containerRef.current) {
        const zoomAnim = containerRef.current.animate(
          [
            { transform: "scale(1)", opacity: "1", filter: "blur(0px)" },
            { transform: "scale(1.16)", opacity: "0", filter: "blur(5px)" },
          ],
          { duration: 600, easing: expo, fill: "forwards" }
        );
        zoomAnim.onfinish = () => {
          if (!hasCompletedRef.current) {
            hasCompletedRef.current = true;
            onComplete?.();
          }
        };
      } else {
        setTimeout(() => {
          if (!hasCompletedRef.current) {
            hasCompletedRef.current = true;
            onComplete?.();
          }
        }, 600);
      }
    }, 4000);

    // Fallback safety completion timer at 5200ms
    const safetyTimer = setTimeout(() => {
      if (!hasCompletedRef.current) {
        hasCompletedRef.current = true;
        onComplete?.();
      }
    }, 5200);

    return () => {
      clearTimeout(zoomTimer);
      clearTimeout(safetyTimer);
    };
  }, [onComplete]);

  const handleSkip = () => {
    if (hasCompletedRef.current) return;
    setIsFadingOut(true);
    setTimeout(() => {
      if (!hasCompletedRef.current) {
        hasCompletedRef.current = true;
        onComplete?.();
      }
    }, 250);
  };

  return (
    <div
      onClick={handleSkip}
      className={`fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-black select-none cursor-pointer overflow-hidden transition-opacity duration-400 ease-out ${
        isFadingOut ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
      style={{
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <style>{`
        @property --a {
          syntax: '<angle>';
          inherits: false;
          initial-value: 0deg;
        }
        .zenify-letter-e {
          -webkit-mask-image: conic-gradient(#000 var(--a), transparent calc(var(--a) + 10deg));
          mask-image: conic-gradient(#000 var(--a), transparent calc(var(--a) + 10deg));
        }
      `}</style>

      {/* Subtle ambient liquid radial glow matching login aesthetic */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_60%_50%_at_50%_50%,rgba(225,29,72,0.12),transparent_70%)]" />

      {/* Main Animated Logo Container */}
      <div
        ref={containerRef}
        id="logo"
        role="img"
        aria-label="Zenify"
        className="relative z-10 w-[min(92vw,844px)] aspect-[844/256] will-change-transform will-change-filter"
      >
        {LETTER_SOURCES.map((src, idx) => (
          <img
            key={idx}
            ref={(el) => {
              letterRefs.current[idx] = el;
            }}
            src={src}
            alt=""
            className={`l absolute opacity-0 will-change-transform will-change-filter ${
              idx === 1 ? "zenify-letter-e" : ""
            }`}
            style={LETTER_STYLES[idx]}
          />
        ))}
      </div>

      {/* Subtle entry status badge */}
      <div className="absolute bottom-8 z-10 flex flex-col items-center gap-2 opacity-80 pointer-events-none transition-opacity duration-300">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">
            Entering Zenify
          </span>
        </div>
      </div>
    </div>
  );
}

export default ZenifyLogoSplash;
