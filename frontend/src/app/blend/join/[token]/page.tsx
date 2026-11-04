"use client";

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import notify from '@/lib/notify';
import { SEO } from '@/components/shared/SEO';
import { HeartHandshake, Loader2, Sparkles } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';

export default function BlendJoinRedirectPage() {
  const params = useParams() as any;
  const token = params.token;
  const navigate = useNavigate();

  const [status, setStatus] = useState<'joining' | 'error' | 'success'>('joining');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setErrorMessage('Missing invite token.');
      return;
    }

    let isMounted = true;

    async function executeJoin() {
      try {
        const res = await api.post('/me/blend/join', { token });
        if (!isMounted) return;
        setStatus('success');
        notify('Connected to Blend!', 'success');
        setTimeout(() => {
          navigate(`/blend/${res.data.sessionId}`, { replace: true });
        }, 1200);
      } catch (err: any) {
        if (!isMounted) return;
        setStatus('error');
        setErrorMessage(err.response?.data?.error || 'Invalid or expired Blend invite.');
      }
    }

    executeJoin();

    return () => {
      isMounted = false;
    };
  }, [token, navigate]);

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 text-center select-none font-sans">
      <SEO title="Joining Blend - Zenify" description="Connecting your shared music taste." />

      {status === 'joining' && (
        <div className="space-y-4 max-w-sm">
          <div className="relative w-16 h-16 mx-auto rounded-full bg-brand/20 border border-brand/30 flex items-center justify-center text-brand">
            <HeartHandshake className="w-8 h-8" />
            <Loader2 className="absolute inset-0 w-16 h-16 animate-spin text-brand/40" />
          </div>
          <h2 className="text-xl font-bold tracking-tight">Joining Blend...</h2>
          <p className="text-xs text-white/50 leading-relaxed">
            Analyzing mutual musical tastes and assembling your 50-song blended playlist.
          </p>
        </div>
      )}

      {status === 'success' && (
        <div className="space-y-4 max-w-sm">
          <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <HeartHandshake className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold tracking-tight text-white">Blend Ready!</h2>
          <p className="text-xs text-white/50">Redirecting to your shared playlist...</p>
        </div>
      )}

      {status === 'error' && (
        <div className="max-w-md w-full">
          <EmptyState
            icon={Sparkles}
            title="Unable to Join Blend"
            description={errorMessage}
            actionLabel="Back to Blends"
            onAction={() => navigate('/blend')}
          />
        </div>
      )}
    </div>
  );
}
