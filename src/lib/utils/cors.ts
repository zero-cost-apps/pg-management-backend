const DEFAULT_ALLOWED_ORIGINS = [
  'https://pg-partner.vercel.app',
  'https://pg-partner.vercel.app/',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:3001',
];

export function isAllowedOrigin(origin: string | null | undefined): boolean {
  if (!origin) return true;
  const cleanOrigin = origin.replace(/\/$/, '');

  const envOrigins = process.env.CORS_ALLOWED_ORIGINS
    ? process.env.CORS_ALLOWED_ORIGINS.split(',').map((o) => o.trim().replace(/\/$/, ''))
    : [];

  const allowed = [...DEFAULT_ALLOWED_ORIGINS.map((o) => o.replace(/\/$/, '')), ...envOrigins];

  if (allowed.some((o) => o === cleanOrigin)) {
    return true;
  }

  // Allow preview deployments for pg-partner (e.g., https://pg-partner-git-main-user.vercel.app)
  if (/^https:\/\/pg-partner(-[a-z0-9-]+)?\.vercel\.app$/.test(cleanOrigin)) {
    return true;
  }

  return false;
}

export function getCorsHeaders(origin?: string | null): Record<string, string> {
  // Default to https://pg-partner.vercel.app - NEVER use wildcard '*' with credentials
  let allowOrigin = 'https://pg-partner.vercel.app';
  if (origin && isAllowedOrigin(origin)) {
    allowOrigin = origin.replace(/\/$/, '');
  }

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers':
      'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, Idempotency-Key',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}
