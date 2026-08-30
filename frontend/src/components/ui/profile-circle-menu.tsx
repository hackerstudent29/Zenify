'use client';

import { AnimatePresence, motion } from 'framer-motion';
import React, { useState, useRef } from 'react';
import { cn, getMediaUrl } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { LogOut, ChevronRight } from 'lucide-react';

export const ProfileCircleMenu = ({
  items,
  triggerContent,
}: {
  items: Array<{ label: string; icon: React.ReactNode; onClick: () => void }>;
  triggerContent: React.ReactNode;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const closeTimeout = useRef<NodeJS.Timeout | null>(null);
  const router = useRouter();
  const { user, logout } = useAuthStore();

  const handleMouseEnter = () => {
    if (closeTimeout.current) clearTimeout(closeTimeout.current);
    setIsOpen(true);
  };

  const handleMouseLeave = () => {
    closeTimeout.current = setTimeout(() => {
      setIsOpen(false);
    }, 200); // Small delay so they can move their mouse to the items
  };

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="relative flex items-center justify-center place-self-center z-50 w-10 h-10"
    >
      <button
        className={cn(
          "w-10 h-10 rounded-full overflow-hidden flex items-center justify-center cursor-pointer outline-none relative shadow-lg transition-all duration-300 border bg-transparent",
          isOpen 
            ? "border-brand scale-105 shadow-[0_0_15px_rgba(239,68,68,0.3)]" 
            : "border-white/10 hover:border-white/20 hover:scale-105"
        )}
        onClick={() => setIsOpen(!isOpen)}
      >
        {triggerContent}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="absolute right-0 top-full mt-3 w-64 bg-zinc-950/90 border border-white/[0.08] backdrop-blur-3xl rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.8)] p-3 flex flex-col gap-1.5 z-50"
            style={{ originX: 'right', originY: 'top' }}
          >
            {/* User Info Header */}
            {user && (
              <div className="flex items-center gap-3 p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                <div className="w-10 h-10 rounded-full overflow-hidden border border-white/10 bg-white/5 flex items-center justify-center shrink-0">
                  {user.avatarUrl ? (
                    <img 
                      src={getMediaUrl(user.avatarUrl)} 
                      className="w-full h-full object-cover" 
                      alt="Avatar" 
                    />
                  ) : (
                    <span className="text-sm font-bold text-zinc-300 uppercase">
                      {user.name?.[0] || user.username?.[0] || user.email?.[0] || '?'}
                    </span>
                  )}
                </div>
                <div className="flex flex-col min-w-0 font-sans">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-white truncate max-w-[120px]">
                      {user.name || user.username || 'User'}
                    </span>
                    {user.role === 'ADMIN' ? (
                      <span className="text-[9px] font-extrabold bg-red-500/10 text-red-400 border border-red-500/20 px-1.5 py-0.5 rounded-md uppercase tracking-wider">
                        Admin
                      </span>
                    ) : user.role === 'PRO' || user.role === 'PREMIUM' ? (
                      <span className="text-[9px] font-extrabold bg-brand/10 text-brand border border-brand/20 px-1.5 py-0.5 rounded-md uppercase tracking-wider font-sans">
                        PRO
                      </span>
                    ) : (
                      <span className="text-[9px] font-extrabold bg-white/5 text-zinc-400 border border-white/10 px-1.5 py-0.5 rounded-md uppercase tracking-wider font-sans">
                        Free
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-zinc-400 font-medium truncate max-w-[150px]">
                    {user.email}
                  </span>
                </div>
              </div>
            )}

            <div className="h-[1px] bg-white/[0.06] my-1" />

            {/* Menu Items */}
            <div className="flex flex-col gap-0.5 font-sans">
              {items.map((item, index) => {
                const isUpgrade = item.label.toLowerCase().includes('upgrade') || item.label.toLowerCase().includes('pro');
                return (
                  <button
                    key={`dropdown-item-${index}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      item.onClick();
                      setIsOpen(false);
                    }}
                    className={cn(
                      "group flex items-center justify-between w-full p-2 rounded-xl text-left transition-all duration-200 bg-transparent cursor-pointer",
                      isUpgrade 
                        ? "bg-gradient-to-r from-brand/10 via-brand/5 to-transparent border border-brand/10 hover:from-brand/15 hover:via-brand/10 text-brand" 
                        : "hover:bg-white/[0.04] text-zinc-300 hover:text-white"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200",
                        isUpgrade 
                          ? "bg-brand/20 text-brand group-hover:scale-105" 
                          : "bg-white/5 text-zinc-400 group-hover:bg-white/10 group-hover:text-white"
                      )}>
                        {item.icon}
                      </div>
                      <span className="text-xs font-bold">
                        {item.label}
                      </span>
                    </div>
                    <ChevronRight 
                      size={14} 
                      className={cn(
                        "opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200",
                        isUpgrade ? "text-brand" : "text-zinc-400"
                      )} 
                    />
                  </button>
                );
              })}
            </div>

            <div className="h-[1px] bg-white/[0.06] my-1" />

            {/* Logout Action */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleLogout();
                setIsOpen(false);
              }}
              className="group flex items-center justify-between w-full p-2 rounded-xl text-left hover:bg-red-500/10 transition-all duration-200 bg-transparent cursor-pointer font-sans"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-red-500/5 text-red-400 group-hover:bg-red-500/20 transition-all duration-200">
                  <LogOut size={16} />
                </div>
                <span className="text-xs font-bold text-zinc-400 group-hover:text-red-400 transition-all duration-200">
                  Log Out
                </span>
              </div>
              <ChevronRight 
                size={14} 
                className="opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 text-red-400 transition-all duration-200" 
              />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
