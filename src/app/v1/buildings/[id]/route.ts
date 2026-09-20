import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/utils/envelope';
import { authenticateRequest } from '@/lib/auth/authGuard';
import {
  getBuilding,
  updateBuilding,
  deleteBuilding,
} from '@/lib/db/repositories/buildingRepo';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(req);
  if (!auth.success) return auth.response;

  try {
    const { id } = await context.params;
    const building = await getBuilding(auth.context.ownerId, id);

    if (!building) {
      return errorResponse('NOT_FOUND', 'Building not found.', undefined, 404);
    }

    return successResponse({ building });
  } catch (err) {
    console.error('Get building error:', err);
    return errorResponse('INTERNAL', 'Failed to get building.', undefined, 500);
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(req);
  if (!auth.success) return auth.response;

  try {
    const { id } = await context.params;
    const existing = await getBuilding(auth.context.ownerId, id);
    if (!existing) {
      return errorResponse('NOT_FOUND', 'Building not found.', undefined, 404);
    }

    const body = await req.json();
    delete body.id;
    delete body.ownerId;
    delete body.stats;

    const updated = await updateBuilding(auth.context.ownerId, id, body);
    return successResponse({ building: updated });
  } catch (err) {
    console.error('Update building error:', err);
    return errorResponse('INTERNAL', 'Failed to update building.', undefined, 500);
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
    const existing = await getBuilding(auth.context.ownerId, id);
    if (!existing) {
      return errorResponse('NOT_FOUND', 'Building not found.', undefined, 404);
    }

    const result = await deleteBuilding(auth.context.ownerId, id);
    if (!result.success) {
      if (result.conflictReason === 'BUILDING_HAS_OCCUPANTS') {
        return errorResponse(
          'BUILDING_HAS_OCCUPANTS',
          'Cannot delete building with active tenants or occupied rooms.',
          undefined,
          409
        );
      }
      return errorResponse('INTERNAL', 'Failed to delete building.', undefined, 500);
    }

    return successResponse({ deleted: true, id });
  } catch (err) {
    console.error('Delete building error:', err);
    return errorResponse('INTERNAL', 'Failed to delete building.', undefined, 500);
  }
}
