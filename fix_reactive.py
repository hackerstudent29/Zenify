import sys

file_path = 'd:\\.gemini\\Zenify\\frontend\\src\\components\\player\\ReactiveAudioBackground.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

target = '''  try {
  await idbSet(color_cache_, colors);
  } catch (e) {
  setIsMobile(window.innerWidth < 768);'''

replacement = '''  try {
    await idbSet(color_cache_, colors);
  } catch (e) {
    // ignore
  }
}

// Clean up old cache entries from localStorage (one-time migration)
if (typeof window !== 'undefined' && window.localStorage) {
  try {
    const keysToDelete: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith('color_cache_')) {
        keysToDelete.push(k);
      }
    }
    keysToDelete.forEach(k => window.localStorage.removeItem(k));
  } catch {}
}

let sessionCounter = 0;

// Default placeholder colors — warm-toned so they look good before extraction
const PLACEHOLDER_COLORS: RawColor[] = [
  { r: 160, g: 60, b: 80 },
  { r: 40, g: 80, b: 160 },
  { r: 140, g: 40, b: 120 },
  { r: 60, g: 140, b: 100 },
];

/**
 * Zenify Reactive Fluid Background v9
 * - Animation managed by a module-level singleton (FluidAnimationEngine)
 * - ZERO React lifecycle interference — one RAF loop, never stops
 * - Colors extracted via proxy-first (guaranteed CORS success)
 * - Distance threshold 28 + shade generation ? always 4 distinct colors
 */
export function ReactiveAudioBackground({ 
  coverUrl, 
  className, 
  track, 
  palette,
  speedMultiplier = 1,
  variant = 'fullview'
}: ReactiveAudioBackgroundProps) {
  const isPlaying = usePlayerStore(s => s.isPlaying);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isMobile, setIsMobile] = useState(false);
  // Stable session ID per component instance — never changes
  const sessionId = useRef(luid-).current;

  useEffect(() => {
    setIsMobile(window.innerWidth < 768);'''

content = content.replace(target, replacement)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print('Done!')
