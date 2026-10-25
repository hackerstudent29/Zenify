
"use client";

import Pricing from "@/components/home/Pricing";
import { useAuthStore } from "@/store/authStore";
import { useEffect, useState } from "react";
import api from "@/lib/api";
import {
  MotionConfig,
  motion,
  useReducedMotion,
} from "framer-motion";
import {
  ArrowDownRight,
  AudioLines,
  Check,
} from "lucide-react";
import { SEO } from "@/components/shared/SEO";

const benefits = [
  "Ad-free listening",
  "High-fidelity audio",
  "Offline playback",
  "Synced lyrics",
];

const waveHeights = [0.45, 0.8, 0.55, 1, 0.65, 0.38, 0.75];

export default function PricingPage() {
  const { isAuthenticated } = useAuthStore();

  const [currentPlan, setCurrentPlan] = useState("Eclipse");
  const [currentPlanIsAnnual, setCurrentPlanIsAnnual] = useState(false);

  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    let cancelled = false;

    if (!isAuthenticated) {
      setCurrentPlan("Eclipse");
      setCurrentPlanIsAnnual(false);
      return;
    }

    api
      .get("auth/subscription")
      .then((res) => {
        if (cancelled) return;

        const active = res.data?.status === "ACTIVE";

        setCurrentPlan(active ? res.data.plan || "Eclipse" : "Eclipse");
        setCurrentPlanIsAnnual(
          active ? Boolean(res.data.isAnnual) : false
        );
      })
      .catch(() => {
        if (cancelled) return;

        setCurrentPlan("Eclipse");
        setCurrentPlanIsAnnual(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  const entranceTransition = prefersReducedMotion
    ? { duration: 0.2 }
    : {
        type: "spring" as const,
        stiffness: 90,
        damping: 23,
        mass: 0.85,
      };

  return (
    <MotionConfig reducedMotion="user">
      <div className="relative isolate min-h-screen overflow-hidden bg-[#080808] text-white selection:bg-white/20">

        <SEO
          title="Zenify Premium — Listen Closer"
          description="Explore Zenify Premium for ad-free music, high-fidelity audio, immersive 8D presets, offline playback, and synced lyrics."
          path="/pricing"
        />

        {/* A barely visible change in light, not a decorative blob. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-[560px]"
          style={{
            background:
              "radial-gradient(ellipse at 50% 0%, rgba(255,255,255,0.055), transparent 65%)",
          }}
        />

        <main className="relative mx-auto max-w-[1160px] px-5 pb-20 pt-28 sm:px-8 sm:pt-36 lg:px-12">

          {/* Hero */}
          <motion.header
            initial={
              prefersReducedMotion
                ? { opacity: 0 }
                : { opacity: 0, y: 14, filter: "blur(5px)" }
            }
            animate={{
              opacity: 1,
              y: 0,
              filter: "blur(0px)",
            }}
            transition={entranceTransition}
            className="mx-auto max-w-4xl text-center"
          >
            {/* Small animated music detail */}
            <div className="mb-8 flex items-center justify-center gap-3">
              <AudioLines
                aria-hidden="true"
                className="h-[15px] w-[15px] text-white/65"
                strokeWidth={1.5}
              />

              <span className="text-[10px] font-medium uppercase tracking-[0.28em] text-white/55">
                zenify premium
              </span>

              <span
                aria-hidden="true"
                className="flex h-4 items-center gap-[3px]"
              >
                {waveHeights.map((height, index) => (
                  <motion.span
                    key={index}
                    className="w-[2px] origin-center rounded-full bg-white/60"
                    style={{ height: `${height * 14}px` }}
                    animate={
                      prefersReducedMotion
                        ? { opacity: 0.7 }
                        : {
                            scaleY: [0.55, 1, 0.65, 0.9],
                            opacity: [0.4, 0.85, 0.55, 0.75],
                          }
                    }
                    transition={{
                      duration: 1.15 + index * 0.09,
                      delay: index * 0.07,
                      repeat: Infinity,
                      repeatType: "mirror",
                      ease: "easeInOut",
                    }}
                  />
                ))}
              </span>
            </div>

            <h1 className="text-[clamp(3.5rem,8.5vw,7.4rem)] font-semibold leading-[0.94] tracking-[-0.075em] text-white">
              Listen closer.
              <br />
              <span className="text-white/45">
                Feel more.
              </span>
            </h1>

            <p className="mx-auto mt-7 max-w-xl text-[15px] leading-7 text-white/55 sm:text-lg sm:leading-8">
              Your music, without the interruptions.
              An experience made for every detail, every mood,
              and every moment.
            </p>

            <motion.a
              href="#plans"
              whileHover={
                prefersReducedMotion
                  ? undefined
                  : { y: -2 }
              }
              whileTap={
                prefersReducedMotion
                  ? undefined
                  : { scale: 0.97 }
              }
              transition={{
                type: "spring",
                stiffness: 380,
                damping: 24,
              }}
              className="group mt-8 inline-flex items-center gap-2 border-b border-white/30 pb-2 text-sm font-medium text-white/90 outline-none transition-colors duration-300 hover:border-white hover:text-white focus-visible:ring-2 focus-visible:ring-white/60"
            >
              Explore plans

              <motion.span
                className="inline-flex"
                animate={
                  prefersReducedMotion
                    ? undefined
                    : { y: [0, 2, 0] }
                }
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              >
                <ArrowDownRight
                  aria-hidden="true"
                  className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5"
                  strokeWidth={1.6}
                />
              </motion.span>
            </motion.a>
          </motion.header>

          {/* Benefits stay in the content flow, without cards. */}
          <motion.div
            initial="hidden"
            animate="visible"
            variants={{
              hidden: {},
              visible: {
                transition: {
                  staggerChildren: 0.09,
                  delayChildren: 0.3,
                },
              },
            }}
            className="mx-auto mt-20 flex max-w-4xl flex-wrap justify-center gap-x-7 gap-y-4 border-y border-white/[0.10] py-5 sm:mt-24 sm:gap-x-10"
          >
            {benefits.map((benefit) => (
              <motion.span
                key={benefit}
                variants={{
                  hidden: {
                    opacity: 0,
                    y: prefersReducedMotion ? 0 : 5,
                  },
                  visible: {
                    opacity: 1,
                    y: 0,
                    transition: {
                      type: "spring",
                      stiffness: 170,
                      damping: 23,
                    },
                  },
                }}
                className="inline-flex items-center gap-2 text-xs text-white/65 sm:text-sm"
              >
                <Check
                  aria-hidden="true"
                  className="h-3.5 w-3.5 text-white/45"
                  strokeWidth={1.6}
                />
                {benefit}
              </motion.span>
            ))}
          </motion.div>

          {/* Pricing — deliberately no second card or glass wrapper. */}
          <motion.section
            id="plans"
            initial={
              prefersReducedMotion
                ? { opacity: 0 }
                : { opacity: 0, y: 12 }
            }
            whileInView={{
              opacity: 1,
              y: 0,
            }}
            viewport={{
              once: true,
              amount: 0.08,
            }}
            transition={{
              type: "spring",
              stiffness: 95,
              damping: 24,
              mass: 0.9,
            }}
            className="scroll-mt-24 mt-20 border-t border-white/[0.10] pt-12 sm:mt-24 sm:pt-16"
          >
            <div className="mb-8 sm:mb-10">
              <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-white/40">
                Membership
              </p>

              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.055em] text-white sm:text-5xl">
                Choose your plan.
              </h2>

              <p className="mt-3 max-w-lg text-sm leading-6 text-white/50 sm:text-base">
                More of what you love. Nothing between you and the music.
              </p>
            </div>

            <Pricing
              currentPlan={currentPlan}
              currentPlanIsAnnual={currentPlanIsAnnual}
              forceShowAll={true}
            />
          </motion.section>

          <footer className="mt-16 border-t border-white/[0.08] pt-5">
            <p className="text-center text-[11px] tracking-wide text-white/35">
              Made for listening.
            </p>
          </footer>
        </main>
      </div>
    </MotionConfig>
  );
}
