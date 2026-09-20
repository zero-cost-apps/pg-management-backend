import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/utils/envelope';
import { authenticateRequest } from '@/lib/auth/authGuard';
import {
  getCoOccupant,
  updateCoOccupant,
  deleteCoOccupant,
} from '@/lib/db/repositories/coOccupantRepo';

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(req);
  if (!auth.success) return auth.response;

  try {
    const { id } = await context.params;
    const existing = await getCoOccupant(auth.context.ownerId, id);
    if (!existing) {
      return errorResponse('NOT_FOUND', 'Co-occupant not found.', undefined, 404);
    }

    const body = await req.json();
    delete body.id;
    delete body.roomId; // cannot move room in P0
    delete body.tenantId;

    const updated = await updateCoOccupant(auth.context.ownerId, id, body);
    return successResponse({ coOccupant: updated });
  } catch (err) {
    console.error('Update co-occupant error:', err);
    return errorResponse('INTERNAL', 'Failed to update co-occupant.', undefined, 500);
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(req);
  if (!auth.success) return auth.response;

  try {
    const { id } = await context.params;
    const existing = await getCoOccupant(auth.context.ownerId, id);
    if (!existing) {
      return errorResponse('NOT_FOUND', 'Co-occupant not found.', undefined, 404);
    }

    await deleteCoOccupant(auth.context.ownerId, id);
    return successResponse({ deleted: true, id });
  } catch (err) {
    console.error('Delete co-occupant error:', err);
    return errorResponse('INTERNAL', 'Failed to delete co-occupant.', undefined, 500);
  }
}
