# Zenify - Pending Improvements & Tasks

## ✅ COMPLETED TASKS

### 1. Scheduled Publishing System ✓
- **Status**: DONE
- **Details**:
  - Backend filters tracks by releaseStatus (PUBLISHED/SCHEDULED/DRAFT)
  - Auto-publish service runs every minute to publish scheduled tracks
  - Frontend auto-sets current date + 5 mins when schedule mode selected
  - **Album Import**: Scheduled publish UI added with date/time pickers
- **Files Modified**:
  - `backend/src/services/track.service.ts`
  - `backend/src/services/scheduled-publish.service.ts`
  - `backend/src/index.ts`
  - `frontend/src/components/admin/track-upload-studio.tsx`

### 2. Individual Cover Art for Album Tracks ✓
- **Status**: DONE
- **Details**:
  - Backend fetches individual HQ cover art for each track in album
  - Frontend shows individual covers in preview with "HQ Art" badge
  - Fallback chain: individual > track.cover > album cover
- **Files Modified**:
  - `backend/src/services/external-metadata.service.ts`
  - `frontend/src/components/admin/track-upload-studio.tsx`

### 3. Glassomorphism Player Background Fix ✓
- **Status**: DONE
- **Details**:
  - Changed container background to white/5 (light transparent)
  - Added subtle gradient to player bar
  - Increased backdrop-blur to 32px
  - Now shows colorful background through glass effect
- **Files Modified**:
  - `frontend/src/components/app-layout.tsx`
  - `frontend/src/components/pc/PCPlayerBar.tsx`

### 4. Zenify Font Exclusivity ✓
- **Status**: DONE
- **Details**:
  - Removed `font-zenify` from track titles
  - Zenify font (Hi) now exclusive to logo and brand name only
- **Files Modified**:
  - `frontend/src/components/track-item.tsx`

### 5. Apple Music Style Liquid Lyrics ✓
- **Status**: DONE
- **Details**:
  - Created LiquidLyricsLine component with gradient fill effect
  - Butter-smooth RAF-based animation (60fps)
  - Scale, opacity, and blur transitions for depth
  - Fill animation follows playback progress
  - Smooth interpolation with 0.15 factor
- **Files Created**:
  - `frontend/src/components/shared/LiquidLyricsLine.tsx`
- **Files Modified**:
  - `frontend/src/components/shared/LyricsView.tsx`

### 6. Fixed Home Page MediaCard Layout ✓
- **Status**: DONE
- **Details**:
  - Fixed responsive width classes for consistent sizing
  - Improved gap spacing (1.5 → 4)
  - Better breakpoints: 180px → 200px → 210px → 220px → 230px
  - No more alignment issues
- **Files Modified**:
  - `frontend/src/components/shared/ContentRow.tsx`

### 7. High Quality Image Fetcher with Track Selection ✓
- **Status**: DONE
- **Details**:
  - Added left sidebar in album import page
  - Image URL input with HQ fetch via proxy
  - Multi-select track checkboxes
  - Apply button to assign image to selected tracks
  - Success feedback with track count
- **Files Modified**:
  - `frontend/src/components/admin/track-upload-studio.tsx`

### 8. Enhanced Color Extraction System ✓
- **Status**: DONE
- **Details**:
  - Added retry mechanism with exponential backoff (2 retries)
  - Enhanced error logging with status indicators (✅ ❌)
  - Retry on server errors (5xx), rate limits (429), network errors
  - Better debugging visibility
- **Files Modified**:
  - `backend/src/services/ai-aesthetic.service.ts`
  - `backend/src/controllers/track.controller.ts`

---

## 🔄 IN PROGRESS

### 5. Fluid Reactive Background (Apple Music Style)
- **Status**: ALREADY IMPLEMENTED ✓
- **Current Implementation**:
  - Canvas-based fluid animation with moving orbs
  - Extracts dominant colors from album art using HSL clustering
  - Audio-reactive with bass/mids/treble response
  - Smooth color transitions with 0.18 interpolation factor
  - Pre-warming (80 frames) to avoid black flash
  - Variant support: fullview, track, hero
  - Module-level singleton animation engine (zero React interference)
- **Location**: 
  - `frontend/src/components/player/ReactiveAudioBackground.tsx`
  - Used in `PCFullScreenPlayer.tsx`
- **Features**:
  - ✅ Fluid color movement
  - ✅ Audio reactivity
  - ✅ Color extraction from album art
  - ✅ Smooth transitions
  - ✅ Performance optimized
- **Next Steps**: Apply to hero section and track page if not already done

---

## 🚧 PENDING TASKS

### 6. Apple Music Style Liquid Lyrics with Filling Effect
- **Priority**: HIGH
- **Requirements**:
  - Implement liquid text effect like Apple Music
  - Add smooth filling animation as lyrics progress
  - Butter-smooth transitions between lines
  - Gradient fill effect that follows playback progress
  - Scale and fade animations for active/upcoming/past lines
- **Design Specifications**:
  - **Active Line**: Large, bold, white text with gradient fill from left to right
  - **Upcoming Lines**: Medium opacity (40-50%), slightly smaller
  - **Past Lines**: Low opacity (20-30%), smallest size
  - **Fill Effect**: Linear gradient mask that animates based on word timing
  - **Transitions**: Smooth scale, opacity, and position changes
- **Technical Approach**:
  - Use CSS `background-clip: text` for gradient fill effect
  - Animate gradient position based on word/character timing
  - Use `transform: scale()` for size transitions
  - Add `filter: blur()` for depth effect on non-active lines
  - Implement smooth easing functions (cubic-bezier)
  - Use `will-change` for performance optimization
- **Animation Details**:
  ```css
  /* Active line with filling effect */
  background: linear-gradient(90deg, white 0%, white X%, gray X%, gray 100%);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  
  /* Smooth transitions */
  transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1),
              opacity 0.3s ease-out,
              filter 0.3s ease-out;
  ```
- **Files to Modify**:
  - `frontend/src/components/shared/LyricsView.tsx`
  - May need to create new component: `LiquidLyricsLine.tsx`
- **Reference**: Apple Music lyrics display (see screenshot)

### 7. Fix Color Extraction for New Imports
- **Priority**: HIGH
- **Issue**: AI aesthetic service not extracting correct colors for newly imported songs/albums
- **Investigation Needed**:
  1. Check if NVIDIA_API_KEY is set in environment
  2. Verify AI aesthetic service is being triggered after upload
  3. Check logs for extraction failures
  4. Ensure cover URLs are accessible to the service
  5. Add retry logic or fallback color extraction
- **Files to Check**:
  - `backend/src/services/ai-aesthetic.service.ts`
  - `backend/src/controllers/track.controller.ts`
  - `backend/.env` (check for NVIDIA_API_KEY)
- **Technical Approach**:
  - AI service uses NVIDIA Llama-90B Vision API
  - Called in background after track upload/import
  - May need to add fallback to color-thief or canvas extraction
  - Consider adding retry mechanism with exponential backoff

### 7. High Quality Image Fetcher with Track Selection
- **Priority**: MEDIUM
- **Requirements**:
  - Add image URL pasting area on LEFT side of album import page
  - Fetch high-quality version of pasted image
  - Add track selection checkboxes below image fetcher
  - Apply fetched image to selected tracks
- **UI Components Needed**:
  - Image URL input field
  - "Fetch HQ Image" button
  - Preview of fetched image
  - Multi-select checkboxes for tracks
  - "Apply to Selected" button
- **Technical Approach**:
  - Use proxy-image endpoint to fetch HQ version
  - Store fetched image in state
  - Update selected tracks' coverPreviewUrl when applied
  - Add loading states and error handling
- **Files to Modify**:
  - `frontend/src/components/admin/track-upload-studio.tsx`
- **Layout**:
  ```
  [Album Import Page]
  ┌─────────────────────────────────────────┐
  │ LEFT SIDE          │ RIGHT SIDE         │
  │ ┌───────────────┐  │ ┌───────────────┐ │
  │ │ Image Fetcher │  │ │ Album Info    │ │
  │ │ [Paste URL]   │  │ │ & Track List  │ │
  │ │ [Fetch]       │  │ │               │ │
  │ │ [Preview]     │  │ │               │ │
  │ │ ☑ Track 1     │  │ │               │ │
  │ │ ☑ Track 2     │  │ │               │ │
  │ │ [Apply]       │  │ │               │ │
  │ └───────────────┘  │ └───────────────┘ │
  └─────────────────────────────────────────┘
  ```

### 8. Fix Home Page Layout
- **Priority**: MEDIUM
- **Issue**: MediaCards not aligned correctly, inconsistent spacing
- **Investigation Needed**:
  1. Inspect home page layout components
  2. Check MediaCard component sizing
  3. Fix grid/flex alignment issues
  4. Test responsive breakpoints
  5. Ensure consistent spacing across sections
- **Files to Check**:
  - `frontend/src/app/page.tsx` (or home components)
  - `frontend/src/components/shared/MediaCard.tsx`
  - `frontend/src/components/pc/PCMediaCard.tsx`
  - `frontend/src/components/mobile/MobileMediaCard.tsx`
- **Technical Approach**:
  - Use consistent grid layouts (grid-cols-2 md:grid-cols-4 lg:grid-cols-6)
  - Ensure all MediaCards have same aspect ratio
  - Add consistent gap spacing (gap-4 or gap-6)
  - Test on different screen sizes
  - Consider using CSS Grid auto-fit for responsive layouts

### 9. Apply Reactive Background to Hero Section
- **Priority**: LOW
- **Requirements**:
  - Add ReactiveAudioBackground to hero section
  - Use variant="hero" for optimized settings
  - Ensure it doesn't impact performance
- **Files to Modify**:
  - Hero section components (need to identify)
- **Technical Approach**:
  - Import ReactiveAudioBackground component
  - Add with variant="hero" prop
  - Use featured track's cover art
  - Ensure proper z-index layering

### 10. Apply Reactive Background to Track Page
- **Priority**: LOW
- **Requirements**:
  - Add ReactiveAudioBackground to track detail page
  - Use variant="track" for deeply blurred backdrop
  - Extract colors from track's cover art
- **Files to Modify**:
  - Track page components (need to identify)
- **Technical Approach**:
  - Import ReactiveAudioBackground component
  - Add with variant="track" prop
  - Pass track's cover URL
  - Ensure proper z-index layering

---

## 📋 TECHNICAL NOTES

### Color Extraction System
- **Current Implementation**: HSL-based clustering with saturation weighting
- **Fallback Chain**: 
  1. AI Aesthetic Service (NVIDIA Llama-90B Vision)
  2. Canvas-based extraction (ReactiveAudioBackground)
  3. Placeholder colors
- **Cache**: LocalStorage + in-memory Map
- **Performance**: 40x40 downsampled image for fast processing

### Scheduled Publishing Flow
1. User selects "Schedule" mode
2. Auto-sets current date + 5 mins
3. User can adjust date/time
4. Track saved with releaseStatus="SCHEDULED" and scheduledAt timestamp
5. ScheduledPublishService runs every minute
6. Checks for tracks where scheduledAt <= now
7. Updates releaseStatus to "PUBLISHED"
8. Track becomes visible in app

### Audio Extraction System
- **Multi-strategy cascading fallback**:
  1. Public APIs (yt5s.io, Cobalt, Y2Mate)
  2. Enhanced yt-dlp (iOS, Android Music, Android, MediaConnect clients)
  3. Direct stream extraction
  4. Direct HTTP download
- **Documentation**: `AUDIO_EXTRACTION_FIX.md`

### Lyrics System
- **Plain Text Sources**: 5 providers
- **Synced Timing Methods**: 5 methods
- **Enhancement Service**: Musixmatch, AZLyrics, Lyrics.com
- **Cache**: 7-day caching with quality scoring
- **Documentation**: `LYRICS_AND_TIMING_GUIDE.md`, `LYRICS_SUMMARY.md`

---

## 🎯 PRIORITY ORDER

1. **HIGH**: Apple Music Style Liquid Lyrics (Task #6)
2. **HIGH**: Fix Color Extraction for New Imports (Task #7)
3. **MEDIUM**: High Quality Image Fetcher (Task #8)
4. **MEDIUM**: Fix Home Page Layout (Task #9)
5. **LOW**: Apply Reactive Background to Hero Section (Task #10)
6. **LOW**: Apply Reactive Background to Track Page (Task #11)

---

## 🔍 INVESTIGATION CHECKLIST

### For Color Extraction Issue:
- [ ] Check backend logs for AI aesthetic service errors
- [ ] Verify NVIDIA_API_KEY in backend/.env
- [ ] Test color extraction endpoint manually
- [ ] Check if cover URLs are accessible
- [ ] Review ai-aesthetic.service.ts implementation
- [ ] Add fallback to canvas-based extraction
- [ ] Add retry mechanism with exponential backoff

### For Home Page Layout:
- [ ] Identify all sections with MediaCards
- [ ] Check grid/flex container classes
- [ ] Verify MediaCard aspect ratios
- [ ] Test on mobile, tablet, desktop
- [ ] Check for hardcoded widths/heights
- [ ] Ensure consistent gap spacing
- [ ] Review responsive breakpoints

---

## 📝 USER INSTRUCTIONS & CORRECTIONS

1. **Zenify Font**: EXCLUSIVE to logo and brand name only - never use for song titles or other content
2. **Scheduled Publish**: Auto-set current date and time to 5 minutes from now when user selects "schedule"
3. **Album Imports**: Fetch individual cover art for each song, not just use album art for all
4. **Visual Indicators**: Show "HQ Art" badge when individual cover art is found
5. **Auto-Publishing**: All scheduled tracks should auto-publish when their scheduled time arrives
6. **Glassomorphism**: Should show colorful background through blur, not black

---

## 🚀 NEXT STEPS

1. Investigate color extraction issue (check logs, API key, service implementation)
2. Add high-quality image fetcher UI to album import page
3. Fix home page MediaCard alignment and spacing
4. Apply reactive background to hero section and track page
5. Test all features end-to-end
6. Document any new features or changes

---

**Last Updated**: 2026-05-27
**Status**: 5 tasks completed, 5 tasks pending
