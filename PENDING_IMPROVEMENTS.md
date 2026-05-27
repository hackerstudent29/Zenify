# Pending Improvements - Task List

## ✅ COMPLETED
1. **Glassomorphism Player Background** - Fixed! Now shows colorful background through blur effect

## 🔄 IN PROGRESS / TODO

### 1. Scheduled Publish for Album Importing
**Status**: Not started
**Location**: `frontend/src/components/admin/track-upload-studio.tsx`
**What to do**:
- Add scheduled publish options to the bulk import flow
- When importing albums, allow setting a scheduled date/time for all tracks
- Or allow per-track scheduling

### 2. Fluid Reactive Background (Apple Music Style)
**Status**: Not started
**Locations**: 
- `frontend/src/components/pc/PCFullScreenPlayer.tsx`
- `frontend/src/components/player/ReactiveAudioBackground.tsx`
- Hero section
- Track page

**What to do**:
- Replace static gradient with animated fluid colors
- Extract dominant colors from album art
- Create smooth, flowing color transitions
- Use CSS animations or canvas for fluid effect
- Reference: Apple Music's animated background

**Technical approach**:
```typescript
// Use color-thief or vibrant.js to extract colors
// Animate between colors with smooth transitions
// Add subtle movement/flow effect
```

### 3. Color Extraction for New Imports
**Status**: Needs investigation
**Issue**: Not fetching correct colors from images for newly imported songs/albums

**What to check**:
- Color extraction service in backend
- Cloudinary color extraction
- Frontend color processing
- Cache issues

**Files to check**:
- `backend/src/services/track.service.ts`
- Color extraction utilities

### 4. Individual Album Art for Each Song in Album
**Status**: Not started
**Location**: `backend/src/services/external-metadata.service.ts`, track upload

**Current behavior**: Uses one album art for all songs
**Desired behavior**: Fetch individual cover art for each song

**Implementation**:
```typescript
// For each track in album:
// 1. Try to fetch individual song cover art
// 2. Search: "{artist} - {song title} cover art"
// 3. Fallback to album art if not found
// 4. Store per-track coverUrl
```

### 5. Album Import Preview with Individual Images
**Status**: Not started
**Location**: `frontend/src/components/admin/track-upload-studio.tsx`

**What to add**:
- Show thumbnail image beside each track in preview
- Display fetched individual cover art
- Show album art as fallback
- Visual indicator if using fallback vs individual art

**UI mockup**:
```
[Image] Track 1 - Song Name    [✓ Individual art]
[Image] Track 2 - Song Name    [⚠ Using album art]
[Image] Track 3 - Song Name    [✓ Individual art]
```

### 6. High Quality Image Fetcher
**Status**: Not started
**Location**: `frontend/src/components/admin/track-upload-studio.tsx`

**What to add**:
- Image link pasting area on left side of album import page
- Fetch high-quality version of pasted image URL
- Use Google Images API or similar to find HQ version
- Track selection checkboxes below image fetcher
- Apply fetched image to selected tracks

**UI Layout**:
```
┌─────────────────────────────────────────┐
│  Paste Image URL:                       │
│  [________________________] [Fetch HQ]  │
│                                         │
│  Select tracks to apply this image:     │
│  ☐ Track 1                              │
│  ☐ Track 2                              │
│  ☐ Track 3                              │
│  [Apply to Selected]                    │
└─────────────────────────────────────────┘
```

**Implementation**:
```typescript
// 1. Paste image URL
// 2. Fetch higher quality version:
//    - Try adding size parameters
//    - Use reverse image search API
//    - Fetch from original source
// 3. Allow multi-select tracks
// 4. Apply image to selected tracks
```

### 7. Home Page Layout Fixes
**Status**: Needs investigation
**Location**: `frontend/src/app/page.tsx` or home components

**Issues**:
- Some MediaCards not aligned correctly
- Inconsistent spacing
- Layout breaks in certain sections

**What to check**:
- Grid/flex layouts
- MediaCard component sizing
- Responsive breakpoints
- Container widths

**Files to check**:
- `frontend/src/components/shared/MediaCard.tsx`
- `frontend/src/components/pc/PCMediaCard.tsx`
- `frontend/src/components/mobile/MobileMediaCard.tsx`
- Home page layout components

---

## Priority Order

### High Priority (Do First):
1. ✅ Glassomorphism fix (DONE)
2. Color extraction for new imports (affects UX immediately)
3. Home page layout fixes (visible to all users)

### Medium Priority:
4. Individual album art fetching (improves quality)
5. Album import preview with images (admin UX)
6. Scheduled publish for albums (feature parity)

### Low Priority (Nice to have):
7. Fluid reactive backgrounds (visual polish)
8. High quality image fetcher (power user feature)

---

## Technical Notes

### Color Extraction
Current libraries available:
- `colorthief` - Already in package.json
- `node-vibrant` - Alternative
- Cloudinary automatic color extraction

### Image Quality Enhancement
Options:
- Google Custom Search API (reverse image search)
- Bing Image Search API
- Direct source fetching with size parameters
- AI upscaling services

### Fluid Background Animation
Approaches:
1. CSS gradients with keyframe animations
2. Canvas-based particle system
3. WebGL shaders (most performant)
4. SVG filters with animations

Recommended: Start with CSS, upgrade to Canvas if needed

---

## Testing Checklist

After implementing each feature:
- [ ] Test on desktop
- [ ] Test on mobile
- [ ] Test with different image sizes
- [ ] Test with missing images (fallbacks)
- [ ] Test performance impact
- [ ] Test with slow network
- [ ] Verify color extraction accuracy
- [ ] Check memory leaks (especially for animations)

---

## Questions to Resolve

1. **Color extraction**: Should we extract on upload or on-demand?
2. **Image quality**: What's the minimum acceptable resolution?
3. **Fluid backgrounds**: Should they be toggleable in settings?
4. **Album art fetching**: Should we retry failed fetches automatically?
5. **Scheduled albums**: Should all tracks have same schedule or individual?

---

## Resources

- Apple Music background reference: https://music.apple.com
- Color extraction: https://github.com/lokesh/color-thief
- Fluid animations: https://github.com/mrdoob/three.js (WebGL)
- Image search APIs: Google Custom Search, Bing Image Search

