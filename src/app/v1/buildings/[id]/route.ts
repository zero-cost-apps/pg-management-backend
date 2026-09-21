import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/utils/envelope';
import { authenticateRequest } from '@/lib/auth/authGuard';
import {
  getBuilding,
  updateBuilding,
  deleteBuilding,
} from '@/lib/db/repositories/buildingRepo';
import { listRoomsForBuilding, createRoom } from '@/lib/db/repositories/roomRepo';
import { Room, FloorConfig } from '@/types';
import { v4 as uuidv4 } from 'uuid';

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
    const shouldGenerateRooms = Boolean(body.generateRooms);
    const defaultRoomTypeId = body.defaultRoomTypeId;
    const hasAirConditioner = Boolean(body.hasAirConditioner);
    const hasAttachedBathroom = body.hasAttachedBathroom !== false;
    const hasBalcony = body.hasBalcony;

    delete body.generateRooms;
    delete body.defaultRoomTypeId;
    delete body.hasAirConditioner;
    delete body.hasAttachedBathroom;
    delete body.hasBalcony;
    delete body.id;
    delete body.ownerId;
    delete body.stats;

    const updated = await updateBuilding(auth.context.ownerId, id, body);
    if (!updated) {
      return errorResponse('INTERNAL', 'Failed to update building.', undefined, 500);
    }

    let generatedCount = 0;
    if (shouldGenerateRooms) {
      const activeFloorConfigs: FloorConfig[] = updated.floorConfigs && updated.floorConfigs.length > 0
        ? updated.floorConfigs
        : existing.floorConfigs || [];

      if (activeFloorConfigs.length > 0) {
        const existingRooms = await listRoomsForBuilding(auth.context.ownerId, id);
        const existingNumbers = new Set(existingRooms.map(r => r.roomNumber.toUpperCase().trim()));

        const roomTypes = updated.roomTypes || existing.roomTypes || [];
        const selectedRt = (defaultRoomTypeId ? roomTypes.find(rt => rt.id === defaultRoomTypeId) : null) || roomTypes[0] || {
          id: uuidv4(),
          name: 'Standard Room',
          capacity: 2,
          baseRent: 10000,
        };

        const today = new Date().toISOString().split('T')[0];
        const code = updated.code || existing.code || 'BLD';

        for (const fc of activeFloorConfigs) {
          for (let idx = 1; idx <= fc.roomCount; idx++) {
            const roomNumber = fc.floor === 0
              ? `G${String(idx).padStart(2, '0')}`
              : `${fc.floor}${String(idx).padStart(2, '0')}`;

            if (!existingNumbers.has(roomNumber.toUpperCase().trim())) {
              const newRoom: Room = {
                id: uuidv4(),
                buildingId: id,
                roomNumber,
                floor: fc.floor,
                roomTypeId: selectedRt.id,
                capacity: selectedRt.capacity || 2,
                baseRent: selectedRt.baseRent || 10000,
                status: 'vacant',
                primaryTenantId: null,
                maintenanceReason: null,
                hasAttachedBathroom,
                hasAirConditioner,
                hasBalcony: hasBalcony !== undefined ? Boolean(hasBalcony) : idx % 2 === 0,
                meterNumber: `MTR-${code}-${roomNumber}`,
                lastMeterReading: 100 * (fc.floor === 0 ? 1 : fc.floor) + idx * 10,
                lastMeterReadingDate: today,
              };
              await createRoom(auth.context.ownerId, newRoom);
              existingNumbers.add(roomNumber.toUpperCase().trim());
              generatedCount++;
            }
          }
        }
      }
    }

    return successResponse({ building: updated, generatedRoomsCount: generatedCount });
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
