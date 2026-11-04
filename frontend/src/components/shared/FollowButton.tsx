"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { useUIStore } from '@/store/ui';
import { useAuthStore } from '@/store/authStore';
import { Check, Plus, UserPlus, UserCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import notify from '@/lib/notify';

export interface FollowButtonProps {
  artistId: string;
  artistName: string;
  artistImage?: string;
  className?: string;
  compact?: boolean;
}

export function FollowButton({
  artistId,
  artistName,
  artistImage,
  className,
  compact = false,
}: FollowButtonProps) {
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuthStore();
  const showToast = useUIStore((s) => s.showToast);
  const showToastWithUndo = useUIStore((s) => s.showToastWithUndo);

  // Check if following
  const { data: followStatus } = useQuery({
    queryKey: ['artist-follow-status', artistId],
    queryFn: async () => {
      const res = await api.get(`/me/following/status?artistIds=${encodeURIComponent(artistId)}`);
      return res.data?.status?.[artistId] ?? false;
    },
    staleTime: 1000 * 60 * 5,
    enabled: Boolean(isAuthenticated && artistId),
  });

  const isFollowing = Boolean(followStatus);

  const toggleMutation = useMutation({
    mutationFn: async () => {
      if (!isAuthenticated) throw new Error('AUTH_REQUIRED');
      if (isFollowing) {
        return api.delete(`/me/following/${encodeURIComponent(artistId)}`);
      } else {
        return api.post(`/me/following/${encodeURIComponent(artistId)}`, {
          artistName,
          artistImage,
        });
      }
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['artist-follow-status', artistId] });
      const previous = queryClient.getQueryData<boolean>(['artist-follow-status', artistId]);
      const next = !previous;

      queryClient.setQueryData(['artist-follow-status', artistId], next);

      if (previous) {
        // Was following, now unfollowed -> show Undo toast
        showToastWithUndo(`Unfollowed ${artistName}`, () => {
          api.post(`/me/following/${encodeURIComponent(artistId)}`, { artistName, artistImage }).then(() => {
            queryClient.invalidateQueries({ queryKey: ['artist-follow-status', artistId] });
            queryClient.invalidateQueries({ queryKey: ['followed-artists'] });
          });
        });
      } else {
        showToast(`Following ${artistName}`);
      }

      if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(10);
      return { previous };
    },
    onError: (err: any, _vars, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(['artist-follow-status', artistId], context.previous);
      }
      if (err.message === 'AUTH_REQUIRED') {
        notify('Please sign in to follow artists', 'info');
      } else {
        notify('Failed to update follow status', 'error');
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['artist-follow-status', artistId] });
      queryClient.invalidateQueries({ queryKey: ['followed-artists'] });
      queryClient.invalidateQueries({ queryKey: ['releases-timeline'] });
    },
  });

  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.94 }}
      transition={{ type: 'spring', stiffness: 500, damping: 25 }}
      onClick={(e) => {
        e.stopPropagation();
        toggleMutation.mutate();
      }}
      disabled={toggleMutation.isPending}
      className={cn(
        "rounded-full font-bold uppercase tracking-wider transition-all duration-200 select-none flex items-center justify-center gap-1.5 cursor-pointer outline-none border",
        compact ? "h-8 px-3 text-[11px]" : "h-10 px-5 text-[12px]",
        isFollowing
          ? "bg-brand border-brand text-white shadow-md shadow-brand/20 hover:brightness-105"
          : "bg-white/[0.08] hover:bg-white/[0.14] border-white/10 text-white hover:border-white/25",
        className
      )}
    >
      {isFollowing ? (
        <>
          <Check className={compact ? "w-3 h-3" : "w-3.5 h-3.5"} strokeWidth={3} />
          <span>Following</span>
        </>
      ) : (
        <>
          <Plus className={compact ? "w-3 h-3" : "w-3.5 h-3.5"} strokeWidth={2.5} />
          <span>Follow</span>
        </>
      )}
    </motion.button>
  );
}

