# Frontend Architecture (Zenify)

## Stack
- **Framework**: Next.js App Router (Latest)
- **Language**: TypeScript (Strict)
- **Styling**: Tailwind CSS (No CSS modules)
- **State**: Zustand (Player), React Query (Server State)
- **Hosting**: Vercel

## Requirements

### 1. Architecture
- **Rendering**: Server Components default
- **Client**: "use client" only when needed
- **Context**: No global contexts except Player
- **Data**: Always paginate, no full dataset fetching

### 2. Data Flow
- **API**: Calls to Railway Backend
- **React Query**: Caching, Background refetch, Retry, Stale time
- **UX**: Optimistic updates (Likes), Debounced search (300ms)

### 3. Pages
- `/`: Paginated feed + Cached trending
- `/track/[id]`: Server-rendered metadata
- `/playlist/[id]`
- `/admin`: Protected
- `/login`

### 4. Player Architecture
- **State**: Zustand store
- **Audio**: Single element
- **Queue**: Management
- **Persistence**: localStorage
- **Behavior**: No page re-renders on play

### 5. Performance
- **Lazy Load**: Heavy components
- **Graphics**: No Three.js unless required
- **Images**: `next/image`
- **Prefetch**: Critical routes only

### 6. Error UX
- **Boundary**: Global
- **Notifications**: Toasts
- **Loading**: Skeletons
- **Retry**: UI buttons
- **Offline**: Graceful handling

### 7. Modern UI
- **Typography**: Clean
- **Spacing**: Generous
- **Colors**: Neutral palette
- **Motion**: Subtle micro-animations (Framer Motion)
- **Style**: "Not AI-Generated", Apple-level polish
