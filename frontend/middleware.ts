import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
    const path = request.nextUrl.pathname;

    // Define public paths
    const isPublicPath = path === '/login' || path === '/register' || path.startsWith('/auth');

    // Check for accessToken or refreshToken cookie
    // Note: HttpOnly cookies are not accessible via document.cookie but are sent in requests.
    // Next.js middleware can read them.
    const accessToken = request.cookies.get('accessToken')?.value;
    const refreshToken = request.cookies.get('refreshToken')?.value;

    // If user is logged in (has tokens) and tries to access login/register
    // We used to redirect to home, but this causes infinite loops if the token is invalid (401 on API)
    // but the cookie still exists. The API redirects to /login, Middleware redirects to /, repeating.
    // Let's allow access to /login even if "authenticated" (cookie present), or better, 
    // let's rely on the client-side to redirect if they are truly valid.
    /*
    if (isPublicPath && (accessToken || refreshToken)) {
         return NextResponse.redirect(new URL('/', request.url));
    }
    */

    if (!isPublicPath && !accessToken && !refreshToken) {
        // If user is not logged in and tries to access protected route, redirect to login
        return NextResponse.redirect(new URL('/login', request.url));
    }

    // If we have refreshToken but no accessToken, the client (api.ts interceptor) 
    // or a separate middleware logic should handle refresh. 
    // Here we just allow access, and let the API calls fail/refresh or client-side verify.
    // Ideally, we could call backend verify here, but that adds latency.
    // Shallow check for cookie existence is usually enough for middleware level routing.

    return NextResponse.next();
}

// Configure paths to match
export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - api (API routes)
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - public files (images, etc)
         */
        '/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)',
    ],
};
