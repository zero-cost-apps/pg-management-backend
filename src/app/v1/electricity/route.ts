import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/utils/envelope';
import { authenticateRequest } from '@/lib/auth/authGuard';
import { listElectricity, createElectricityRecord } from '@/lib/db/repositories/electricityRepo';

export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.success) return auth.response;

  try {
    const { searchParams } = new URL(req.url);
    const buildingId = searchParams.get('buildingId') || undefined;
    const roomId = searchParams.get('roomId') || undefined;
    const month = searchParams.get('month') || undefined;

    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = Math.min(100, parseInt(searchParams.get('pageSize') || '50', 10));

    const records = await listElectricity(auth.context.ownerId, {
      buildingId,
      roomId,
      month,
    });

    const total = records.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const offset = (page - 1) * pageSize;
    const paginated = records.slice(offset, offset + pageSize);

    return successResponse(
      { records: paginated },
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
    console.error('List electricity error:', err);
    return errorResponse('INTERNAL', 'Failed to list electricity records.', undefined, 500);
  }
}

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.success) return auth.response;

  try {
    const idempotencyKey = req.headers.get('idempotency-key');
    const body = await req.json();
    const { roomId, month, readingDate, currentReading } = body;

    const fields: Record<string, string> = {};
    if (!roomId) fields.roomId = 'roomId is required.';
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      fields.month = 'month in YYYY-MM format is required.';
    }
    if (!readingDate) fields.readingDate = 'readingDate is required.';
    if (currentReading === undefined || currentReading < 0) {
      fields.currentReading = 'currentReading must be >= 0.';
    }

    if (Object.keys(fields).length > 0) {
      return errorResponse('VALIDATION_ERROR', 'Validation failed.', fields, 400);
    }

    const result = await createElectricityRecord(auth.context.ownerId, body, idempotencyKey);
    if (!result.success) {
      if (result.code === 'ROOM_NOT_FOUND') {
        return errorResponse('NOT_FOUND', result.message, undefined, 404);
      }
      if (result.code === 'READING_EXISTS') {
        return errorResponse('READING_EXISTS', result.message, undefined, 409);
      }
      if (result.code === 'INVALID_READING') {
        return errorResponse('VALIDATION_ERROR', result.message, { currentReading: 'cannot decrease' }, 400);
      }
      return errorResponse('INTERNAL', result.message, undefined, 500);
    }

    return successResponse(
      {
        record: result.record,
        room: result.room,
      },
      undefined,
      201
    );
  } catch (err) {
    console.error('Record electricity error:', err);
    return errorResponse('INTERNAL', 'Failed to record electricity reading.', undefined, 500);
  }
}
