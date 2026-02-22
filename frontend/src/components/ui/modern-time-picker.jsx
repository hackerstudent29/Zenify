"use client";
import * as React from "react";
import { Clock } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ModernTimePicker({ value, onChange, disabled, selectedDate }) {
    const [isOpen, setIsOpen] = React.useState(false);
    const [error, setError] = React.useState(false);

    // Helpers to convert 24h string to 12h pieces
    const parseTo12h = (timeStr) => {
        if (!timeStr) return { h: "10", m: "00", p: "AM" };
        const [h24, m24] = timeStr.split(":").map(Number);
        const p = h24 >= 12 ? "PM" : "AM";
        let h12 = h24 % 12;
        if (h12 === 0) h12 = 12;
        return {
            h: h12.toString().padStart(2, "0"),
            m: m24.toString().padStart(2, "0"),
            p: p
        };
    };

    const [selH, setSelH] = React.useState("10");
    const [selM, setSelM] = React.useState("00");
    const [selP, setSelP] = React.useState("AM");

    // Sync internal state when value or popover opens
    React.useEffect(() => {
        const { h, m, p } = parseTo12h(value);
        setSelH(h);
        setSelM(m);
        setSelP(p);
        setError(false);
    }, [value, isOpen]);

    const hoursList = Array.from({ length: 12 }, (_, i) => (i + 1).toString().padStart(2, "0"));
    const minutesList = Array.from({ length: 12 }, (_, i) => (i * 5).toString().padStart(2, "0"));
    const periods = ["AM", "PM"];

    const hRef = React.useRef(null);
    const mRef = React.useRef(null);
    const pRef = React.useRef(null);

    const isInternalScroll = React.useRef(false);

    const scrollTo = (ref, val, list) => {
        if (ref.current) {
            isInternalScroll.current = true;
            const idx = list.indexOf(val);
            ref.current.scrollTop = idx * 40;
            setTimeout(() => { isInternalScroll.current = false; }, 100);
        }
    };

    const handleScroll = (ref, list, setState) => {
        if (isInternalScroll.current) return;
        const scrollTop = ref.current.scrollTop;
        const idx = Math.round(scrollTop / 40);
        if (idx >= 0 && idx < list.length) {
            setState(list[idx]);
            setError(false);
        }
    };

    // Auto-scroll to current selection when opened
    React.useEffect(() => {
        if (isOpen) {
            setTimeout(() => {
                scrollTo(hRef, selH, hoursList);
                scrollTo(mRef, selM, minutesList);
                scrollTo(pRef, selP, periods);
            }, 50);
        }
    }, [isOpen]);

    const onConfirm = () => {
        let h24 = parseInt(selH);
        if (selP === "PM" && h24 !== 12) h24 += 12;
        if (selP === "AM" && h24 === 12) h24 = 0;

        const finalTimeStr = `${h24.toString().padStart(2, "0")}:${selM}`;

        // Validation: If date is today, check if time is in future
        if (selectedDate) {
            const now = new Date();
            const chosen = new Date(selectedDate);
            chosen.setHours(h24, parseInt(selM), 0, 0);

            const isToday = now.toDateString() === chosen.toDateString();
            if (isToday && chosen.getTime() < now.getTime()) {
                setError(true);
                return;
            }
        }

        onChange(finalTimeStr);
        setIsOpen(false);
    };

    return (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    disabled={disabled}
                    className={cn(
                        "w-full h-11 justify-between text-left font-normal bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20 transition-all px-4 rounded-xl group shadow-sm",
                        disabled && "opacity-50 cursor-not-allowed bg-white/5",
                        error && "border-rose-500/50"
                    )}
                >
                    <div className="flex items-center">
                        <Clock className="mr-2 h-4 w-4 text-rose-500 group-hover:text-rose-400 transition-colors" />
                        <span className="text-zinc-100 font-medium">{`${selH}:${selM} ${selP}`}</span>
                    </div>
                    {error ? (
                        <span className="text-[9px] font-bold text-rose-500 uppercase tracking-tighter">Invalid Time</span>
                    ) : (
                        <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest bg-white/5 px-1.5 py-0.5 rounded">Time</span>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[280px] p-0 border-white/10 shadow-2xl rounded-2xl overflow-hidden bg-zinc-900" align="start">
                <div className="bg-zinc-900 p-3 border-b border-white/5 flex flex-col">
                    <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest leading-tight">Select Time</span>
                    <span className={cn("text-sm font-semibold leading-tight", error ? "text-rose-500" : "text-zinc-100")}>
                        {selH}:{selM} {selP}
                    </span>
                    {error && <span className="text-[8px] text-rose-400 mt-1 uppercase font-bold tracking-widest">Selected time has already passed</span>}
                </div>
                <div className="flex h-44 relative bg-zinc-900">
                    {/* SCROLLABLE COLUMNS (H, M, P) */}
                    {[
                        { ref: hRef, list: hoursList, state: selH, setState: setSelH },
                        { ref: mRef, list: minutesList, state: selM, setState: setSelM },
                        { ref: pRef, list: periods, state: selP, setState: setSelP }
                    ].map((col, i) => (
                        <div key={i} className="flex-1 flex flex-col relative">
                            <div
                                ref={col.ref}
                                onScroll={() => handleScroll(col.ref, col.list, col.setState)}
                                className="overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden py-[68px] scroll-smooth snap-y snap-mandatory"
                            >
                                {col.list.map(val => (
                                    <button
                                        key={val}
                                        onClick={() => scrollTo(col.ref, val, col.list)}
                                        className={cn(
                                            "flex items-center justify-center w-full h-10 text-sm snap-center transition-all duration-200",
                                            col.state === val ? "text-white font-semibold scale-110" : "text-zinc-600 hover:text-zinc-400"
                                        )}
                                    >
                                        {val}
                                    </button>
                                ))}
                            </div>
                            {i < 2 && <div className="absolute right-0 top-1/2 -translate-y-1/2 w-px h-10 bg-white/5" />}
                        </div>
                    ))}
                    {/* Selection Overlay */}
                    <div className="absolute inset-x-3 h-10 top-1/2 -translate-y-1/2 pointer-events-none border-y border-rose-500/20 bg-rose-500/5 -z-1" />
                </div>
                <div className="p-3 bg-zinc-900 border-t border-white/5 flex gap-2">
                    <Button variant="ghost" className="flex-1 text-xs h-10 rounded-xl" onClick={() => setIsOpen(false)}>Cancel</Button>
                    <Button className="flex-1 text-xs font-semibold h-10 rounded-xl bg-white text-zinc-900 hover:bg-zinc-200" onClick={onConfirm}>Confirm</Button>
                </div>
            </PopoverContent>
        </Popover>
    );
}
