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
  onOpenChange 
}: AnimatedDropdownProps) {
  const [hoveredIndex, setHoveredIndex] = React.useState<number | null>(null);

  // We add this specific hack to suppress radix's built-in focus styling 
  // so our custom motion.div highlight shows through.
  const baseItemClasses = cn(
    "h-[34px] rounded-md flex gap-2 w-full items-center px-2.5 py-1.5",
    "text-sm font-medium text-[#DFDFDC]",
    "focus-visible:outline-none focus-visible:ring-1.5 focus-visible:ring-[#7A8FF7]",
    "relative z-10 select-none cursor-pointer",
    "active:bg-[#3D3D38]",
    "focus:bg-transparent hover:bg-transparent data-[highlighted]:bg-transparent focus:text-white data-[highlighted]:text-white" 
  );

  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        {trigger}
      </DropdownMenuTrigger>
      
      <DropdownMenuPortal>
      <DropdownMenuContent
        align={align}
        side={side}
        onCloseAutoFocus={onCloseAutoFocus}
        onInteractOutside={onInteractOutside}
        className={cn(
          "relative min-w-[210px] bg-[#2A2A27] shadow-lg rounded-lg p-0.5 border-none z-[9999]",
          "after:content-[''] after:absolute after:inset-0 after:bg-gradient-to-br after:from-white/10 after:to-transparent",
          "after:rounded-lg after:border after:border-white/10 after:pointer-events-none",
          contentClassName
        )}
        onMouseLeave={() => setHoveredIndex(null)}
      >
        <div className="relative m-0 p-0 w-full z-10 flex flex-col">
          {items.map((item, index) => {
            if (item.isSeparator) {
              return (
                <DropdownMenuSeparator 
                  key={item.id} 
                  className="bg-[#353531] my-1 mx-1 h-px relative z-10" 
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
                        "relative min-w-[220px] bg-[#2A2A27] shadow-2xl rounded-lg p-0.5 border-none ml-1 z-[9999]",
                        "after:content-[''] after:absolute after:inset-0 after:bg-gradient-to-br after:from-white/10 after:to-transparent",
                        "after:rounded-lg after:border after:border-white/10 after:pointer-events-none"
                      )}
                    >
                      {item.subMenu.map((subItem) => {
                        if (subItem.isSeparator) {
                          return (
                            <DropdownMenuSeparator 
                              key={subItem.id} 
                              className="bg-[#353531] my-1 mx-1 h-px relative z-10" 
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
                            onSelect={() => {
                              subItem.onClick?.();
                            }}
                            className={cn(
                              "h-[34px] rounded-md flex gap-2 w-full items-center px-2.5 py-1.5 z-10 relative cursor-pointer",
                              "text-sm font-medium text-[#DFDFDC]",
                              "focus-visible:outline-none focus-visible:ring-1.5 focus-visible:ring-[#7A8FF7]",
                              "active:bg-[#3D3D38] focus:bg-[#353531] focus:text-white data-[highlighted]:bg-[#353531] data-[highlighted]:text-white",
                              subItem.className
                            )}
                          >
                             {subItem.icon && <div className="size-4 flex items-center justify-center opacity-70">{subItem.icon}</div>}
                             {subItem.label}
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
                  item.className
                )}
                onMouseEnter={() => setHoveredIndex(index)}
                onFocus={() => setHoveredIndex(index)}
                onSelect={() => {
                  item.onClick?.();
                }}
              >
                {item.icon && <div className="size-4 flex items-center justify-center opacity-70">{item.icon}</div>}
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
            className="absolute left-0 right-0 h-[34px] bg-[#353531] rounded-md pointer-events-none z-0"
            initial={{ opacity: 0, scale: 0.75 }}
            animate={{
              opacity: hoveredIndex !== null && !items[hoveredIndex]?.isSeparator ? 1 : 0,
              scale: hoveredIndex !== null && !items[hoveredIndex]?.isSeparator ? 1 : 0.75,
              top: hoveredIndex !== null ? calculateTopOffset(hoveredIndex, items) : 0,
            }}
            transition={{ duration: 0.15, ease: "easeOut" }}
          />
        </div>
      </DropdownMenuContent>
      </DropdownMenuPortal>
    </DropdownMenu>
  );
}
