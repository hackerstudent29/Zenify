"use client";

import React, { useState, useRef, useEffect, ReactNode, cloneElement, isValidElement } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";

export type TooltipSide = "top" | "bottom" | "left" | "right";

export interface GlobalTooltipProps {
  content: ReactNode;
  shortcut?: string;
  side?: TooltipSide;
  sideOffset?: number;
  delayDuration?: number;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
}

export function GlobalTooltip({
  content,
  shortcut,
  side = "top",
  sideOffset = 6,
  delayDuration = 250,
  children,
  className = "",
  disabled = false,
}: GlobalTooltipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const updatePosition = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    let x = 0;
    let y = 0;

    switch (side) {
      case "top":
        x = rect.left + rect.width / 2;
        y = rect.top - sideOffset;
        break;
      case "bottom":
        x = rect.left + rect.width / 2;
        y = rect.bottom + sideOffset;
        break;
      case "left":
        x = rect.left - sideOffset;
        y = rect.top + rect.height / 2;
        break;
      case "right":
        x = rect.right + sideOffset;
        y = rect.top + rect.height / 2;
        break;
    }

    setCoords({ x, y });
  };

  const handleMouseEnter = () => {
    if (disabled) return;
    // Mobile / touch screen protection: do not open tooltips on touch devices
    if (typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches) {
      return;
    }

    timeoutRef.current = setTimeout(() => {
      updatePosition();
      setIsOpen(true);
    }, delayDuration);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsOpen(false);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  if (!isValidElement(children)) {
    return <>{children}</>;
  }

  // Position transform styles according to side
  const getTransform = () => {
    switch (side) {
      case "top":
        return "translate(-50%, -100%)";
      case "bottom":
        return "translate(-50%, 0%)";
      case "left":
        return "translate(-100%, -50%)";
      case "right":
        return "translate(0%, -50%)";
    }
  };

  const triggerElement = cloneElement(children as React.ReactElement<any>, {
    ref: (node: HTMLElement | null) => {
      triggerRef.current = node;
      const { ref } = children as any;
      if (typeof ref === "function") {
        ref(node);
      } else if (ref) {
        ref.current = node;
      }
    },
    onMouseEnter: (e: React.MouseEvent) => {
      (children as any).props?.onMouseEnter?.(e);
      handleMouseEnter();
    },
    onMouseLeave: (e: React.MouseEvent) => {
      (children as any).props?.onMouseLeave?.(e);
      handleMouseLeave();
    },
    onFocus: (e: React.FocusEvent) => {
      (children as any).props?.onFocus?.(e);
      handleMouseEnter();
    },
    onBlur: (e: React.FocusEvent) => {
      (children as any).props?.onBlur?.(e);
      handleMouseLeave();
    },
  });

  return (
    <>
      {triggerElement}
      {mounted &&
        createPortal(
          <AnimatePresence>
            {isOpen && content && (
              <motion.div
                initial={{ opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.94 }}
                transition={{ duration: 0.12, ease: "easeOut" }}
                style={{
                  position: "fixed",
                  left: coords.x,
                  top: coords.y,
                  transform: getTransform(),
                  pointerEvents: "none",
                  zIndex: 999999,
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#18181B]/95 backdrop-blur-xl border border-white/10 text-white text-[11px] font-medium shadow-2xl shadow-black/80 whitespace-nowrap select-none ${className}`}
              >
                <span>{content}</span>
                {shortcut && (
                  <kbd className="ml-1 px-1.5 py-0.5 rounded bg-white/10 text-zinc-400 font-mono text-[9px] uppercase tracking-wider">
                    {shortcut}
                  </kbd>
                )}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </>
  );
}

export default GlobalTooltip;

