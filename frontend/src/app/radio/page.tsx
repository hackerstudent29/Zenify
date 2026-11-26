"use client";

import { Radio, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { SEO } from "@/components/shared/SEO";

export default function RadioPage() {
  const router = useRouter();

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] gap-6 px-6 text-center">
      <SEO
        title="Zenify Radio – Non-Stop Global Stations, Moods & Focus Streams"
        description="Tune in to ad-free 24/7 radio channels for deep focus, midnight chill, workout energy, and global moods on Zenify Radio."
        keywords={[
          "zenify radio",
          "free online music radio",
          "deep focus music stream",
          "lofi chill workout radio",
          "ad-free curated radio",
        ]}
        path="/radio"
        jsonLd={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "WebPage",
              "@id": "https://listenzenify.vercel.app/radio#page",
              url: "https://listenzenify.vercel.app/radio",
              name: "Zenify Radio – Continuous Global Mood & Focus Stations",
            },
            {
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "Home", item: "https://listenzenify.vercel.app/" },
                { "@type": "ListItem", position: 2, name: "Radio", item: "https://listenzenify.vercel.app/radio" },
              ],
            },
          ],
        }}
      />
      <div className="w-16 h-16 rounded-2xl bg-brand/10 border border-brand/20 flex items-center justify-center">
        <Radio className="text-brand w-8 h-8 animate-pulse" />
      </div>
      <div className="space-y-3 max-w-md">
        <h1 className="text-2xl sm:text-3xl font-black font-sans text-white tracking-tight leading-tight uppercase">
          Zenify Radio &amp; Curated Sound Stations
        </h1>
        <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed font-medium">
          Continuous broadcast streams, mood stations, and algorithmic frequencies tuned to your sonic flow.
        </p>
      </div>
      <Button
        variant="outline"
        onClick={() => router.push('/')}
        className="rounded-full px-8 bg-white/5 border-white/10 hover:bg-white/10 group cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4 mr-2 group-hover:-translate-x-1 transition-transform" />
        Return to Command
      </Button>
    </div>
  );
}
