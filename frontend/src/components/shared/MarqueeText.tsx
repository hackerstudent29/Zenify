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

function extractTextFromNode(node: React.ReactNode): string {
  if (!node) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractTextFromNode).join(" ");
  if (React.isValidElement(node)) {
    return extractTextFromNode((node.props as any)?.children);
  }
  return "";
}

export function MarqueeText({
  text,
  children,
  speed = 40,
  pauseDuration = 2000,
  className
}: MarqueeTextProps) {
  const derivedText = text || extractTextFromNode(children) || "";
  const { containerRef, textRef, isOverflowing, animationStyle, animationClass } = useMarquee({
    text: derivedText,
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
        <div ref={textRef} className="inline-block whitespace-nowrap">
          {children || text}
        </div>
        {isOverflowing && (
          <>
            <div className="inline-block w-12" />
            <div className="inline-block whitespace-nowrap">
              {children || text}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
