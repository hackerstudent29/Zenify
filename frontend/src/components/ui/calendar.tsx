"use client";
import { ChevronLeft, ChevronRight } from "lucide-react";
import * as React from "react";
import { DayPicker } from "react-day-picker";
import { cn } from "@/lib/utils";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({
    className,
    classNames,
    showOutsideDays = true,
    components: userComponents,
    ...props
}: CalendarProps) {
    const defaultClassNames = {
        months: "relative flex flex-col sm:flex-row gap-4",
        month: "w-full",
        month_caption: "relative mx-10 mb-1 flex h-9 items-center justify-center z-20",
        caption_label: "hidden",
        dropdowns: "flex items-center gap-1.5",
        dropdown: "bg-zinc-900 border border-white/10 text-white text-sm rounded-lg px-2 py-1 cursor-pointer focus:outline-none focus:border-brand/50 appearance-none hover:bg-zinc-800 transition-colors",
        dropdown_month: "bg-zinc-900 border border-white/10 text-white text-sm rounded-lg px-2 py-1 cursor-pointer focus:outline-none",
        dropdown_year: "bg-zinc-900 border border-white/10 text-white text-sm rounded-lg px-2 py-1 cursor-pointer focus:outline-none",
        nav: "absolute top-0 flex w-full justify-between z-10",
        button_previous: cn(
            "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors hover:bg-white/10 p-0",
            "size-9 text-zinc-400 hover:text-white hover:bg-white/5",
        ),
        button_next: cn(
            "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors hover:bg-white/10 p-0",
            "size-9 text-zinc-400 hover:text-white hover:bg-white/5",
        ),
        weekday: "size-9 p-0 text-xs font-medium text-zinc-500",
        day_button:
            "relative flex size-9 items-center justify-center rounded-lg p-0 text-zinc-300 hover:bg-white/10 group-data-[selected]:bg-white group-data-[selected]:text-zinc-900 focus-visible:outline-none transition-colors",
        day: "group size-9 px-0 text-sm",
        today: "after:absolute after:bottom-1 after:size-[3px] after:rounded-full after:bg-white",
        outside: "text-zinc-600",
        hidden: "invisible",
    };

    const mergedClassNames: any = Object.keys(defaultClassNames).reduce((acc, key) => ({
        ...acc,
        [key]: cn((defaultClassNames as any)[key], (classNames as any)?.[key])
    }), {});

    return (
        <DayPicker
            showOutsideDays={showOutsideDays}
            captionLayout="dropdown"
            className={cn("w-fit p-3 bg-zinc-950 rounded-xl border border-white/10 shadow-2xl", className)}
            classNames={mergedClassNames}
            components={{
                Chevron: ({ orientation }) => orientation === "left" ? <ChevronLeft size={16} /> : <ChevronRight size={16} />,
                ...userComponents
            }}
            {...props}
        />
    );
}
export { Calendar };
