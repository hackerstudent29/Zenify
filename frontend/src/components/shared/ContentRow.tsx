"use client";

import { ChevronLeft, ChevronRight, ArrowRight } from "lucide-react";
import { useRef, useState, useEffect } from "react";
import { MediaCard } from "./MediaCard";
import { Track } from "@/store/player";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface ContentRowProps {
    title: string;
    subtitle?: string;
    items: Track[];
    className?: string;
    seeAllHref?: string;
}

export function ContentRow({ title, subtitle, items, className, seeAllHref }: ContentRowProps) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(true);

    const checkScroll = () => {
        if (scrollRef.current) {
            const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
            setCanScrollLeft(scrollLeft > 5);
            setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 5);
        }
    };

    useEffect(() => {
        checkScroll();
        window.addEventListener('resize', checkScroll);
        return () => window.removeEventListener('resize', checkScroll);
    }, [items]);

    const scroll = (direction: 'left' | 'right') => {
        if (scrollRef.current) {
            const containerWidth = scrollRef.current.clientWidth;
            const scrollAmount = direction === 'left' ? -containerWidth * 0.8 : containerWidth * 0.8;
            scrollRef.current.scrollBy({ left: scrollAmount, behavior: "smooth" });
        }
    };

    if (items.length === 0) return null;

    return (
        <section className={cn("space-y-4 animate-slide-up", className)}>
            <div className="flex items-end justify-between px-4">
                <div className="space-y-1">
                    <h2 className="text-xl font-black tracking-tight text-foreground/90">{title}</h2>
                    {subtitle && <p className="text-[12px] text-muted font-medium opacity-60 uppercase tracking-wider">{subtitle}</p>}
                </div>

                <div className="flex items-center gap-4">
                    {seeAllHref && (
                        <Link
                            href={seeAllHref}
                            className="text-xs font-bold text-accent hover:underline flex items-center gap-1 group/link mr-2"
                        >
                            See All
                            <ArrowRight size={12} className="group-hover/link:translate-x-1 transition-transform" />
                        </Link>
                    )}
                    <div className="flex gap-1">
                        <button
                            onClick={() => scroll('left')}
                            className={cn(
                                "btn-icon h-7 w-7 bg-surface-hover/80 text-muted transition-all hover:bg-surface-active",
                                !canScrollLeft && "opacity-20 cursor-not-allowed"
                            )}
                            disabled={!canScrollLeft}
                        >
                            <ChevronLeft size={16} />
                        </button>
                        <button
                            onClick={() => scroll('right')}
                            className={cn(
                                "btn-icon h-7 w-7 bg-surface-hover/80 text-muted transition-all hover:bg-surface-active",
                                !canScrollRight && "opacity-20 cursor-not-allowed"
                            )}
                            disabled={!canScrollRight}
                        >
                            <ChevronRight size={16} />
                        </button>
                    </div>
                </div>
            </div>

            <div className="relative group/scroll">
                <div
                    ref={scrollRef}
                    onScroll={checkScroll}
                    className="flex gap-4 overflow-x-auto pb-6 px-4 no-scrollbar scroll-smooth snap-x snap-mandatory"
                >
                    {items.map((item) => (
                        <MediaCard
                            key={item.id}
                            track={item}
                            className="w-[160px] md:w-[180px] lg:w-[200px] flex-shrink-0 snap-start"
                        />
                    ))}
                    {/* Padding at end */}
                    <div className="min-w-[20px] h-full" />
                </div>
            </div>
        </section>
    );
}
