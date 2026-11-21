# Zenify Sound Atlas: Apple Music style UI

Drop-in replacement for the same file layout. Public API, data layer and controller are untouched.

## What changed
- **Performance**: globe painter rewritten (one Path for all land, trig-free projection from cached sin/cos, 3 LODs, cached text/shaders, no clipPath, no per-frame allocations). Popups no longer rebuild every frame. Blur removed from everything that sits over the globe.
- **Gesture glitches fixed**: globe is a fixed stage and shelves live in a draggable sheet, so globe drag/pinch never fights page scrolling. Single tap no longer waits for double-tap timeout (manual double-tap).
- **Design**: Apple Music palette (black, #1C1C1E surfaces, #FA243C accent), iOS type scale, red back chevron, Play/Shuffle pair, circular artist shelves, song rows with inset dividers, capsule chips.
- **Motion**: spring press (firm down, soft release), spring popovers with slight overshoot, animated chips, animated stat counters, sheet snapping.

## New shared files
- widgets/atlas_components.dart (nav, section header, shelf, tile, chip, badge, play row, song row, artist item)
- widgets/atlas_callout.dart (popover shape)

Change `AtlasColors.bg` to 0xFF121214 if you want the old app shell colour.
