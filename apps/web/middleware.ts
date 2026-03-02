import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/login'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) return NextResponse.next();
  // Token check is client-side; middleware just protects static-nav access
  // by inspecting a cookie set at login (optional future enhancement).
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next|favicon.ico|api).*)'],
};
