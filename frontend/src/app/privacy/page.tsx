import React from 'react';
import { Shield, Lock, Eye, Server, RefreshCw, ChevronLeft } from 'lucide-react';
import { SEO } from '@/components/shared/SEO';
import { useRouter } from 'next/navigation';

export default function PrivacyPage() {
  const router = useRouter();

  return (
    <>
      <SEO
        title="Privacy Policy"
        description="Learn how Zenify protects your personal data, audio listening history, and privacy."
      />
      <div className="max-w-4xl mx-auto px-6 py-12 text-zinc-300">
        <div className="mb-8">
          <button
            onClick={() => router.back()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold uppercase tracking-wider text-zinc-400 hover:text-white transition-all active:scale-95 cursor-pointer"
          >
            <ChevronLeft size={14} />
            <span>Back</span>
          </button>
        </div>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-brand/10 border border-brand/20 flex items-center justify-center text-brand">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white">
              Privacy Policy
            </h1>
            <p className="text-xs text-zinc-500 font-mono">Last Updated: October 2026</p>
          </div>
        </div>

        <div className="mb-6 px-4 py-3 rounded-2xl bg-brand/5 border border-brand/20"><p className="text-lg font-kaushan text-rose-300">Your privacy and sonic telemetry are protected by design.</p></div>
        <p className="text-sm leading-relaxed text-zinc-400 mb-10">
          Welcome to Zenify. We are dedicated to delivering a next-generation music streaming experience while maintaining strict standards for your personal data and audio telemetry.
        </p>

        <div className="space-y-8 text-sm leading-relaxed border-t border-white/5 pt-8">
          <section className="space-y-3">
            <h2 className="text-base font-bold uppercase tracking-wider text-white flex items-center gap-2">
              <Eye className="w-4 h-4 text-brand" /> 1. Information We Collect
            </h2>
            <ul className="list-disc pl-5 space-y-1.5 text-zinc-400">
              <li><strong className="text-zinc-200">Account Credentials:</strong> Email address, username, display name, and avatar image when you register or sign in using Google.</li>
              <li><strong className="text-zinc-200">Streaming Telemetry:</strong> Play counts, listen duration, favorites, custom playlists, and volume preferences to optimize audio caching.</li>
              <li><strong className="text-zinc-200">Personalization Preferences:</strong> Music genres, favorite artists, listening languages, country of origin, and age provided during onboarding to tailor your Home recommendations.</li>
              <li><strong className="text-zinc-200">Local Storage:</strong> Equalizer EQ presets, 8D audio modes, UI theme preferences, onboarding drafts, and offline downloaded track cache stored locally on your device.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-bold uppercase tracking-wider text-white flex items-center gap-2">
              <Lock className="w-4 h-4 text-brand" /> 2. How We Secure Your Data
            </h2>
            <p className="text-zinc-400">
              We employ industry-standard cryptographic practices including salted bcrypt password hashing, cryptographically signed JWT session tokens with HttpOnly rotation, and parameterized database queries. We never sell or monetize your personal listening history to data brokers.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-bold uppercase tracking-wider text-white flex items-center gap-2">
              <Server className="w-4 h-4 text-brand" /> 3. Third-Party Integrations
            </h2>
            <p className="text-zinc-400">
              To provide fast audio previews and synchronized lyrics, Zenify communicates with verified content distribution networks including iTunes CDN, Cloudflare R2 storage, Cloudinary, and Deepgram speech models. These services only receive queries strictly required to stream audio or format lyrics.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-bold uppercase tracking-wider text-white flex items-center gap-2">
              <Shield className="w-4 h-4 text-brand" /> 4. Personalization & AI Analysis Transparency
            </h2>
            <div className="space-y-2 text-zinc-400">
              <p>
                <strong className="text-zinc-200">Aggregated Data Only (Zero PII):</strong> Our daily offline AI interest analysis (executed securely through Vercel AI Gateway) processes solely anonymized, aggregated listening metrics—such as top genres, audio vibe distributions, listen counts, and preferred languages. We strictly never send Personally Identifiable Information (PII) including your email address, real name, passwords, billing details, or IP addresses to any AI models.
              </p>
              <p>
                <strong className="text-zinc-200">90-Day Raw Event Retention:</strong> Raw user listening interactions, playback heartbeats, and search logs are stored for a maximum of 90 days. An automated daily cleanup worker continuously purges activity events older than 90 days from our database.
              </p>
              <p>
                <strong className="text-zinc-200">On-Demand Personalization Reset:</strong> You have complete control over your recommendation profile. You can permanently wipe all generated interest summaries, session tastes, and historical activity events at any time with a single click using the <span className="text-brand font-semibold">&quot;Reset Personalization&quot;</span> button in your Account Preferences.
              </p>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-bold uppercase tracking-wider text-white flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-brand" /> 5. Your Rights & Account Deletion
            </h2>
            <p className="text-zinc-400">
              You maintain complete ownership of your data. You may export your preferences or permanently delete your Zenify account and associated playlists at any time from your Account Settings. Upon account deletion, all personal data, preferences, and recommendation profiles are immediately and irrevocably purged.
            </p>
          </section>

          <section className="space-y-2 border-t border-white/5 pt-6">
            <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400">Questions & Concerns</h3>
            <p className="text-xs text-zinc-500">
              For privacy inquiries, please contact our team at <span className="text-brand font-mono">support@listenzenify.vercel.app</span> or submit an issue via our official GitHub repository.
            </p>
          </section>
        </div>
      </div>
    </>
  );
}
