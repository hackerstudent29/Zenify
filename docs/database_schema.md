# Database Schema Design (Zenify)

## Constraints
- **Scale**: 100k+ Users, 1M+ Tracks
- **Optimization**: Search optimized, PostgreSQL Arrays (no JSON string hacks)

## Models
- **User**: (ADMIN, LISTENER)
- **Track**
- **Playlist**
- **PlaylistTrack**: Explicit join table
- **Like**
- **Rating**
- **UserTrackStat**
- **RefreshToken**

## Requirements
- **Indexing**: Proper strategies
- **Constraints**: Composite unique
- **Cascades**: Foreign key rules
- **Deletes**: Soft delete support
- **Timestamps**: Required
- **Pagination**: Cursor-compatible
