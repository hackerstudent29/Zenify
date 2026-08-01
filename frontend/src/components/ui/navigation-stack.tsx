"use client";

import React, { createContext, useContext, useState, ReactNode, useMemo, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft } from 'lucide-react';

// --- Types ---
type RegistryEntry = {
  match: (value: any) => boolean;
  render: (value: any) => ReactNode;
};

export type NavigationContextType = {
  path: any[];
  push: (value: any) => void;
  pop: () => void;
  popToRoot: () => void;
  registerDestination: (match: (val: any) => boolean, render: (val: any) => ReactNode) => () => void;
};

// --- Context ---
const NavigationContext = createContext<NavigationContextType | null>(null);

export function useNavigation() {
  const ctx = useContext(NavigationContext);
  if (!ctx) {
    throw new Error("useNavigation must be used within a NavigationStack component");
  }
  return ctx;
}

// --- Components ---

interface NavigationStackProps {
  children: ReactNode;
  initialPath?: any[];
}

/**
 * A container that displays a root view and enables you to present additional views over the root view,
 * identical to SwiftUI's NavigationStack.
 */
export function NavigationStack({ children, initialPath = [] }: NavigationStackProps) {
  const [path, setPath] = useState<any[]>(initialPath);
  const [registry, setRegistry] = useState<RegistryEntry[]>([]);

  const push = useCallback((val: any) => setPath(p => [...p, val]), []);
  const pop = useCallback(() => setPath(p => p.slice(0, -1)), []);
  const popToRoot = useCallback(() => setPath([]), []);

  const registerDestination = useCallback((match: (val: any) => boolean, render: (val: any) => ReactNode) => {
    const entry = { match, render };
    setRegistry(prev => [...prev, entry]);
    return () => setRegistry(prev => prev.filter(e => e !== entry));
  }, []);

  // Build the stack array for AnimatePresence
  const stack = useMemo(() => {
    return path.map((value, index) => {
      // Find the first registered destination that matches the pushed value
      const dest = registry.find(r => r.match(value));
      return {
        id: `nav-stack-view-${index}`,
        content: dest ? dest.render(value) : (
          <div className="p-8 text-center text-red-400">
            Error: No NavigationDestination found for the provided value.
          </div>
        )
      };
    });
  }, [path, registry]);

  return (
    <NavigationContext.Provider value={{ path, push, pop, popToRoot, registerDestination }}>
      <div className="relative w-full h-full overflow-hidden bg-black text-white">
        
        {/* ROOT VIEW */}
        {/* Parallax effect when items are on the stack */}
        <motion.div 
          className="absolute inset-0 bg-background overflow-y-auto"
          animate={{
            x: path.length > 0 ? "-20%" : "0%",
            scale: path.length > 0 ? 0.97 : 1,
            opacity: path.length > 0 ? 0.5 : 1
          }}
          transition={{ type: "spring", stiffness: 350, damping: 35 }}
        >
          {children}
        </motion.div>
        
        {/* PUSHED STACK VIEWS */}
        <AnimatePresence>
          {stack.map((view, index) => {
            const isTop = index === stack.length - 1;
            const isCovered = index < stack.length - 1;
            
            return (
              <motion.div
                key={view.id}
                initial={{ x: "100%", opacity: 0.5, boxShadow: "-20px 0 50px rgba(0,0,0,0)" }}
                animate={{ 
                  x: isCovered ? "-20%" : "0%",
                  scale: isCovered ? 0.97 : 1,
                  opacity: isCovered ? 0.5 : 1, 
                  boxShadow: "-20px 0 50px rgba(0,0,0,0.5)" 
                }}
                exit={{ x: "100%", opacity: 0.5, boxShadow: "-20px 0 50px rgba(0,0,0,0)" }}
                transition={{ type: "spring", stiffness: 350, damping: 35 }}
                className="absolute inset-0 bg-black overflow-y-auto"
                style={{ zIndex: 10 + index }}
              >
                {view.content}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </NavigationContext.Provider>
  );
}

/**
 * Registers a destination view for a specific data type or condition.
 * Does not render anything directly to the DOM, just adds to the stack registry.
 */
export function NavigationDestination({ match, render }: { match: (val: any) => boolean, render: (val: any) => ReactNode }) {
  const { registerDestination } = useNavigation();
  
  useEffect(() => {
    return registerDestination(match, render);
  }, [match, render, registerDestination]);

  return null;
}

/**
 * A button that pushes a value onto the NavigationStack when clicked.
 */
export function NavigationLink({ value, children, className }: { value: any, children: ReactNode, className?: string }) {
  const { push } = useNavigation();
  
  return (
    <button 
      onClick={() => push(value)} 
      className={className}
    >
      {children}
    </button>
  );
}

/**
 * A standard iOS-style navigation header with an automatic back button.
 */
export function NavigationHeader({ title, right }: { title?: ReactNode, right?: ReactNode }) {
  const { pop, path } = useNavigation();
  const canPop = path.length > 0;
  
  return (
    <div className="flex items-center justify-between h-14 px-4 border-b border-white/5 bg-black/80 backdrop-blur-xl sticky top-0 z-50">
      <div className="flex-1 flex items-center justify-start h-full">
        {canPop && (
          <button 
            onClick={pop} 
            className="flex items-center text-brand hover:text-brand/80 transition-colors h-full -ml-2 px-2 active:opacity-50"
          >
            <ChevronLeft size={26} className="-ml-1" strokeWidth={2.5} />
            <span className="text-base font-medium">Back</span>
          </button>
        )}
      </div>
      <div className="flex-1 flex justify-center items-center h-full truncate">
        {title && <span className="font-semibold text-[17px] truncate">{title}</span>}
      </div>
      <div className="flex-1 flex justify-end items-center h-full">
        {right}
      </div>
    </div>
  );
}
