import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/utils/envelope';
import { authenticateRequest } from '@/lib/auth/authGuard';
import { listBuildings, createBuilding } from '@/lib/db/repositories/buildingRepo';
import { Building, RoomTypeConfig } from '@/types';
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
    if (!totalFloors || totalFloors < 1 || totalFloors > 50) {
      fields.totalFloors = 'totalFloors must be between 1 and 50.';
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

    const building: Building = {
      id: uuidv4(),
      ownerId,
      name: name.trim(),
      code: generatedCode,
      address: address.trim(),
      city: city.trim(),
      totalFloors,
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
    return successResponse({ building: created }, undefined, 201);
  } catch (err) {
    console.error('Create building error:', err);
    return errorResponse('INTERNAL', 'Failed to create building.', undefined, 500);
  }
}
