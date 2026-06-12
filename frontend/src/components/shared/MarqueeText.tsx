"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { useMarquee } from "@/hooks/useMarquee";

interface MarqueeTextProps {
 text?: string;
 children?: React.ReactNode;
 speed?: number;
 pauseDuration?: number;
 className?: string;
}

export function MarqueeText({ text, children, speed = 45, pauseDuration = 4000, className }: MarqueeTextProps) {
 const textContent = text || (typeof children === "string" ? children : "");
 const { containerRef, textRef, isOverflowing, animationStyle, animationClass } = useMarquee({
 text: textContent,
 speed,
 pauseDuration,
 });

 return (
 <div
 ref={containerRef}
 className={cn(
 "w-full overflow-hidden whitespace-nowrap block relative", 
 className,
 isOverflowing && "!text-left"
 )}
 onClick={(e) => e.stopPropagation()}
 >
 {animationStyle && <style dangerouslySetInnerHTML={{ __html: animationStyle }} />}
 <div
 className={cn("inline-block whitespace-nowrap", animationClass)}
 style={{
 display: "inline-block",
 willChange: "transform",
 }}
 >
 <div ref={textRef} className="inline-block">
 {children || text}
 </div>
 {isOverflowing && (
 <>
 <div className="inline-block w-12" />
 <div className="inline-block">
 {children || text}
 </div>
 </>
 )}
 </div>
 </div>
 );
}
