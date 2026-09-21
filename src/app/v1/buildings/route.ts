import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/utils/envelope';
import { authenticateRequest } from '@/lib/auth/authGuard';
import { listBuildings, createBuilding } from '@/lib/db/repositories/buildingRepo';
import { createRoom } from '@/lib/db/repositories/roomRepo';
import { Building, RoomTypeConfig, Room, FloorConfig } from '@/types';
import { v4 as uuidv4 } from 'uuid';

export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.success) return auth.response;

  try {
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = Math.min(100, parseInt(searchParams.get('pageSize') || '50', 10));

    const all = await listBuildings(auth.context.ownerId);
    const total = all.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const offset = (page - 1) * pageSize;
    const paginated = all.slice(offset, offset + pageSize);

    return successResponse(
      { buildings: paginated },
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
    console.error('List buildings error:', err);
    return errorResponse('INTERNAL', 'Failed to list buildings.', undefined, 500);
  }
}

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.success) return auth.response;

  try {
    const body = await req.json();
    const {
      name,
      code,
      address,
      city,
      totalFloors,
      floorConfigs,
      electricityRatePerUnit,
      billingDueDay,
      electricityBillingCycle,
      managerName,
      managerPhone,
      upiId,
      amenities,
      rulesNotes,
      roomTypes,
    } = body;

    const fields: Record<string, string> = {};

    if (!name || typeof name !== 'string' || !name.trim()) {
      fields.name = 'Building name is required.';
    }
    if (!address || typeof address !== 'string' || !address.trim()) {
      fields.address = 'Address is required.';
    }
    if (!city || typeof city !== 'string' || !city.trim()) {
      fields.city = 'City is required.';
    }

    let parsedTotalFloors = totalFloors !== undefined ? Number(totalFloors) : undefined;
    if (parsedTotalFloors === undefined && Array.isArray(floorConfigs) && floorConfigs.length > 0) {
      parsedTotalFloors = Math.max(...floorConfigs.map((f: any) => Number(f.floor || 0)));
    }

    if (parsedTotalFloors === undefined || isNaN(parsedTotalFloors) || parsedTotalFloors < 0 || parsedTotalFloors > 50) {
      fields.totalFloors = 'totalFloors must be between 0 and 50 (0 for Ground Floor only).';
    }
    if (electricityRatePerUnit === undefined || electricityRatePerUnit <= 0) {
      fields.electricityRatePerUnit = 'electricityRatePerUnit must be > 0.';
    }
    if (!billingDueDay || billingDueDay < 1 || billingDueDay > 28) {
      fields.billingDueDay = 'billingDueDay must be between 1 and 28.';
    }
    if (!roomTypes || !Array.isArray(roomTypes) || roomTypes.length === 0) {
      fields.roomTypes = 'At least one roomType is required.';
    }
    if (floorConfigs && !Array.isArray(floorConfigs)) {
      fields.floorConfigs = 'floorConfigs must be an array.';
    }

    if (Object.keys(fields).length > 0) {
      return errorResponse('VALIDATION_ERROR', 'Validation failed.', fields, 400);
    }

    const ownerId = auth.context.ownerId;
    const generatedCode = code && typeof code === 'string' && code.trim()
      ? code.trim().toUpperCase()
      : name.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'BLD';

    const processedRoomTypes: RoomTypeConfig[] = roomTypes.map((rt: any) => ({
      id: rt.id || uuidv4(),
      name: rt.name || 'Standard Room',
      capacity: rt.capacity || 2,
      baseRent: rt.baseRent || 10000,
      description: rt.description || '',
    }));

    const processedFloorConfigs: FloorConfig[] | undefined = Array.isArray(floorConfigs)
      ? floorConfigs.map((fc: any) => ({
          floor: Number(fc.floor),
          roomCount: Math.max(0, Number(fc.roomCount || 0)),
          name: fc.name || (Number(fc.floor) === 0 ? 'Ground Floor' : `${fc.floor}th Floor`),
        }))
      : undefined;

    const building: Building = {
      id: uuidv4(),
      ownerId,
      name: name.trim(),
      code: generatedCode,
      address: address.trim(),
      city: city.trim(),
      totalFloors: parsedTotalFloors ?? 1,
      floorConfigs: processedFloorConfigs,
      electricityRatePerUnit,
      billingDueDay,
      electricityBillingCycle: electricityBillingCycle || 'monthly',
      managerName: managerName || 'Property Manager',
      managerPhone: managerPhone || auth.context.user.phone,
      upiId: upiId || null,
      amenities: Array.isArray(amenities) ? amenities : [],
      roomTypes: processedRoomTypes,
      rulesNotes: rulesNotes || null,
      createdAt: new Date().toISOString(),
    };

    const created = await createBuilding(ownerId, building);

    // Optional: auto-provision rooms if floorConfigs provided and generateRooms is true
    if (body.generateRooms && processedFloorConfigs && processedFloorConfigs.length > 0) {
      const today = new Date().toISOString().split('T')[0];
      const defaultRtId = processedRoomTypes[0]?.id || uuidv4();
      const defaultCap = processedRoomTypes[0]?.capacity || 2;
      const defaultRent = processedRoomTypes[0]?.baseRent || 10000;

      for (const fc of processedFloorConfigs) {
        for (let idx = 1; idx <= fc.roomCount; idx++) {
          const roomNumber = fc.floor === 0 ? `G${String(idx).padStart(2, '0')}` : `${fc.floor}${String(idx).padStart(2, '0')}`;
          const newRoom: Room = {
            id: uuidv4(),
            buildingId: created.id,
            roomNumber,
            floor: fc.floor,
            roomTypeId: defaultRtId,
            capacity: defaultCap,
            baseRent: defaultRent,
            status: 'vacant',
            primaryTenantId: null,
            maintenanceReason: null,
            hasAttachedBathroom: true,
            hasAirConditioner: false,
            hasBalcony: idx % 2 === 0,
            meterNumber: `MTR-${generatedCode}-${roomNumber}`,
            lastMeterReading: 100 * (fc.floor === 0 ? 1 : fc.floor) + idx * 10,
            lastMeterReadingDate: today,
          };
          await createRoom(ownerId, newRoom);
        }
      }
    }

    return successResponse({ building: created }, undefined, 201);
  } catch (err) {
    console.error('Create building error:', err);
    return errorResponse('INTERNAL', 'Failed to create building.', undefined, 500);
  }
}
