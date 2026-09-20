import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/utils/envelope';
import { authenticateRequest } from '@/lib/auth/authGuard';
import { listRooms, createRoom } from '@/lib/db/repositories/roomRepo';
import { getBuilding } from '@/lib/db/repositories/buildingRepo';
import { Room, RoomStatus } from '@/types';
import { v4 as uuidv4 } from 'uuid';

export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.success) return auth.response;

  try {
    const { searchParams } = new URL(req.url);
    const buildingId = searchParams.get('buildingId') || undefined;
    const status = (searchParams.get('status') as RoomStatus) || undefined;
    const floorParam = searchParams.get('floor');
    const floor = floorParam ? parseInt(floorParam, 10) : undefined;
    const search = searchParams.get('search') || undefined;

    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = Math.min(100, parseInt(searchParams.get('pageSize') || '50', 10));

    const rooms = await listRooms(auth.context.ownerId, {
      buildingId,
      status,
      floor,
      search,
    });

    const total = rooms.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const offset = (page - 1) * pageSize;
    const paginated = rooms.slice(offset, offset + pageSize);

    return successResponse(
      { rooms: paginated },
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
    console.error('List rooms error:', err);
    return errorResponse('INTERNAL', 'Failed to list rooms.', undefined, 500);
  }
}

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.success) return auth.response;

  try {
    const body = await req.json();
    const {
      buildingId,
      roomNumber,
      floor,
      roomTypeId,
      capacity,
      baseRent,
      hasAirConditioner,
      hasAttachedBathroom,
      hasBalcony,
      meterNumber,
    } = body;

    const fields: Record<string, string> = {};

    if (!buildingId) fields.buildingId = 'buildingId is required.';
    if (!roomNumber) fields.roomNumber = 'roomNumber is required.';
    if (!floor || floor < 1) fields.floor = 'floor must be >= 1.';
    if (!capacity || capacity < 1 || capacity > 8) fields.capacity = 'capacity must be 1-8.';
    if (!baseRent || baseRent <= 0) fields.baseRent = 'baseRent must be > 0.';

    if (Object.keys(fields).length > 0) {
      return errorResponse('VALIDATION_ERROR', 'Validation failed.', fields, 400);
    }

    const building = await getBuilding(auth.context.ownerId, buildingId);
    if (!building) {
      return errorResponse('NOT_FOUND', 'Building not found.', undefined, 404);
    }

    if (floor > building.totalFloors) {
      return errorResponse(
        'VALIDATION_ERROR',
        `Floor ${floor} exceeds building totalFloors (${building.totalFloors}).`,
        { floor: 'exceeds building total floors' },
        400
      );
    }

    // Check unique room number in building
    const existingRooms = await listRooms(auth.context.ownerId, { buildingId });
    const cleanRoomNumber = String(roomNumber).trim();
    if (existingRooms.some((r) => r.roomNumber.toLowerCase() === cleanRoomNumber.toLowerCase())) {
      return errorResponse(
        'CONFLICT',
        `Room number ${cleanRoomNumber} already exists in this building.`,
        { roomNumber: 'must be unique per building' },
        409
      );
    }

    const today = new Date().toISOString().split('T')[0];
    const room: Room = {
      id: uuidv4(),
      buildingId,
      roomNumber: cleanRoomNumber,
      floor,
      roomTypeId: roomTypeId || (building.roomTypes[0]?.id || uuidv4()),
      capacity,
      baseRent,
      status: 'vacant',
      primaryTenantId: null,
      maintenanceReason: null,
      hasAttachedBathroom: hasAttachedBathroom !== undefined ? !!hasAttachedBathroom : true,
      hasAirConditioner: hasAirConditioner !== undefined ? !!hasAirConditioner : false,
      hasBalcony: hasBalcony !== undefined ? !!hasBalcony : false,
      meterNumber: meterNumber || `MTR-${building.code}-${cleanRoomNumber}`,
      lastMeterReading: 1000,
      lastMeterReadingDate: today,
    };

    const created = await createRoom(auth.context.ownerId, room);
    return successResponse({ room: created }, undefined, 201);
  } catch (err) {
    console.error('Create room error:', err);
    return errorResponse('INTERNAL', 'Failed to create room.', undefined, 500);
  }
}
