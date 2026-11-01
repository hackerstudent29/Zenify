"use client";

import * as React from "react";
import { TrackActionsDropdown, MenuItem } from "@/components/shared/TrackActionsDropdown";

export interface AnimatedMenuItem {
  id: string;
  icon?: React.ReactNode;
  label?: React.ReactNode;
  hotkey?: string;
  onClick?: (e?: any) => void;
  className?: string;
  isSeparator?: boolean;
  disabled?: boolean;
  subMenu?: AnimatedMenuItem[];
  content?: React.ReactNode;
}

export interface AnimatedDropdownProps {
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

/**
 * AnimatedDropdown — Unified Apple Music Dark Glass Dropdown.
 * Proxies to TrackActionsDropdown to guarantee a single, coherent design
 * (label left, icon right, hairline dividers, mobile bottom sheet).
 */
export function AnimatedDropdown({
  trigger,
  items,
  align = "end",
  side,
  glass = true,
}: AnimatedDropdownProps) {
  const menuItems: MenuItem[] = React.useMemo(() => {
    return items.map((it) => ({
      id: it.id,
      label: it.label || it.content,
      icon: it.icon,
      onClick: it.onClick,
      isSeparator: it.isSeparator,
      disabled: it.disabled,
      className: it.className,
      hint: it.hotkey,
    }));
  }, [items]);

  return (
    <TrackActionsDropdown
      trigger={trigger}
      items={menuItems}
      align={align}
      side={side}
      glass={glass}
    />
  );
}

export default AnimatedDropdown;
