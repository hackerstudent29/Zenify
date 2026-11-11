# Backend Architecture (Zenify)

## Stack
- **Node.js**: TypeScript
- **Framework**: Fastify (preferred)
- **ORM**: Prisma
- **Database**: PostgreSQL (Supabase)
- **Hosting**: Railway
- **Caching**: Redis (Upstash/Railway)
- **Auth**: JWT (Access + Refresh Token, Role-based: ADMIN, LISTENER)

## Requirements

### 1. Architecture
- **Layered**: Controller -> Service -> Repository -> Database
- **Logic**: No business logic in controllers
- **Error Handling**: Centralized middleware
- **Validation**: Zod
- **Logging**: Pinto (Structured)

### 2. API Design
- **RESTful**
- **Pagination**: Cursor-based for tracks/playlists
- **Search**: Server-side `/search?q=`
- **Rate Limiting**: Middleware
- **Caching**: Heavy read endpoints
- **Traffic**: Graceful handling of spikes

### 3. Database Optimization
- **Indexing**: `Track(title)`, `Track(artist)`, `Playlist(name)`, `Like(userId, trackId)`
- **Arrays**: `favoriteGenres` -> `TEXT[]`, `tags` -> `TEXT[]`
- **Composite Indexes**: As required
- **Deletes**: Soft delete for tracks

### 4. Streaming Logic
- **Delivery**: Signed Cloudinary URLs
- **Proxy**: Do NOT proxy audio through backend
- **Stats**: Async play count increment (non-blocking)
- **Jobs**: Background queue for `UserTrackStat` updates

### 5. Error Handling
- **Global Error Handler**
- **Types**: 
  - 400 Validation
  - 401 Auth
  - 403 Forbidden
  - 404 Not Found
  - 429 Rate Limit
  - 500 Server Error
- **Format**: Standard JSON

### 6. Heavy Request Handling
- **Redis**: Home feed, Trending tracks
- **Rate Limit**: Per IP
- **Queues**: Write operations (BullMQ)
- **Queries**: Avoid N+1

### 7. Authentication
- **JWT**: 15 min expiry
- **Refresh Token**: Rotation, HTTP-only cookies
- **Admin**: Route protection middleware

### 8. Deployment
- **Env Vars**: Structured
- **Railway**: Config
- **Supabase**: Pooled connection
- **Logging**: Production mode
