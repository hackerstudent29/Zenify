"use client";

import React, { useState, useRef, useEffect } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { useUIStore } from '@/store/ui';
import { getTrackCover, formatArtists, formatDisplayTitle, getApiBaseUrl } from '@/lib/utils';
import notify from '@/lib/notify';
import { Download, Share2, Copy, Sparkles, Check, Music2, Quote } from 'lucide-react';

export function ShareSheet() {
  const { isShareSheetOpen, sharePayload, closeShareSheet } = useUIStore();
  const [aspectRatio, setAspectRatio] = useState<'story' | 'square'>('story');
  const [copied, setCopied] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  if (!isShareSheetOpen || !sharePayload) return null;

  const track = sharePayload.track;
  const album = sharePayload.album || track?.album;
  const artist = sharePayload.artist || track?.artist;
  const lyricsLines = sharePayload.lyricsLines || [];
  const isLyricCard = sharePayload.type === 'lyrics' && lyricsLines.length > 0;

  const title = track?.title || album?.name || album?.title || artist?.name || 'Zenify';
  const subtitle = track ? formatArtists(track.artists || track.artist) : (album?.artist?.name || 'Music');
  const coverUrl = track ? getTrackCover(track) : (album?.coverUrl || artist?.imageUrl || '/images/placeholder.png');

  // Server share URL
  const entityType = sharePayload.type === 'lyrics' ? 'track' : sharePayload.type;
  const entityId = track?.id || album?.id || artist?.id || 'featured';
  const shareLink = typeof window !== 'undefined'
    ? (sharePayload.type === 'replay' ? `${window.location.origin}/replay` : `${window.location.origin}/s/${entityType}/${entityId}`)
    : '';

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareLink);
    setCopied(true);
    notify('Link copied to clipboard!', 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  /**
   * High-resolution canvas renderer (1080x1920 or 1080x1080)
   */
  const renderCardToCanvas = async (): Promise<HTMLCanvasElement> => {
    const canvas = document.createElement('canvas');
    const width = 1080;
    const height = aspectRatio === 'story' ? 1920 : 1080;
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get canvas context');

    // 1. Background deep gradient
    const bgGrad = ctx.createLinearGradient(0, 0, width, height);
    bgGrad.addColorStop(0, '#1c1c1e');
    bgGrad.addColorStop(0.4, '#121214');
    bgGrad.addColorStop(1, '#0a0a0c');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // 2. Crimson glow aura
    const glowGrad = ctx.createRadialGradient(width / 2, height * 0.35, 50, width / 2, height * 0.35, width * 0.7);
    glowGrad.addColorStop(0, 'rgba(225, 29, 72, 0.28)');
    glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glowGrad;
    ctx.fillRect(0, 0, width, height);

    // 3. Load cover art via CORS proxy
    const proxyUrl = `${getApiBaseUrl()}/utils/proxy-image?url=${encodeURIComponent(coverUrl)}`;
    const img = new Image();
    img.crossOrigin = 'anonymous';

    await new Promise<void>((resolve) => {
      img.onload = () => resolve();
      img.onerror = () => resolve(); // fallback gracefully
      img.src = proxyUrl;
    });

    if (isLyricCard) {
      // --- LYRICS TEMPLATE ---
      const artSize = 160;
      const artX = (width - artSize) / 2;
      const artY = aspectRatio === 'story' ? 240 : 120;

      // Draw small artwork at top
      if (img.complete && img.naturalWidth) {
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(artX, artY, artSize, artSize, 28);
        ctx.clip();
        ctx.drawImage(img, artX, artY, artSize, artSize);
        ctx.restore();
      }

      // Track & Artist title above lyrics
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.font = '600 32px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${formatDisplayTitle(title)} • ${subtitle}`, width / 2, artY + artSize + 60);

      // Draw Lyrics
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 56px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif';
      ctx.textAlign = 'center';

      const startY = aspectRatio === 'story' ? 820 : 540;
      const lineHeight = 88;

      lyricsLines.slice(0, 4).forEach((line, idx) => {
        ctx.fillText(`“${line}”`, width / 2, startY + idx * lineHeight);
      });
    } else {
      // --- NOW PLAYING CARD TEMPLATE ---
      const artSize = aspectRatio === 'story' ? 680 : 520;
      const artX = (width - artSize) / 2;
      const artY = aspectRatio === 'story' ? 360 : 160;

      // Draw large cover art with rounded corners and drop shadow
      if (img.complete && img.naturalWidth) {
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
        ctx.shadowBlur = 40;
        ctx.shadowOffsetY = 20;

        ctx.beginPath();
        ctx.roundRect(artX, artY, artSize, artSize, 36);
        ctx.clip();
        ctx.drawImage(img, artX, artY, artSize, artSize);
        ctx.restore();
      }

      // Title
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 64px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(formatDisplayTitle(title), width / 2, artY + artSize + 110);

      // Subtitle
      ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
      ctx.font = '500 40px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif';
      ctx.fillText(subtitle, width / 2, artY + artSize + 175);

      // Soundwave Spectrum Accent
      const barY = artY + artSize + 250;
      const barCount = 28;
      const barWidth = 8;
      const barGap = 12;
      const totalWidth = barCount * (barWidth + barGap);
      const startX = (width - totalWidth) / 2;

      ctx.fillStyle = '#ff2d55';
      for (let i = 0; i < barCount; i++) {
        const barHeight = 16 + Math.sin(i * 0.4) * 24 + (i % 3) * 12;
        ctx.beginPath();
        ctx.roundRect(startX + i * (barWidth + barGap), barY - barHeight / 2, barWidth, barHeight, 4);
        ctx.fill();
      }
    }

    // 4. Zenify Branding Footer Pill
    const pillY = height - 160;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.beginPath();
    ctx.roundRect(width / 2 - 190, pillY - 32, 380, 64, 32);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ZENIFY • listenzenify.com', width / 2, pillY + 10);

    return canvas;
  };

  const handleDownload = async () => {
    setIsExporting(true);
    try {
      const canvas = await renderCardToCanvas();
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `zenify-${formatDisplayTitle(title).toLowerCase().replace(/[^a-z0-9]/g, '-')}.png`;
        a.click();
        URL.revokeObjectURL(url);
        notify('Image saved to device!', 'success');
      }, 'image/png');
    } catch (err: any) {
      notify('Failed to generate image', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const handleNativeShare = async () => {
    setIsExporting(true);
    try {
      const canvas = await renderCardToCanvas();
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        const file = new File([blob], 'zenify-share.png', { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: `Listen to ${title} on Zenify`,
            text: `${title} by ${subtitle}`,
            url: shareLink,
            files: [file],
          });
        } else {
          // Fallback to clipboard
          handleCopyLink();
        }
      }, 'image/png');
    } catch (err: any) {
      handleCopyLink();
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <BottomSheet
      isOpen={isShareSheetOpen}
      onClose={closeShareSheet}
      title="Share Music"
      subtitle={isLyricCard ? 'Share selected lyrics with friends' : 'Create an Apple Music-style share card'}
    >
      <div className="space-y-6 py-2">
        {/* Aspect Ratio Switcher */}
        <SegmentedControl
          id="share-aspect-ratio"
          options={[
            { value: 'story', label: 'Story (9:16)' },
            { value: 'square', label: 'Square (1:1)' },
          ]}
          value={aspectRatio}
          onChange={(v) => setAspectRatio(v as 'story' | 'square')}
        />

        {/* Live CSS Preview */}
        <div className="flex justify-center">
          <div
            className={`relative rounded-3xl p-6 bg-gradient-to-b from-[#222226] via-[#141416] to-[#0c0c0e] border border-white/10 shadow-2xl flex flex-col items-center justify-between transition-all duration-300 overflow-hidden ${
              aspectRatio === 'story' ? 'w-56 h-96' : 'w-64 h-64'
            }`}
          >
            {/* Crimson glow */}
            <div className="absolute inset-0 bg-brand/15 blur-2xl rounded-full pointer-events-none" />

            {isLyricCard ? (
              <div className="space-y-3 text-center my-auto z-10">
                <Quote className="w-6 h-6 text-brand mx-auto opacity-75" />
                <div className="space-y-1.5">
                  {lyricsLines.slice(0, 3).map((l, i) => (
                    <p key={i} className="text-[13px] font-bold text-white line-clamp-2 leading-snug">
                      "{l}"
                    </p>
                  ))}
                </div>
                <div className="pt-2 text-[11px] text-white/50 truncate max-w-[180px]">
                  {formatDisplayTitle(title)} • {subtitle}
                </div>
              </div>
            ) : (
              <div className="space-y-3 text-center my-auto z-10">
                <div className="w-28 h-28 mx-auto rounded-xl overflow-hidden shadow-xl border border-white/10 bg-zinc-900">
                  <img src={coverUrl} alt="Cover" className="w-full h-full object-cover" />
                </div>
                <div>
                  <div className="text-[14px] font-bold text-white truncate max-w-[190px]">
                    {formatDisplayTitle(title)}
                  </div>
                  <div className="text-[11px] text-white/60 truncate max-w-[190px]">{subtitle}</div>
                </div>
              </div>
            )}

            {/* Branding Pill */}
            <div className="px-3 py-1 rounded-full bg-white/[0.08] text-[9px] font-bold tracking-widest text-white/80 uppercase z-10">
              Zenify
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <button
            type="button"
            onClick={handleCopyLink}
            className="h-12 px-4 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-white font-semibold text-[14px] flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? 'Link Copied' : 'Copy Link'}</span>
          </button>

          <button
            type="button"
            onClick={handleDownload}
            disabled={isExporting}
            className="h-12 px-4 rounded-xl bg-white hover:bg-white/90 text-black font-semibold text-[14px] flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            <span>{isExporting ? 'Exporting...' : 'Save Card'}</span>
          </button>
        </div>

        {/* Native mobile share option */}
        {typeof navigator !== 'undefined' && 'share' in navigator && (
          <button
            type="button"
            onClick={handleNativeShare}
            disabled={isExporting}
            className="w-full h-12 rounded-xl bg-brand text-white font-bold text-[14px] flex items-center justify-center gap-2 hover:brightness-110 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
          >
            <Share2 className="w-4 h-4" />
            <span>Share to Instagram / WhatsApp</span>
          </button>
        )}
      </div>
    </BottomSheet>
  );
}

