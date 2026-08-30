"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuPortal,
  DropdownMenuSubContent,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

export interface AnimatedMenuItem {
  id: string;
  icon?: React.ReactNode;
  label?: string;
  hotkey?: string;
  onClick?: (e?: React.MouseEvent) => void;
  className?: string;
  isSeparator?: boolean;
  subMenu?: AnimatedMenuItem[];
  content?: React.ReactNode;
}

interface AnimatedDropdownProps {
  trigger: React.ReactNode;
  items: AnimatedMenuItem[];
  align?: "start" | "center" | "end";
  side?: "top" | "bottom" | "left" | "right";
  contentClassName?: string;
  onCloseAutoFocus?: (e: Event) => void;
  onInteractOutside?: (e: Event) => void;
  onOpenChange?: (open: boolean) => void;
  glass?: boolean;
  header?: React.ReactNode;
}

function calculateTopOffset(index: number, items: AnimatedMenuItem[]) {
  let top = 0;
  for (let i = 0; i < index; i++) {
    if (items[i].isSeparator) {
      top += 9; // 1px height + my-1 (8px) = 9px total
    } else {
      top += 34; // item h-[34px]
    }
  }
  return top;
}

export function AnimatedDropdown({ 
  trigger, 
  items, 
  align = "end", 
  side, 
  contentClassName,
  onCloseAutoFocus,
  onInteractOutside,
  onOpenChange,
  glass = false,
  header
}: AnimatedDropdownProps) {
  const [hoveredIndex, setHoveredIndex] = React.useState<number | null>(null);

  // We add this specific hack to suppress radix's built-in focus styling 
  // so our custom motion.div highlight shows through.
  const baseItemClasses = cn(
    "h-[34px] rounded-md flex gap-2 w-full items-center px-2.5 py-1.5",
    glass ? "text-sm font-bold text-zinc-300 font-sans" : "text-sm font-medium text-[#DFDFDC]",
    "focus-visible:outline-none focus-visible:ring-1.5 focus-visible:ring-[#7A8FF7]",
    "relative z-10 select-none cursor-pointer",
    glass ? "active:bg-white/10" : "active:bg-[#3D3D38]",
    "focus:bg-transparent hover:bg-transparent data-[highlighted]:bg-transparent focus:text-white data-[highlighted]:text-white" 
  );

  const [open, setOpen] = React.useState(false);

  return (
    <DropdownMenu open={open} onOpenChange={(val) => {
      setOpen(val);
      onOpenChange?.(val);
    }}>
      <DropdownMenuTrigger asChild>
        {trigger}
      </DropdownMenuTrigger>
      
      <DropdownMenuPortal>
        <AnimatePresence>
          {open && (
            <DropdownMenuContent
              forceMount
              align={align}
              side={side}
              onCloseAutoFocus={onCloseAutoFocus}
              onInteractOutside={onInteractOutside}
              className="bg-transparent border-none ring-0 shadow-none p-0 overflow-visible z-[9999]"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -8 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                className={cn(
                  glass 
                    ? "relative min-w-[210px] bg-black/60 backdrop-blur-xl border border-white/10 shadow-2xl rounded-xl p-1 z-[9999]"
                    : "relative min-w-[210px] bg-[#2A2A27] shadow-lg rounded-lg p-0.5 border-none z-[9999] after:content-[''] after:absolute after:inset-0 after:bg-gradient-to-br after:from-white/10 after:to-transparent after:rounded-lg after:border after:border-white/10 after:pointer-events-none",
                  contentClassName
                )}
                onMouseLeave={() => setHoveredIndex(null)}
              >
                <div className="relative m-0 p-0 w-full z-10 flex flex-col">
                  {header && (
                    <div className="z-10 relative">
                      {header}
                    </div>
                  )}
                  <div className="relative flex flex-col w-full">
                    {items.map((item, index) => {
                      if (item.isSeparator) {
                        return (
                          <DropdownMenuSeparator 
                            key={item.id} 
                            className={cn(
                              "my-1 mx-1 h-px relative z-10",
                              glass ? "bg-white/[0.08]" : "bg-[#353531]"
                            )} 
                          />
                        );
                      }
                      
                      if (item.subMenu) {
                        return (
                          <DropdownMenuSub key={item.id}>
                            <DropdownMenuSubTrigger
                              className={cn(
                                baseItemClasses,
                                item.className
                              )}
                              onMouseEnter={() => setHoveredIndex(index)}
                              onFocus={() => setHoveredIndex(index)}
                            >
                              {item.icon && <div className="size-4 flex items-center justify-center opacity-70">{item.icon}</div>}
                              <span>{item.label}</span>
                            </DropdownMenuSubTrigger>
                            
                            <DropdownMenuPortal>
                              <DropdownMenuSubContent 
                                className={cn(
                                  glass
                                    ? "relative min-w-[220px] bg-black/60 backdrop-blur-xl border border-white/10 shadow-2xl rounded-xl p-1 ml-1 z-[9999]"
                                    : "relative min-w-[220px] bg-[#2A2A27] shadow-2xl rounded-lg p-0.5 border-none ml-1 z-[9999] after:content-[''] after:absolute after:inset-0 after:bg-gradient-to-br after:from-white/10 after:to-transparent after:rounded-lg after:border after:border-white/10 after:pointer-events-none"
                                )}
                              >
                                {item.subMenu.map((subItem) => {
                                  if (subItem.isSeparator) {
                                    return (
                                      <DropdownMenuSeparator 
                                        key={subItem.id} 
                                        className={cn(
                                          "my-1 mx-1 h-px relative z-10",
                                          glass ? "bg-white/[0.08]" : "bg-[#353531]"
                                        )} 
                                      />
                                    );
                                  }
                                  if (subItem.content) {
                                    return (
                                      <div key={subItem.id} className={cn("z-10 relative", subItem.className)}>
                                        {subItem.content}
                                      </div>
                                    );
                                  }
                                  return (
                                    <DropdownMenuItem
                                      key={subItem.id}
                                      onSelect={(e) => {
                                        subItem.onClick?.(e as any);
                                      }}
                                      className={cn(
                                        "h-[34px] rounded-md flex gap-2 w-full items-center px-2.5 py-1.5 z-10 relative cursor-pointer group/subitem transition-colors",
                                        glass ? "text-sm font-bold text-zinc-300 font-sans" : "text-sm font-medium text-[#DFDFDC]",
                                        "focus-visible:outline-none focus-visible:ring-1.5 focus-visible:ring-[#7A8FF7]",
                                        glass
                                          ? "active:bg-white/10 focus:bg-white/[0.08] focus:text-white data-[highlighted]:bg-white/[0.08] data-[highlighted]:text-white"
                                          : "active:bg-[#3D3D38] focus:bg-[#353531] focus:text-white data-[highlighted]:bg-[#353531] data-[highlighted]:text-white",
                                        subItem.className
                                      )}
                                    >
                                       {subItem.icon && (
                                         <motion.div 
                                           whileTap={{ scale: 0.7, rotate: -15 }} 
                                           whileHover={{ scale: 1.25 }}
                                           className="size-4 flex items-center justify-center opacity-80 group-hover/subitem:opacity-100 transition-opacity"
                                          >
                                            {subItem.icon}
                                         </motion.div>
                                       )}
                                       <span>{subItem.label}</span>
                                    </DropdownMenuItem>
                                  );
                                })}
                              </DropdownMenuSubContent>
                            </DropdownMenuPortal>
                          </DropdownMenuSub>
                        );
                      }

                      if (item.content) {
                        return (
                          <div key={item.id} className={cn("z-10 relative", item.className)}>
                            {item.content}
                          </div>
                        );
                      }

                      return (
                        <DropdownMenuItem
                          key={item.id}
                          className={cn(
                            baseItemClasses,
                            "group/item transition-colors",
                            item.className
                          )}
                          onMouseEnter={() => setHoveredIndex(index)}
                          onFocus={() => setHoveredIndex(index)}
                          onSelect={(e) => {
                            item.onClick?.(e as any);
                            setOpen(false); // Close dropdown on select
                          }}
                        >
                          {item.icon && (
                            <motion.div 
                              whileTap={{ scale: 0.7, rotate: -15 }} 
                              whileHover={{ scale: 1.25 }}
                              transition={{ type: "spring", stiffness: 400, damping: 15 }}
                              className="size-4 flex items-center justify-center opacity-80 group-hover/item:opacity-100 transition-opacity"
                            >
                              {item.icon}
                            </motion.div>
                          )}
                          <span>{item.label}</span>
                          {item.hotkey && (
                            <span className="ml-auto text-[#5E5E55]">
                              <span className="sr-only">Hotkey: </span>
                              {item.hotkey}
                            </span>
                          )}
                        </DropdownMenuItem>
                      );
                    })}

                    <motion.div
                      className={cn(
                        "absolute left-0 right-0 h-[34px] rounded-md pointer-events-none z-0",
                        glass ? "bg-white/[0.08]" : "bg-[#353531]"
                      )}
                      initial={{ opacity: 0, scale: 0.75 }}
                      animate={{
                        opacity: hoveredIndex !== null && !items[hoveredIndex]?.isSeparator ? 1 : 0,
                        scale: hoveredIndex !== null && !items[hoveredIndex]?.isSeparator ? 1 : 0.75,
                        top: hoveredIndex !== null ? calculateTopOffset(hoveredIndex, items) : 0,
                      }}
                      transition={{ duration: 0.15, ease: "easeOut" }}
                    />
                  </div>
                </div>
              </motion.div>
            </DropdownMenuContent>
          )}
        </AnimatePresence>
      </DropdownMenuPortal>
    </DropdownMenu>
  );
}
