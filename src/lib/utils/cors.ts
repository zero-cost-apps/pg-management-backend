const ALLOWED_ORIGINS = [
  'https://pg-partner.vercel.app',
  'https://pg-partner.vercel.app/',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:3001',
];

export function isAllowedOrigin(origin: string | null | undefined): boolean {
  if (!origin) return true;
  const cleanOrigin = origin.replace(/\/$/, '');
  if (ALLOWED_ORIGINS.some((o) => o.replace(/\/$/, '') === cleanOrigin)) {
    return true;
  }
  if (/^https:\/\/pg-partner(-[a-z0-9-]+)?\.vercel\.app$/.test(cleanOrigin)) {
    return true;
  }
  return false;
}

export function getCorsHeaders(origin?: string | null): Record<string, string> {
  let allowOrigin = 'https://pg-partner.vercel.app';
  if (origin && isAllowedOrigin(origin)) {
    allowOrigin = origin.replace(/\/$/, '');
  } else if (!origin) {
    allowOrigin = '*';
  }

  const headers: Record<string, string> = {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers':
      'Content-Type, Authorization, Idempotency-Key, X-Requested-With, Accept, Origin, X-CSRF-Token',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };

  if (allowOrigin !== '*') {
    headers['Access-Control-Allow-Credentials'] = 'true';
  }

  return headers;
}
