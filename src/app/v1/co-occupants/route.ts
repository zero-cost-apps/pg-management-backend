import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/utils/envelope';
import { authenticateRequest } from '@/lib/auth/authGuard';
import { listCoOccupants, createCoOccupant } from '@/lib/db/repositories/coOccupantRepo';
import { getRoom } from '@/lib/db/repositories/roomRepo';
import { getTenant } from '@/lib/db/repositories/tenantRepo';
import { CoOccupant } from '@/types';
import { v4 as uuidv4 } from 'uuid';

export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.success) return auth.response;

  try {
    const { searchParams } = new URL(req.url);
    const roomId = searchParams.get('roomId') || undefined;
    const tenantId = searchParams.get('tenantId') || undefined;

    if (!roomId && !tenantId) {
      return errorResponse(
        'VALIDATION_ERROR',
        'At least one query parameter is required: roomId or tenantId.',
        undefined,
        400
      );
    }

    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = Math.min(100, parseInt(searchParams.get('pageSize') || '50', 10));

    const list = await listCoOccupants(auth.context.ownerId, { roomId, tenantId });
    const total = list.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const offset = (page - 1) * pageSize;
    const paginated = list.slice(offset, offset + pageSize);

    return successResponse(
      { coOccupants: paginated },
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
    console.error('List co-occupants error:', err);
    return errorResponse('INTERNAL', 'Failed to list co-occupants.', undefined, 500);
  }
}

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.success) return auth.response;

  try {
    const body = await req.json();
    const {
      roomId,
      tenantId,
      fullName,
      relationship,
      phone,
      gender,
      age,
      occupation,
      checkInDate,
      aadharNumber,
      notes,
    } = body;

    const fields: Record<string, string> = {};
    if (!roomId) fields.roomId = 'roomId is required.';
    if (!tenantId) fields.tenantId = 'tenantId is required.';
    if (!fullName) fields.fullName = 'fullName is required.';
    if (!relationship) fields.relationship = 'relationship is required.';
    if (!phone) fields.phone = 'phone is required.';
    if (!gender) fields.gender = 'gender is required.';
    if (!checkInDate) fields.checkInDate = 'checkInDate is required.';

    if (Object.keys(fields).length > 0) {
      return errorResponse('VALIDATION_ERROR', 'Validation failed.', fields, 400);
    }

    const room = await getRoom(auth.context.ownerId, roomId);
    if (!room) {
      return errorResponse('NOT_FOUND', 'Room not found.', undefined, 404);
    }

    const tenant = await getTenant(auth.context.ownerId, tenantId);
    if (!tenant) {
      return errorResponse('NOT_FOUND', 'Tenant not found.', undefined, 404);
    }
    if (tenant.status === 'vacated') {
      return errorResponse('CONFLICT', 'Tenant is already vacated.', undefined, 409);
    }

    // Capacity check
    const currentOccupants = room.occupantCount || 0;
    if (currentOccupants + 1 > room.capacity) {
      return errorResponse(
        'ROOM_CAPACITY_EXCEEDED',
        `Room capacity is ${room.capacity}, currently has ${currentOccupants} occupants.`,
        undefined,
        409
      );
    }

    const coOccupant: CoOccupant = {
      id: uuidv4(),
      roomId,
      tenantId,
      fullName: fullName.trim(),
      relationship,
      phone: phone.trim(),
      gender,
      age: age || null,
      occupation: occupation || null,
      checkInDate,
      aadharNumber: aadharNumber || null,
      notes: notes || null,
      createdAt: new Date().toISOString(),
    };

    const created = await createCoOccupant(auth.context.ownerId, coOccupant);
    return successResponse({ coOccupant: created }, undefined, 201);
  } catch (err) {
    console.error('Create co-occupant error:', err);
    return errorResponse('INTERNAL', 'Failed to create co-occupant.', undefined, 500);
  }
}
