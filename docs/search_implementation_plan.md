# Implementation Plan - High-Performance Supabase Search System

This plan outlines the steps to implement a robust, scalable full-text search system using PostgreSQL (Supabase) as requested.

## 1. Database Layer (PostgreSQL)
We will use native SQL migrations to set up the Full-Text Search infrastructure.

### Changes to Existing Tables:
- **Tracks**: Add `search_vector`, `language`, `popularity_score`, `like_count`.
- **Artists**: Add `search_vector`, `follower_count`, `verified`, `popularity_score`.
- **Albums**: Add `search_vector`, `popularity_score`.
- **Playlists**: Add `search_vector`, `follower_count`, `popularity_score`.

### Full-Text Search Setup:
- Add GIN indexes on `search_vector` for all tables.
- Implement a trigger function `update_search_vector()` to automatically concatenate fields (title, artist, album, genre) into the vector on every insert/update.
- Implementation of `text_pattern_ops` indexes for high-speed autocomplete (prefix search).

## 2. Ranking Formula
The search results will be ordered using a weighted formula:
`Final Score = (text_rank * 0.6) + (log(play_count + 1) * 0.25) + (like_count * 0.15)`

## 3. Backend (Node.js/Fastify)
- **Controller**: Use `prisma.$queryRaw` to execute high-performance SQL queries.
- **Parallel Execution**: Use `Promise.all` to search all entities concurrently.
- **Autocomplete**: A dedicated endpoint/logic for prefix-based suggestions using indexed ILIKE.

## 4. Frontend Integration
- Debouncing (300ms) on the search input.
- Limited payload to return only essentials (ID, title, artist, URLs, counts).

## 5. Execution Steps
1. Run SQL migration script via Supabase/psql.
2. Update Prisma schema to reflect new columns.
3. Replace existing search logic with the new optimized SQL-based controller.
4. Verify ranking and performance.
