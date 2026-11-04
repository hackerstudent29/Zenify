"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { SEO } from '@/components/shared/SEO';
import { Radio, Play, ArrowRight, X, Zap, Music2, MessageCircle } from 'lucide-react';
import api from '@/lib/api';
import notify from '@/lib/notify';
import { useAuthStore } from '@/store/authStore';
import { FONT, SURFACE, FIELD, spring, press, Group, SettingRow, Segmented } from '@/components/together/kit';

/* ───────────────────────── constants & helpers ───────────────────────── */

const CODE_LENGTH = 6;
const CAPACITY_OPTIONS = [10, 25, 50, 100] as const;
const RECENT_KEY = 'zenify_recent_rooms';
const NAME_KEY = 'zenify_display_name';

type Capacity = (typeof CAPACITY_OPTIONS)[number];
type RecentRoom = { code: string; name?: string; at: number };

const safeStorage = {
  get(store: 'local' | 'session', key: string): string | null {
    try { return (store === 'local' ? localStorage : sessionStorage).getItem(key); } catch { return null; }
  },
  set(store: 'local' | 'session', key: string, value: string) {
    try { (store === 'local' ? localStorage : sessionStorage).setItem(key, value); } catch { /* storage blocked */ }
  },
};

function getGuestId(): string {
  const existing = safeStorage.get('session', 'zenify_guest_id');
  if (existing) return existing;
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? `guest_${crypto.randomUUID().slice(0, 12)}`
      : `guest_${Math.random().toString(36).slice(2, 14)}`;
  safeStorage.set('session', 'zenify_guest_id', id);
  return id;
}

/** Accepts "abc123", "ABC-123", or a full invite link like https://site/j/ABC123 */
function extractRoomCode(raw: string): string {
  const fromUrl = raw.match(/\/(?:j|together)\/([A-Za-z0-9]{6})/i)?.[1];
  const source = fromUrl ?? raw;
  return source.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH);
}

function timeAgo(ts: number) {
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  return `${Math.floor(h / 24)} d ago`;
}

const MODE_HELP = {
  dj: 'Only you can play, pause, seek and skip.',
  collab: 'Anyone in the room can play, pause, seek and skip.',
} as const;

const FEATURES = [
  { icon: Zap, title: 'In sync', body: 'Everyone hears the same moment of the song.' },
  { icon: Music2, title: 'Shared queue', body: 'Add songs together or let one DJ pick.' },
  { icon: MessageCircle, title: 'Chat and reactions', body: 'Talk and react while the music plays.' },
];

/* ───────────────────────── page ───────────────────────── */

export default function TogetherHubPage() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore();

  const [joinCode, setJoinCode] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createSheetOpen, setCreateSheetOpen] = useState(false);
  const [recent, setRecent] = useState<RecentRoom[]>([]);
  const [displayName, setDisplayName] = useState('');

  // Room settings
  const [roomName, setRoomName] = useState('');
  const [sessionMode, setSessionMode] = useState<'dj' | 'collab'>('collab');
  const [capacity, setCapacity] = useState<Capacity>(50);
  const [guestCanQueue, setGuestCanQueue] = useState(true);
  const [guestCanChat, setGuestCanChat] = useState(true);
  const [guestCanReact, setGuestCanReact] = useState(true);

  const codeInputRef = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false); // hard guard against double submits

  useEffect(() => {
    try {
      const parsed = JSON.parse(safeStorage.get('local', RECENT_KEY) || '[]');
      if (Array.isArray(parsed)) setRecent(parsed.slice(0, 4));
    } catch { /* corrupted – ignore */ }
    setDisplayName(safeStorage.get('local', NAME_KEY) || '');
  }, []);

  const resolvedName = useMemo(
    () => user?.name || user?.username || displayName.trim(),
    [user, displayName],
  );

  const rememberRoom = useCallback((code: string, name?: string) => {
    setRecent((prev) => {
      const next = [{ code, name, at: Date.now() }, ...prev.filter((r) => r.code !== code)].slice(0, 4);
      safeStorage.set('local', RECENT_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const forgetRoom = (code: string) => {
    setRecent((prev) => {
      const next = prev.filter((r) => r.code !== code);
      safeStorage.set('local', RECENT_KEY, JSON.stringify(next));
      return next;
    });
  };

  const persistName = () => {
    if (!isAuthenticated && displayName.trim()) safeStorage.set('local', NAME_KEY, displayName.trim());
  };

  const joinRoom = useCallback(
    async (rawCode: string) => {
      const code = extractRoomCode(rawCode);
      if (code.length < CODE_LENGTH) {
        notify(`Enter the ${CODE_LENGTH}-character room code`, 'error');
        return;
      }
      if (inFlight.current) return;
      inFlight.current = true;
      setIsJoining(true);
      persistName();
      try {
        const res = await api.post(`/together/rooms/${code}/join`, {
          guestId: !isAuthenticated ? getGuestId() : undefined,
          guestName: resolvedName || `Listener ${Math.floor(100 + Math.random() * 900)}`,
        });
        if (res.data?.success && res.data?.ticket) {
          safeStorage.set('session', `zenify_ticket_${code}`, res.data.ticket);
          rememberRoom(code, res.data?.roomName);
          router.push(`/together/${code}`);
        } else {
          notify('Could not join this session', 'error');
        }
      } catch (err: any) {
        const status = err?.response?.status;
        const fallback =
          status === 404 ? 'No session with that code. It may have ended.'
          : status === 403 ? 'You can’t join this session.'
          : status === 409 || status === 429 ? 'This session is full.'
          : 'Couldn’t connect. Check your connection and try again.';
        notify(err?.response?.data?.message || fallback, 'error');
      } finally {
        inFlight.current = false;
        setIsJoining(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isAuthenticated, resolvedName, router, rememberRoom],
  );

  const handleCreateSession = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setIsCreating(true);
    persistName();
    try {
      const res = await api.post('/together/rooms', {
        name: roomName.trim() || undefined,
        mode: sessionMode,
        maxListeners: capacity,
        guestCanQueue,
        guestCanChat,
        guestCanReact,
        guestId: !isAuthenticated ? getGuestId() : undefined,
        guestName: resolvedName || 'Host',
      });
      if (res.data?.success && res.data?.roomCode) {
        const code = String(res.data.roomCode).toUpperCase();
        safeStorage.set('session', `zenify_ticket_${code}`, res.data.ticket);
        rememberRoom(code, roomName.trim() || undefined);
        notify('Session ready', 'success');
        setCreateSheetOpen(false);
        router.push(`/together/${code}`);
      } else {
        notify('Couldn’t start the session. Try again.', 'error');
      }
    } catch (err: any) {
      notify(err?.response?.data?.message || 'Couldn’t start the session. Try again.', 'error');
    } finally {
      inFlight.current = false;
      setIsCreating(false);
    }
  };

  const onCodeChange = (value: string) => setJoinCode(extractRoomCode(value));

  /* ───────────── render ───────────── */

  return (
    <div
      style={{ fontFamily: FONT }}
      className="mx-auto min-h-screen max-w-4xl select-none px-4 pb-32 pt-20 text-white antialiased sm:px-6 sm:pt-24"
    >
      <SEO
        title="Listen Together – Zenify"
        description="Listen in sync with up to 100 friends. Shared queue, live chat and reactions."
        path="/together"
      />

      <header className="mb-6">
        <h1 className="text-[32px] font-bold tracking-tight sm:text-[40px]">Listen Together</h1>
        <p className="mt-1 max-w-md text-[15px] leading-snug text-white/55">
          Play the same music in sync with friends. Share a queue, chat and react live.
        </p>
      </header>

      {/* Start + Join */}
      <div className="grid gap-4 md:grid-cols-2">
        <section className={`${SURFACE} flex flex-col p-5`}>
          <h2 className="text-[17px] font-semibold">Start a session</h2>
          <p className="mt-1 text-[14px] leading-snug text-white/50">
            Create a room for up to 100 listeners and share the code.
          </p>
          <motion.button
            {...press}
            type="button"
            onClick={() => setCreateSheetOpen(true)}
            className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand text-[15px] font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 md:mt-auto"
          >
            <Play className="h-4 w-4 fill-current" />
            New session
          </motion.button>
        </section>

        <section className={`${SURFACE} p-5`}>
          <h2 className="text-[17px] font-semibold">Join with a code</h2>
          <p className="mt-1 text-[14px] leading-snug text-white/50">Type the code or paste an invite link.</p>

          <form onSubmit={(e) => { e.preventDefault(); joinRoom(joinCode); }} className="mt-4 space-y-3">
            {/* One real input, six visual cells: paste, autofill and screen readers all work. */}
            <label className="relative block cursor-text">
              <span className="sr-only">Room code</span>
              <input
                ref={codeInputRef}
                value={joinCode}
                onChange={(e) => onCodeChange(e.target.value)}
                onPaste={(e) => { e.preventDefault(); onCodeChange(e.clipboardData.getData('text')); }}
                inputMode="text"
                autoCapitalize="characters"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                maxLength={120}
                aria-label="Room code"
                className="absolute inset-0 z-10 h-full w-full cursor-text opacity-0"
              />
              <div className="grid grid-cols-6 gap-2">
                {Array.from({ length: CODE_LENGTH }).map((_, i) => {
                  const active = i === Math.min(joinCode.length, CODE_LENGTH - 1);
                  return (
                    <motion.div
                      key={i}
                      animate={{ scale: active ? 1.04 : 1 }}
                      transition={spring}
                      className={`flex h-12 items-center justify-center rounded-xl bg-[#2c2c2e] text-xl font-semibold tabular-nums ring-2 transition-shadow sm:h-14 sm:text-2xl ${
                        active ? 'ring-brand/70' : 'ring-transparent'
                      }`}
                    >
                      {joinCode[i] || <span className="text-white/15">•</span>}
                    </motion.div>
                  );
                })}
              </div>
            </label>

            {!isAuthenticated && (
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value.slice(0, 24))}
                placeholder="Your name (optional)"
                aria-label="Your display name"
                className={FIELD}
              />
            )}

            <motion.button
              {...press}
              type="submit"
              disabled={isJoining || joinCode.length < CODE_LENGTH}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-white text-[15px] font-semibold text-black transition-opacity disabled:pointer-events-none disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              {isJoining ? 'Joining…' : 'Join session'}
              {!isJoining && <ArrowRight className="h-4 w-4" />}
            </motion.button>
          </form>
        </section>
      </div>

      {/* Recent */}
      <div className="mt-6">
        <Group title="Recent sessions">
          {recent.length === 0 ? (
            <p className="px-4 py-4 text-[14px] text-white/45">
              Sessions you start or join will show up here.
            </p>
          ) : (
            <AnimatePresence initial={false}>
              {recent.map((r) => (
                <motion.div
                  key={r.code}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, x: -24 }}
                  transition={spring}
                  className="flex items-center gap-1 pr-2"
                >
                  <button
                    type="button"
                    onClick={() => joinRoom(r.code)}
                    disabled={isJoining}
                    className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.04] active:bg-white/[0.08] disabled:opacity-50"
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand/15 text-brand">
                      <Radio className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-medium">{r.name || `Session ${r.code}`}</span>
                      <span className="block text-[12.5px] text-white/45">{r.code} · {timeAgo(r.at)}</span>
                    </span>
                  </button>
                  <motion.button
                    {...press}
                    type="button"
                    onClick={() => forgetRoom(r.code)}
                    aria-label={`Remove ${r.code} from recent`}
                    className="grid h-8 w-8 place-items-center rounded-full text-white/35 hover:bg-white/10 hover:text-white"
                  >
                    <X className="h-4 w-4" />
                  </motion.button>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </Group>
      </div>

      {/* What you get */}
      <div className="mt-6">
        <Group title="What you get">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="flex items-center gap-3 px-4 py-3">
              <Icon className="h-5 w-5 shrink-0 text-brand" />
              <div className="min-w-0">
                <p className="text-[15px] font-medium leading-tight">{title}</p>
                <p className="mt-0.5 text-[12.5px] text-white/45">{body}</p>
              </div>
            </div>
          ))}
        </Group>
      </div>

      {/* Create sheet */}
      <BottomSheet
        isOpen={createSheetOpen}
        onClose={() => !isCreating && setCreateSheetOpen(false)}
        title="New session"
        subtitle="Choose how your room works"
      >
        <div className="space-y-5 py-2">
          <Group>
            <div className="p-3">
              <label htmlFor="room-name" className="sr-only">Session name</label>
              <input
                id="room-name"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value.slice(0, 40))}
                placeholder="Session name (Friday night queue)"
                className={FIELD}
              />
            </div>
            {!isAuthenticated && (
              <div className="p-3">
                <label htmlFor="host-name" className="sr-only">Your name</label>
                <input
                  id="host-name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value.slice(0, 24))}
                  placeholder="Your name"
                  className={FIELD}
                />
              </div>
            )}
          </Group>

          <div>
            <h3 className="mb-1.5 px-4 text-[12.5px] font-medium text-white/45">Who controls playback</h3>
            <Segmented<'dj' | 'collab'>
              id="mode"
              value={sessionMode}
              onChange={setSessionMode}
              options={[{ value: 'dj', label: 'DJ only' }, { value: 'collab', label: 'Everyone' }]}
            />
            <p className="mt-1.5 px-4 text-[12px] text-white/40">{MODE_HELP[sessionMode]}</p>
          </div>

          <div>
            <h3 className="mb-1.5 px-4 text-[12.5px] font-medium text-white/45">Room size</h3>
            <Segmented<Capacity>
              id="size"
              value={capacity}
              onChange={setCapacity}
              options={CAPACITY_OPTIONS.map((n) => ({ value: n, label: String(n) }))}
            />
            <p className="mt-1.5 px-4 text-[12px] text-white/40">Maximum listeners, including you.</p>
          </div>

          <Group title="What listeners can do">
            <SettingRow title="Add songs" description="Let listeners add songs to the queue." checked={guestCanQueue} onChange={setGuestCanQueue} />
            <SettingRow title="Chat" description="Let listeners send messages in the room." checked={guestCanChat} onChange={setGuestCanChat} />
            <SettingRow title="Reactions" description="Let listeners send emoji reactions." checked={guestCanReact} onChange={setGuestCanReact} />
          </Group>

          <motion.button
            {...press}
            type="button"
            onClick={handleCreateSession}
            disabled={isCreating}
            className="flex h-12 w-full items-center justify-center rounded-xl bg-brand text-[15px] font-semibold text-white disabled:opacity-50"
          >
            {isCreating ? 'Starting…' : 'Start session'}
          </motion.button>
        </div>
      </BottomSheet>
    </div>
  );
}