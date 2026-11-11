"use client";

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { SEO } from '@/components/shared/SEO';
import { useAuthStore } from '@/store/authStore';
import api from '@/lib/api';
import notify from '@/lib/notify';
import { Radio } from 'lucide-react';

export default function JoinRedirectPage() {
  const params = useParams() as any;
  const router = useRouter();
  const roomCode = String(params?.code || '').toUpperCase();
  const { isAuthenticated } = useAuthStore();
  const [status, setStatus] = useState('Connecting to session...');

  useEffect(() => {
    if (!roomCode) return;

    // Allow guest listeners or signed-in listeners
    const guestId = !isAuthenticated ? (sessionStorage.getItem('zenify_guest_id') || `guest_${Math.random().toString(36).slice(2, 9)}`) : undefined;
    if (guestId) sessionStorage.setItem('zenify_guest_id', guestId);

    const join = async () => {
      try {
        setStatus(`Joining room ${roomCode}...`);
        const res = await api.post(`/together/rooms/${roomCode}/join`);
        if (res.data?.success && res.data?.ticket) {
          sessionStorage.setItem(`zenify_ticket_${roomCode}`, res.data.ticket);
          router.replace(`/together/${roomCode}`);
        } else {
          throw new Error('Could not join room');
        }
      } catch (err: any) {
        notify(err.response?.data?.message || 'Room not found or has expired', 'error');
        router.replace('/together');
      }
    };

    join();
  }, [roomCode, isAuthenticated, router]);

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center text-center px-4 space-y-4">
      <SEO
        title={roomCode ? `Join Room ${roomCode} – Zenify` : 'Join Listen Together Room – Zenify'}
        description="Join a live synchronized Room Together music listening session on Zenify."
        path={roomCode ? `/j/${encodeURIComponent(roomCode)}` : '/j'}
        noindex={true}
      />
      <div className="w-16 h-16 rounded-full bg-brand/15 text-brand flex items-center justify-center animate-pulse">
        <Radio className="w-8 h-8" />
      </div>
      <h2 className="text-xl font-bold text-white tracking-wide">{status}</h2>
      <p className="text-white/50 text-[14px]">Preparing synchronized audio stream...</p>
    </div>
  );
}
