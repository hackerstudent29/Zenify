# Zenify: Evolution to Production-Grade Music Platform

## 1. Overview
Transforming Zenify from a "Spotify-style shell" into a robust music platform with clear role separation, deep data control, and a high-fidelity user experience.

## 2. Technical Roadmap

### Phase 1: Data Architecture (Backend)
- [ ] **Schema Refactoring**: Move `Artist` and `Album` from strings to relational models.
- [ ] **Listening History**: Implement a dedicated `History` table for chronological tracking.
- [ ] **Admin Roles**: Enforce role-based access control (RBAC) in middleware.
- [ ] **Track Enhancements**: Add `lyrics`, `isFeatured`, and `isTrending` flags.

### Phase 2: User Experience Redesign (Frontend)
- [ ] **Home Page Expansion**: Implement 5-7 dynamic rows (Made for You, Trending, etc.).
- [ ] **Horizontal Content Rows**: Create a scrollable container with card-hover interactions.
- [ ] **Media Cards**: Redesign with play button overlays, glow effects, and glassmorphism.
- [ ] **Advanced Search**: Add filter tabs (Songs, Artists, Albums, Playlists).
- [ ] **Library V2**: Split into Liked Songs, Albums, and Artists.
- [ ] **Song Detail View**: Immersive fullscreen/expandable view with lyrics.
- [ ] **Profile Management**: Profile page with settings and theme toggle.

### Phase 3: Admin Control Center
- [ ] **Admin Dashboard (`/admin`)**: Real-time analytics and platform KPIs.
- [ ] **Content Management**: CRUD interfaces for Songs, Artists, Albums, and Playlists.
- [ ] **User Management**: Moderation tools and permission controls.

### Phase 4: Polish & Performance
- [ ] **Micro-animations**: Enhanced transitions using Framer Motion.
- [ ] **Global State**: Revamped `playerStore` with advanced queueing.
- [ ] **Soft UI**: Final pass on border-radius, shadows, and glass effects.

## 3. Revised Folder Structure (Scalability)

```text
/frontend/src
  /app
    /(auth)         # Auth routes
    /(main)         # Consumer app routes
      /library...   
      /profile...
      /search...
      /track/[id]...
    /admin          # Admin dashboard
  /components
    /ui             # Low-level primitives (Shadcn)
    /shared         # Reusable business components (MediaCard, ContentRow)
    /player         # Complex player-related components
  /store            # Zustand stores
  /hooks            # Custom React hooks
  /lib              # Utilities and API clients
/backend/src
  /services         # Business logic
  /controllers      # Request handling
  /routes           # API endpoints
  /middleware       # RBAC, Auth, Validation
```

## 4. Design Language
- **Accent**: Soft Violet (`#8B5CF6`)
- **Theme**: Nordic Dark (Glassmorphism / Backdrop blurs)
- **Depth**: Surface layering using opacity and subtle borders.
