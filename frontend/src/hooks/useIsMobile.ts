"use client";

import { useState, useEffect } from "react";

export function useIsMobile(breakpoint = 1024): boolean {
    const [isMobile, setIsMobile] = useState<boolean>(() => {
        if (typeof window !== "undefined") {
            return window.innerWidth < breakpoint;
        }
        return false;
    });

    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < breakpoint);
        check();
        window.addEventListener("resize", check);
        return () => window.removeEventListener("resize", check);
    }, [breakpoint]);

    return isMobile;
}
