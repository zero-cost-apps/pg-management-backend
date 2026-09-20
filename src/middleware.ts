import { NextRequest, NextResponse } from 'next/server';
import { getCorsHeaders } from '@/lib/utils/cors';

export function middleware(req: NextRequest) {
  // Pass through internal Next.js Server Actions
  if (req.headers.get('next-action')) {
    return NextResponse.next();
  }

  const origin = req.headers.get('origin');
  const cors = getCorsHeaders(origin);

  // Return status 200 with complete CORS headers on preflight OPTIONS
  if (req.method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 200,
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
  matcher: ['/v1/:path*', '/api/:path*'],
};
