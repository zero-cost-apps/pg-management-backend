import type { NextConfig } from "next";

const CORS_HEADERS = [
  { key: "Access-Control-Allow-Credentials", value: "true" },
  { key: "Access-Control-Allow-Origin", value: "https://pg-partner.vercel.app" },
  { key: "Access-Control-Allow-Methods", value: "GET,OPTIONS,PATCH,DELETE,POST,PUT" },
  {
    key: "Access-Control-Allow-Headers",
    value:
      "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, Idempotency-Key",
  },
  { key: "Access-Control-Max-Age", value: "86400" },
];

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: "/v1/:path*",
      },
      {
        source: "/auth/:path*",
        destination: "/v1/auth/:path*",
      },
      {
        source: "/buildings/:path*",
        destination: "/v1/buildings/:path*",
      },
      {
        source: "/rooms/:path*",
        destination: "/v1/rooms/:path*",
      },
      {
        source: "/tenants/:path*",
        destination: "/v1/tenants/:path*",
      },
      {
        source: "/electricity/:path*",
        destination: "/v1/electricity/:path*",
      },
      {
        source: "/payments/:path*",
        destination: "/v1/payments/:path*",
      },
      {
        source: "/dashboard/:path*",
        destination: "/v1/dashboard/:path*",
      },
      {
        source: "/overdue/:path*",
        destination: "/v1/overdue/:path*",
      },
      {
        source: "/co-occupants/:path*",
        destination: "/v1/co-occupants/:path*",
      },
      {
        source: "/onboarding/:path*",
        destination: "/v1/onboarding/:path*",
      },
      {
        source: "/account/:path*",
        destination: "/v1/account/:path*",
      },
      {
        source: "/documents/:path*",
        destination: "/v1/documents/:path*",
      },
      {
        source: "/health",
        destination: "/v1/health",
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: CORS_HEADERS,
      },
    ];
  },
};

export default nextConfig;
