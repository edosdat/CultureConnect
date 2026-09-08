import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { PUBLIC_REVALIDATE_CACHE_CONTROL } from '@/lib/httpCache';

/** Browser max-age=0 so a normal refresh revalidates after catalogue rotate. */
export function middleware(request: NextRequest) {
  const res = NextResponse.next();
  if (request.method !== 'GET' && request.method !== 'HEAD') return res;
  res.headers.set('Cache-Control', PUBLIC_REVALIDATE_CACHE_CONTROL);
  return res;
}

export const config = {
  matcher: ['/', '/api/agenda'],
};
