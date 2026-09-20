import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/utils/envelope';
import { authenticateRequest } from '@/lib/auth/authGuard';
import { listTenants, checkInTenant } from '@/lib/db/repositories/tenantRepo';
import { TenantStatus } from '@/types';

export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.success) return auth.response;

  try {
    const { searchParams } = new URL(req.url);
    const buildingId = searchParams.get('buildingId') || undefined;
    const roomId = searchParams.get('roomId') || undefined;
    const status = (searchParams.get('status') as TenantStatus) || undefined;
    const search = searchParams.get('search') || undefined;

    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = Math.min(100, parseInt(searchParams.get('pageSize') || '50', 10));

    const tenants = await listTenants(auth.context.ownerId, {
      buildingId,
      roomId,
      status,
      search,
    });

    const total = tenants.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const offset = (page - 1) * pageSize;
    const paginated = tenants.slice(offset, offset + pageSize);

    return successResponse(
      { tenants: paginated },
      {
        pagination: {
          page,
          pageSize,
          total,
          totalPages,
        },
      }
    );
  } catch (err) {
    console.error('List tenants error:', err);
    return errorResponse('INTERNAL', 'Failed to list tenants.', undefined, 500);
  }
}

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.success) return auth.response;

  try {
    const body = await req.json();
    const {
      buildingId,
      roomId,
      fullName,
      phone,
      checkInDate,
      monthlyRent,
      securityDeposit,
      depositStatus,
    } = body;

    const fields: Record<string, string> = {};
    if (!buildingId) fields.buildingId = 'buildingId is required.';
    if (!roomId) fields.roomId = 'roomId is required.';
    if (!fullName) fields.fullName = 'fullName is required.';
    if (!phone) fields.phone = 'phone is required.';
    if (!checkInDate) fields.checkInDate = 'checkInDate is required.';
    if (!monthlyRent || monthlyRent <= 0) fields.monthlyRent = 'monthlyRent must be > 0.';
    if (securityDeposit === undefined || securityDeposit < 0) fields.securityDeposit = 'securityDeposit must be >= 0.';
    if (!depositStatus || !['paid', 'partial', 'pending'].includes(depositStatus)) {
      fields.depositStatus = 'depositStatus must be paid, partial, or pending.';
    }

    if (Object.keys(fields).length > 0) {
      return errorResponse('VALIDATION_ERROR', 'Validation failed.', fields, 400);
    }

    const result = await checkInTenant(auth.context.ownerId, body);
    if (!result.success) {
      if (result.code === 'ROOM_NOT_FOUND') {
        return errorResponse('NOT_FOUND', result.message, undefined, 404);
      }
      if (result.code === 'ROOM_NOT_VACANT') {
        return errorResponse('ROOM_NOT_VACANT', result.message, undefined, 409);
      }
      if (result.code === 'ROOM_CAPACITY_EXCEEDED') {
        return errorResponse('ROOM_CAPACITY_EXCEEDED', result.message, undefined, 409);
      }
      return errorResponse('INTERNAL', result.message, undefined, 500);
    }

    return successResponse(
      {
        tenant: result.tenant,
        room: result.room,
        coOccupants: result.coOccupants,
      },
      undefined,
      201
    );
  } catch (err) {
    console.error('Check-in error:', err);
    return errorResponse('INTERNAL', 'Failed to check in tenant.', undefined, 500);
  }
}
