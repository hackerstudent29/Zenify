"use client";

import React from 'react';
import { motion } from 'framer-motion';

/* Design tokens: flat, solid, Apple Music dark. No blur, no glow. */
export const FONT =
  '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", Inter, system-ui, sans-serif';
export const SURFACE = 'bg-[#1c1c1e] rounded-2xl';
export const FIELD =
  'h-11 w-full rounded-xl bg-[#2c2c2e] px-4 text-[15px] text-white placeholder:text-white/30 outline-none transition focus:ring-2 focus:ring-brand/60';

/* Motion presets (SwiftUI-like springs) */
export const spring = { type: 'spring', stiffness: 520, damping: 34, mass: 0.8 } as const;
export const softSpring = { type: 'spring', stiffness: 260, damping: 28 } as const;
export const press = { whileTap: { scale: 0.96 }, transition: spring } as const;

/** iOS switch. Knob slides with a spring. */
export function Switch({
  checked, onChange, label, disabled,
}: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-200 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${
        checked ? 'bg-[#34c759]' : 'bg-[#3a3a3c]'
      }`}
    >
      <motion.span
        initial={false}
        animate={{ x: checked ? 20 : 0 }}
        whileTap={{ scaleX: 1.15 }}
        transition={spring}
        className="absolute left-[2px] top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow-[0_2px_4px_rgba(0,0,0,0.35)]"
      />
    </button>
  );
}

/** A switch row with a title and a one-line explanation. */
export function SettingRow({
  title, description, checked, onChange,
}: { title: string; description: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        <p className="text-[15px] font-medium leading-tight">{title}</p>
        <p className="mt-0.5 text-[12.5px] leading-snug text-white/45">{description}</p>
      </div>
      <Switch checked={checked} onChange={onChange} label={title} />
    </div>
  );
}

/** Inset grouped list (iOS Settings style). */
export function Group({
  title, footer, children,
}: { title?: string; footer?: string; children: React.ReactNode }) {
  return (
    <section>
      {title && <h3 className="mb-1.5 px-4 text-[12.5px] font-medium text-white/45">{title}</h3>}
      <div className={`${SURFACE} divide-y divide-white/[0.07] overflow-hidden`}>{children}</div>
      {footer && <p className="mt-1.5 px-4 text-[12px] leading-snug text-white/40">{footer}</p>}
    </section>
  );
}

/** Segmented control with a sliding pill. */
export function Segmented<T extends string | number>({
  id, options, value, onChange,
}: {
  id: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" className="flex rounded-[10px] bg-[#2c2c2e] p-0.5">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={`relative h-8 flex-1 whitespace-nowrap rounded-[8px] px-2 text-[13px] font-medium transition-colors ${
              on ? 'text-white' : 'text-white/55 hover:text-white/80'
            }`}
          >
            {on && (
              <motion.span
                layoutId={`${id}-pill`}
                transition={spring}
                className="absolute inset-0 rounded-[8px] bg-[#636366] shadow-[0_1px_3px_rgba(0,0,0,0.3)]"
              />
            )}
            <span className="relative z-10">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
