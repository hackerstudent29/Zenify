import React from 'react';
import { FileText, Music, AlertCircle, Scale, CheckCircle2 } from 'lucide-react';
import { SEO } from '@/components/shared/SEO';

export default function TermsPage() {
  return (
    <>
      <SEO
        title="Terms of Service"
        description="Read the terms and conditions governing the use of Zenify music streaming platform."
      />
      <div className="max-w-4xl mx-auto px-6 py-16 text-zinc-300">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-brand/10 border border-brand/20 flex items-center justify-center text-brand">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white">
              Terms of Service
            </h1>
            <p className="text-xs text-zinc-500 font-mono">Effective Date: October 2026</p>
          </div>
        </div>

        <p className="text-sm leading-relaxed text-zinc-400 mb-10">
          By accessing or using the Zenify web or mobile applications, you agree to comply with and be bound by these Terms of Service.
        </p>

        <div className="space-y-8 text-sm leading-relaxed border-t border-white/5 pt-8">
          <section className="space-y-3">
            <h2 className="text-base font-bold uppercase tracking-wider text-white flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-brand" /> 1. Platform License & Permitted Use
            </h2>
            <p className="text-zinc-400">
              Zenify grants you a personal, non-exclusive, non-transferable license to stream audio content, curate personal playlists, and utilize synchronized lyrics tools for non-commercial personal entertainment.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-bold uppercase tracking-wider text-white flex items-center gap-2">
              <Music className="w-4 h-4 text-brand" /> 2. Intellectual Property & Copyright
            </h2>
            <p className="text-zinc-400">
              Musical compositions, master sound recordings, artwork, and lyrics remain the intellectual property of their respective creators, record labels, and copyright holders. Zenify respects creator rights and responds promptly to valid DMCA copyright notices.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-bold uppercase tracking-wider text-white flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-brand" /> 3. Prohibited Conduct
            </h2>
            <ul className="list-disc pl-5 space-y-1.5 text-zinc-400">
              <li>Automated scraping, batch ripping, or unauthorized bulk downloading of streaming media.</li>
              <li>Attempting to bypass rate limiting, reverse engineer audio decryption pipelines, or abuse API endpoints.</li>
              <li>Uploading malicious audio payloads, inappropriate media, or content violating third-party rights.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-bold uppercase tracking-wider text-white flex items-center gap-2">
              <Scale className="w-4 h-4 text-brand" /> 4. Disclaimer & Limitation of Liability
            </h2>
            <p className="text-zinc-400">
              Zenify is provided "as is" and "as available". We do not guarantee uninterrupted or error-free streaming during third-party CDN downtime or network interruptions.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-bold uppercase tracking-wider text-white flex items-center gap-2">
              <FileText className="w-4 h-4 text-brand" /> 5. Subscriptions, Payments & Cancellation
            </h2>
            <p className="text-zinc-400">
              Optional supporter subscriptions and digital track unlocks are processed via verified payment gateway partners (ZenWallet / UPI). All recurring subscriptions can be canceled at any time from your Account Settings, retaining access until the end of the active billing period.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-bold uppercase tracking-wider text-white flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-brand" /> 6. Refund Policy
            </h2>
            <p className="text-zinc-400">
              Due to the digital nature of instant streaming and audio unlocking, subscription fees are generally non-refundable once activated. In the event of duplicate charges or service non-delivery, contact our support within 7 days for a full refund resolution.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-bold uppercase tracking-wider text-white flex items-center gap-2">
              <Scale className="w-4 h-4 text-brand" /> 7. Governing Law
            </h2>
            <p className="text-zinc-400">
              These Terms are governed by and construed in accordance with the laws of India, without regard to its conflict of law principles. Any legal disputes shall be subject to the exclusive jurisdiction of the competent courts in Tamil Nadu, India.
            </p>
          </section>

          <section className="space-y-2 border-t border-white/5 pt-6">
            <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400">Legal & Support Inquiries</h3>
            <p className="text-xs text-zinc-500">
              For legal, billing, or copyright inquiries, reach out to <span className="text-brand font-mono">support@listenzenify.vercel.app</span> or connect on our GitHub community.
            </p>
          </section>
        </div>
      </div>
    </>
  );
}
