import React from 'react';
import { Link } from 'react-router-dom';
import { Music, ArrowLeft, Home, Compass } from 'lucide-react';
import { SEO } from '@/components/shared/SEO';

export default function NotFoundPage() {
  return (
    <>
      <SEO
        title="Page Not Found"
        description="The frequency you are looking for does not exist on Zenify."
      />
      <div className="min-h-[75vh] flex flex-col items-center justify-center px-6 text-center select-none">
        <div className="relative mb-8">
          <div className="w-24 h-24 rounded-3xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-brand animate-pulse">
            <Music className="w-12 h-12" />
          </div>
          <div className="absolute -bottom-2 -right-2 px-2.5 py-0.5 rounded-full bg-zinc-900 border border-white/10 text-[10px] font-mono font-bold text-zinc-400">
            404
          </div>
        </div>

        <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight text-white mb-3">
          Lost Frequency
        </h1>
        <p className="text-sm text-zinc-400 max-w-md mx-auto leading-relaxed mb-8">
          The track, artist, or frequency you tuned into isn't available or has moved to another dimension.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/"
            className="h-10 px-5 rounded-xl bg-brand hover:bg-rose-600 text-white text-[11px] font-bold uppercase tracking-widest transition-all active:scale-95 flex items-center gap-2"
          >
            <Home className="w-4 h-4" />
            Back to Home
          </Link>
          <Link
            to="/search"
            className="h-10 px-5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-300 text-[11px] font-bold uppercase tracking-widest transition-all active:scale-95 flex items-center gap-2"
          >
            <Compass className="w-4 h-4" />
            Explore Music
          </Link>
        </div>
      </div>
    </>
  );
}
