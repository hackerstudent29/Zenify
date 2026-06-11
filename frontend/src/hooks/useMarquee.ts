"use client";

import { useEffect, useRef, useState } from "react";

export interface UseMarqueeProps {
    text: string;
    speed?: number; // px per second
    pauseDuration?: number; // ms
}

export function useMarquee({ text, speed = 35, pauseDuration = 5000 }: UseMarqueeProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const textRef = useRef<HTMLDivElement>(null);
    const [isOverflowing, setIsOverflowing] = useState(false);
    const [animationStyle, setAnimationStyle] = useState<string>("");
    const [animationClass, setAnimationClass] = useState<string>("");

    useEffect(() => {
        const checkOverflow = () => {
            if (containerRef.current && textRef.current) {
                const scrollW = textRef.current.scrollWidth;
                const offsetW = containerRef.current.offsetWidth;
                const overflow = scrollW > offsetW;
                setIsOverflowing(overflow);

                if (overflow) {
                    const distance = scrollW - offsetW;
                    const scrollTime = distance / speed; // seconds
                    const pauseSec = pauseDuration / 1000;
                    
                    // The cycle duration consists of the pause duration + the scroll duration
                    const totalTime = pauseSec + scrollTime;

                    const p1 = (pauseSec / totalTime) * 100;

                    // Generate a unique animation name to trigger keyframe refresh
                    const animName = `marquee-${Math.random().toString(36).substring(2, 9)}`;
                    
                    // We apply a smooth cubic-bezier timing function specifically for the scrolling segment
                    // from p1% to 100%, and linear for the rest (the static pause).
                    const style = `
                        @keyframes ${animName} {
                            0% {
                                transform: translate3d(0, 0, 0);
                            }
                            ${p1.toFixed(2)}% {
                                transform: translate3d(0, 0, 0);
                                animation-timing-function: cubic-bezier(0.42, 0, 0.58, 1);
                            }
                            100% {
                                transform: translate3d(-${distance}px, 0, 0);
                            }
                        }
                        .${animName}-class {
                            animation: ${animName} ${totalTime.toFixed(2)}s linear infinite;
                        }
                    `;
                    setAnimationStyle(style);
                    setAnimationClass(`${animName}-class`);
                } else {
                    setAnimationStyle("");
                    setAnimationClass("");
                }
            }
        };

        // Delay slightly to allow font metrics to settle
        const timeout = setTimeout(checkOverflow, 50);

        // Use ResizeObserver for responsive measuring
        let observer: ResizeObserver | null = null;
        if (containerRef.current) {
            observer = new ResizeObserver(() => {
                checkOverflow();
            });
            observer.observe(containerRef.current);
        }

        return () => {
            clearTimeout(timeout);
            if (observer) {
                observer.disconnect();
            }
        };
    }, [text, speed, pauseDuration]);

    return {
        containerRef,
        textRef,
        isOverflowing,
        animationStyle,
        animationClass
    };
}
