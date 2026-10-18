import React, { useState, useEffect } from 'react';
import { Cookie, X } from 'lucide-react';
import { Link } from 'react-router-dom';

export function CookieConsentBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      const consent = localStorage.getItem('zenify_cookie_consent');
      if (!consent) {
        setShow(true);
      }
    } catch {}
  }, []);

  const handleAccept = () => {
    try {
      localStorage.setItem('zenify_cookie_consent', 'accepted');
    } catch {}
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="fixed bottom-24 sm:bottom-28 right-4 sm:right-6 z-50 max-w-sm p-4 rounded-2xl bg-zinc-950/90 backdrop-blur-xl border border-white/10 shadow-2xl text-left animate-in fade-in slide-in-from-bottom-5 duration-300">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-xl bg-brand/10 border border-brand/20 text-brand shrink-0 mt-0.5">
          <Cookie className="w-4 h-4" />
        </div>
        <div className="space-y-1.5 flex-1 pr-4">
          <p className="text-xs font-bold uppercase tracking-wider text-white">Audio & Session Storage</p>
          <p className="text-[11px] text-zinc-400 leading-relaxed">
            Zenify uses essential cookies and local audio storage to maintain your login session, save EQ audio presets, and provide fast playback. Learn more in our{' '}
            <Link to="/privacy" className="text-brand hover:underline font-medium">Privacy Policy</Link>.
          </p>
        </div>
        <button
          onClick={handleAccept}
          className="text-zinc-500 hover:text-white transition-colors p-1"
          aria-label="Close cookie banner"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="mt-3.5 flex items-center justify-end gap-2">
        <button
          onClick={handleAccept}
          className="h-8 px-4 rounded-xl bg-brand hover:bg-rose-600 text-white text-[10px] font-bold uppercase tracking-widest transition-all active:scale-95"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
