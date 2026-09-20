import { NextResponse } from 'next/server';
import { ApiResponse, ApiErrorCode, PaginationMeta } from '@/types';

export function generateRequestId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `req_${timestamp}${random}`;
}

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Idempotency-Key',
};

export function successResponse<T>(
  data: T,
  meta?: { pagination?: PaginationMeta; requestId?: string },
  status: number = 200
): NextResponse<ApiResponse<T>> {
  const body: ApiResponse<T> = {
    success: true,
    data,
    meta: {
      requestId: meta?.requestId || generateRequestId(),
      ...(meta?.pagination ? { pagination: meta.pagination } : {}),
    },
  };
  return NextResponse.json(body, {
    status,
    headers: corsHeaders,
  });
}

export function errorResponse(
  code: ApiErrorCode,
  message: string,
  fields?: Record<string, string>,
  status: number = 400,
  requestId?: string
): NextResponse<ApiResponse<null>> {
  const body: ApiResponse<null> = {
    success: false,
    error: {
      code,
      message,
      ...(fields ? { fields } : {}),
    },
    meta: {
      requestId: requestId || generateRequestId(),
    },
  };
  return NextResponse.json(body, {
    status,
    headers: corsHeaders,
  });
}
