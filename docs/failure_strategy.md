# Failure & Reliability Strategy (Zenify)

## Infrastructure
- **Frontend**: Vercel
- **Backend**: Railway
- **DB**: Supabase

## Scenarios
1. **Supabase Slow**: 
   - Backend caching (Redis) serves read-heavy data.
   - Circuit breakers stop non-essential writes.
2. **Railway Restart**: 
   - Graceful shutdown handlers in Fastify/Node.
   - Client-side retry logic (exponential backoff).
3. **Redis Fails**: 
   - Fallback to DB (degraded performance but functional).
   - Log alerts immediately.
4. **Cloudinary Fails**:
   - CDN fallback if available (or display maintenance placeholder for art).
   - Audio playback error UX.
5. **JWT Expires**:
   - Silent refresh via HTTP-only cookie.
   - Redirect to login if refresh fails.
6. **Traffic Spike**:
   - Rate limiting (429).
   - Queue requests (BullMQ).
   - serve stale-while-revalidate headers.

## Resilience Patterns
- **Circuit Breaker**: Detect failures not to overload downstream services.
- **Rate Limiting**: Protect resources.
- **Monitoring**: Logging (Pino), Alerting (to be defined).
- **Idempotency**: Ensure safe retries for writes.
