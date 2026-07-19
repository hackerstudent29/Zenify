'use client';

import { AnimatePresence, motion, useAnimationControls } from 'framer-motion';
import React, { useState, useRef } from 'react';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';

const CONSTANTS = {
  itemSize: 42,
  containerSize: 150, // Radius of the arc spawn distance (times 2)
  openStagger: 0.03,
  closeStagger: 0.03
};

const STYLES: Record<string, Record<string, string>> = {
  trigger: {
    container:
      'rounded-full overflow-hidden flex items-center bg-transparent justify-center cursor-pointer outline-none ring-0 hover:scale-105 transition-all duration-200 z-[100] relative shadow-lg',
    active: 'scale-105'
  },
  item: {
    container:
      'rounded-full flex items-center justify-center absolute bg-white/5 hover:bg-white/10 border border-white/10 cursor-pointer shadow-2xl text-white backdrop-blur-md',
    label: 'text-[11px] font-bold text-white absolute right-[110%] top-1/2 -translate-y-1/2 mr-2 whitespace-nowrap bg-black/40 px-3 py-1.5 rounded-lg border border-white/10 backdrop-blur-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none'
  }
};

// 2-Layer Radial Menu Logic
const calculatePosition = (i: number) => {
  const innerRadius = 70;
  const outerRadius = 125;
  
  // Specific angles for exactly 3 directions
  // 0: Bottom-Left (135 deg = 3PI/4)
  // 1: Left (180 deg = PI)
  // 2: Down (90 deg = PI/2)
  const angles = [3 * Math.PI / 4, Math.PI, Math.PI / 2];
  
  const layer = Math.floor(i / 3); // 0 for first 3 items, 1 for next 3 items
  const angleIndex = i % 3; // Direction index (0, 1, or 2)
  
  const r = layer === 0 ? innerRadius : outerRadius;
  const theta = angles[angleIndex];
  
  return {
    x: r * Math.cos(theta),
    y: r * Math.sin(theta)
  };
};

interface MenuItemProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  index: number;
  totalItems: number;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

const MenuItem = ({ icon, label, onClick, index, totalItems, isOpen, setIsOpen }: MenuItemProps) => {
  const { x, y } = calculatePosition(index);

  return (
    <motion.button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
        setIsOpen(false);
      }}
      animate={{
        x: isOpen ? x : 0,
        y: isOpen ? y : 0,
        opacity: isOpen ? 1 : 0,
        scale: isOpen ? 1 : 0.5
      }}
      whileHover={{
        scale: isOpen ? 1.1 : 0.5,
        transition: {
          duration: 0.1,
          delay: 0
        }
      }}
      transition={{
        delay: isOpen ? index * CONSTANTS.openStagger : (totalItems - 1 - index) * CONSTANTS.closeStagger,
        type: 'spring',
        stiffness: 400,
        damping: 30
      }}
      style={{
        height: CONSTANTS.itemSize,
        width: CONSTANTS.itemSize,
        pointerEvents: isOpen ? 'auto' : 'none'
      }}
      className={cn(STYLES.item.container, "group")}
    >
      {icon}
      <p className={STYLES.item.label}>{label}</p>
    </motion.button>
  );
};

export const ProfileCircleMenu = ({
  items,
  triggerContent,
}: {
  items: Array<{ label: string; icon: React.ReactNode; onClick: () => void }>;
  triggerContent: React.ReactNode;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const closeTimeout = useRef<NodeJS.Timeout>();

  const handleMouseEnter = () => {
    if (closeTimeout.current) clearTimeout(closeTimeout.current);
    setIsOpen(true);
  };

  const handleMouseLeave = () => {
    closeTimeout.current = setTimeout(() => {
      setIsOpen(false);
    }, 200); // Small delay so they can move their mouse to the items
  };

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="relative flex items-center justify-center place-self-center z-50 w-10 h-10"
    >
      <div
        className={cn(STYLES.trigger.container, isOpen && STYLES.trigger.active, "w-10 h-10")}
        onClick={() => setIsOpen(!isOpen)}
      >
        {triggerContent}
      </div>
      
      <motion.div
        className={cn('absolute inset-0 z-0 flex items-center justify-center pointer-events-none')}
      >
        {items.map((item, index) => {
          return (
            <MenuItem
              key={`menu-item-${index}`}
              icon={item.icon}
              label={item.label}
              onClick={item.onClick}
              index={index}
              totalItems={items.length}
              isOpen={isOpen}
              setIsOpen={setIsOpen}
            />
          );
        })}
      </motion.div>
    </div>
  );
};
