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
 // For a seamless loop, we translate by exactly the width of ONE copy + the 48px gap
 // Since w-12 is exactly 48px in Tailwind (3rem)
 const distance = scrollW + 48;
 const scrollTime = distance / speed; // seconds
 const pauseStartSec = pauseDuration / 1000;
 
 // The cycle duration consists of start pause + scroll
 const totalTime = pauseStartSec + scrollTime;

 const p1 = (pauseStartSec / totalTime) * 100;

 // Generate a unique animation name to trigger keyframe refresh
 const animName = `marquee-${Math.random().toString(36).substring(2, 9)}`;
 
 const style = `
 @keyframes ${animName} {
 0% {
 transform: translate3d(0, 0, 0);
 }
 ${p1.toFixed(2)}% {
 transform: translate3d(0, 0, 0);
 animation-timing-function: linear;
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
 
 // Also ensure we check after all custom fonts have loaded
 if (typeof document !== "undefined" && document.fonts) {
 document.fonts.ready.then(() => {
 checkOverflow();
 });
 }

 // Use ResizeObserver for responsive measuring
 let observer: ResizeObserver | null = null;
 let textObserver: ResizeObserver | null = null;
 
 if (containerRef.current) {
 observer = new ResizeObserver(() => checkOverflow());
 observer.observe(containerRef.current);
 }
 if (textRef.current) {
 textObserver = new ResizeObserver(() => checkOverflow());
 textObserver.observe(textRef.current);
 }

 return () => {
 clearTimeout(timeout);
 if (observer) observer.disconnect();
 if (textObserver) textObserver.disconnect();
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
