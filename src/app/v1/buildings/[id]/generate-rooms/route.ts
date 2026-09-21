import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/utils/envelope';
import { authenticateRequest } from '@/lib/auth/authGuard';
import { getBuilding, updateBuilding } from '@/lib/db/repositories/buildingRepo';
import { listRoomsForBuilding, createRoom } from '@/lib/db/repositories/roomRepo';
import { Room, FloorConfig, RoomTypeConfig } from '@/types';
import { v4 as uuidv4 } from 'uuid';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(req);
  if (!auth.success) return auth.response;

  try {
    const { id } = await context.params;
    const ownerId = auth.context.ownerId;

    const building = await getBuilding(ownerId, id);
    if (!building) {
      return errorResponse('NOT_FOUND', 'Building not found.', undefined, 404);
    }

    const body = await req.json().catch(() => ({}));
    const customFloorConfigs: FloorConfig[] | undefined = Array.isArray(body.floorConfigs)
      ? body.floorConfigs.map((fc: any) => ({
          floor: Number(fc.floor),
          roomCount: Math.max(0, Number(fc.roomCount || 0)),
          name: fc.name || (Number(fc.floor) === 0 ? 'Ground Floor' : `${fc.floor}th Floor`),
        }))
      : undefined;

    const floorConfigs: FloorConfig[] =
      customFloorConfigs && customFloorConfigs.length > 0
        ? customFloorConfigs
        : building.floorConfigs && building.floorConfigs.length > 0
        ? building.floorConfigs
        : (() => {
            const configs: FloorConfig[] = [{ floor: 0, roomCount: 3, name: 'Ground Floor' }];
            for (let f = 1; f <= Math.max(1, building.totalFloors); f++) {
              configs.push({ floor: f, roomCount: 4, name: `${f}th Floor` });
            }
            return configs;
          })();

    // If floorConfigs were passed in body and differ, update building record too
    if (customFloorConfigs && customFloorConfigs.length > 0) {
      await updateBuilding(ownerId, id, { floorConfigs: customFloorConfigs });
    }

    // Existing rooms for this building
    const existingRooms = await listRoomsForBuilding(ownerId, id);
    const existingRoomNumbers = new Set(
      existingRooms.map((r) => r.roomNumber.toUpperCase().trim())
    );

    // Pick room type
    const roomTypes: RoomTypeConfig[] = building.roomTypes || [];
    const defaultRt =
      (body.defaultRoomTypeId
        ? roomTypes.find((rt) => rt.id === body.defaultRoomTypeId)
        : null) ||
      roomTypes[0] || {
        id: uuidv4(),
        name: 'Standard Room',
        capacity: 2,
        baseRent: 10000,
      };

    const defaultRtId = defaultRt.id;
    const defaultCap = defaultRt.capacity || 2;
    const defaultRent = defaultRt.baseRent || 10000;
    const hasAttachedBathroom = body.hasAttachedBathroom !== false;
    const hasAirConditioner = Boolean(body.hasAirConditioner);
    const code = building.code || 'BLD';
    const today = new Date().toISOString().split('T')[0];

    const createdRooms: Room[] = [];

    for (const fc of floorConfigs) {
      for (let idx = 1; idx <= fc.roomCount; idx++) {
        const roomNumber =
          fc.floor === 0
            ? `G${String(idx).padStart(2, '0')}`
            : `${fc.floor}${String(idx).padStart(2, '0')}`;

        if (!existingRoomNumbers.has(roomNumber.toUpperCase().trim())) {
          const newRoom: Room = {
            id: uuidv4(),
            buildingId: id,
            roomNumber,
            floor: fc.floor,
            roomTypeId: defaultRtId,
            capacity: defaultCap,
            baseRent: defaultRent,
            status: 'vacant',
            primaryTenantId: null,
            maintenanceReason: null,
            hasAttachedBathroom,
            hasAirConditioner,
            hasBalcony: body.hasBalcony !== undefined ? Boolean(body.hasBalcony) : idx % 2 === 0,
            meterNumber: `MTR-${code}-${roomNumber}`,
            lastMeterReading: 100 * (fc.floor === 0 ? 1 : fc.floor) + idx * 10,
            lastMeterReadingDate: today,
          };

          const saved = await createRoom(ownerId, newRoom);
          createdRooms.push(saved);
          existingRoomNumbers.add(roomNumber.toUpperCase().trim());
        }
      }
    }

    return successResponse({
      generatedCount: createdRooms.length,
      rooms: createdRooms,
      totalRoomsNow: existingRooms.length + createdRooms.length,
    });
  } catch (err) {
    console.error('Generate rooms error:', err);
    return errorResponse('INTERNAL', 'Failed to generate rooms.', undefined, 500);
  }
}
