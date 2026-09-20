import { NextRequest, NextResponse } from 'next/server';
import { getCorsHeaders } from '@/lib/utils/cors';

export function middleware(req: NextRequest) {
  const origin = req.headers.get('origin');
  const cors = getCorsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 204,
      headers: cors,
    });
  }

  const response = NextResponse.next();
  Object.entries(cors).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  return response;
}

export const config = {
  matcher: ['/v1/:path*'],
};
