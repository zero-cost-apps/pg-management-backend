import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/utils/envelope';
import { authenticateRequest } from '@/lib/auth/authGuard';
import { updateUser } from '@/lib/db/repositories/userRepo';
import { createBuilding } from '@/lib/db/repositories/buildingRepo';
import { createRoom } from '@/lib/db/repositories/roomRepo';
import { createTenant } from '@/lib/db/repositories/tenantRepo';
import { Building, Room, Tenant, RoomTypeConfig } from '@/types';
import { v4 as uuidv4 } from 'uuid';

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req, { requireOnboarded: false });
  if (!auth.success) return auth.response;

  if (auth.context.user.isOnboarded) {
    return errorResponse('CONFLICT', 'User has already completed onboarding.', undefined, 409);
  }

  try {
    const body = await req.json();
    const {
      businessName,
      businessType,
      city,
      phone,
      upiId,
      buildingName,
      buildingCode,
      address,
      billingDueDay,
      electricityRatePerUnit,
      totalFloors,
      roomsPerFloor,
      roomCapacity,
      defaultBaseRent,
      amenities,
      intakeMode,
      initialTenant,
    } = body;

    const fields: Record<string, string> = {};

    if (!businessName) fields.businessName = 'Business name is required.';
    if (!city) fields.city = 'City is required.';
    if (!phone) fields.phone = 'Phone is required.';
    if (!buildingName) fields.buildingName = 'Building name is required.';
    if (!buildingCode) fields.buildingCode = 'Building code is required.';
    if (!address) fields.address = 'Address is required.';
    if (!billingDueDay || billingDueDay < 1 || billingDueDay > 28) fields.billingDueDay = 'Billing due day must be 1-28.';
    if (!electricityRatePerUnit || electricityRatePerUnit <= 0) fields.electricityRatePerUnit = 'Electricity rate must be > 0.';
    if (!totalFloors || totalFloors < 1 || totalFloors > 20) fields.totalFloors = 'Total floors must be 1-20.';
    if (!roomsPerFloor || roomsPerFloor < 1 || roomsPerFloor > 30) fields.roomsPerFloor = 'Rooms per floor must be 1-30.';
    if (!roomCapacity || roomCapacity < 1 || roomCapacity > 6) fields.roomCapacity = 'Room capacity must be 1-6.';
    if (!defaultBaseRent || defaultBaseRent <= 0) fields.defaultBaseRent = 'Default base rent must be > 0.';

    if (Object.keys(fields).length > 0) {
      return errorResponse('VALIDATION_ERROR', 'Validation failed.', fields, 400);
    }

    if (totalFloors * roomsPerFloor > 500) {
      return errorResponse('VALIDATION_ERROR', 'totalFloors * roomsPerFloor cannot exceed 500 rooms.', undefined, 400);
    }

    const ownerId = auth.context.ownerId;
    const cleanCode = buildingCode.trim().toUpperCase();
    const today = new Date().toISOString().split('T')[0];

    const roomTypeId = uuidv4();
    const roomType: RoomTypeConfig = {
      id: roomTypeId,
      name: roomCapacity === 1 ? 'Single Room' : roomCapacity === 2 ? 'Double Sharing' : `${roomCapacity} Sharing`,
      capacity: roomCapacity,
      baseRent: defaultBaseRent,
      description: 'Standard accommodation with attached bathroom',
    };

    const buildingId = uuidv4();
    const building: Building = {
      id: buildingId,
      ownerId,
      name: buildingName.trim(),
      code: cleanCode,
      address: address.trim(),
      city: city.trim(),
      totalFloors,
      electricityRatePerUnit,
      billingDueDay,
      electricityBillingCycle: 'monthly',
      managerName: auth.context.user.fullName,
      managerPhone: phone,
      upiId: upiId || auth.context.user.bankDetails?.upiId || null,
      amenities: Array.isArray(amenities) ? amenities : [],
      roomTypes: [roomType],
      rulesNotes: null,
      createdAt: new Date().toISOString(),
    };

    await createBuilding(ownerId, building);

    // Generate rooms
    const generatedRooms: Room[] = [];
    const hasAc = Array.isArray(amenities) && amenities.some((a: string) => a.toLowerCase().includes('ac') || a.toLowerCase().includes('air conditioner'));

    for (let floor = 1; floor <= totalFloors; floor++) {
      for (let idx = 1; idx <= roomsPerFloor; idx++) {
        const roomNumber = `${floor}${String(idx).padStart(2, '0')}`;
        const roomId = uuidv4();
        const room: Room = {
          id: roomId,
          buildingId,
          roomNumber,
          floor,
          roomTypeId,
          capacity: roomCapacity,
          baseRent: defaultBaseRent,
          status: 'vacant',
          primaryTenantId: null,
          maintenanceReason: null,
          hasAttachedBathroom: true,
          hasAirConditioner: hasAc,
          hasBalcony: idx % 2 === 0,
          meterNumber: `MTR-${cleanCode}-${roomNumber}`,
          lastMeterReading: 100 * floor + idx * 10,
          lastMeterReadingDate: today,
        };
        generatedRooms.push(room);
      }
    }

    let createdTenant: Tenant | null = null;

    if (intakeMode && intakeMode !== 'empty') {
      const firstRoom = generatedRooms[0];
      const tenantGender = businessType === 'womens_pg' ? 'female' : 'male';
      const tenantId = uuidv4();

      const tenantFullName = intakeMode === 'sample' ? 'Aditya Nair' : initialTenant?.fullName || 'Aditya Nair';
      const tenantPhone = intakeMode === 'sample' ? '9876500111' : initialTenant?.phone || '9876500111';
      const tenantEmail = intakeMode === 'sample' ? 'aditya.nair@example.com' : initialTenant?.email || '';
      const monthlyRent = intakeMode === 'sample' ? defaultBaseRent : initialTenant?.monthlyRent || defaultBaseRent;
      const securityDeposit = intakeMode === 'sample' ? defaultBaseRent * 2 : initialTenant?.securityDeposit ?? defaultBaseRent * 2;

      createdTenant = {
        id: tenantId,
        buildingId,
        roomId: firstRoom.id,
        fullName: tenantFullName,
        phone: tenantPhone,
        email: tenantEmail,
        avatarUrl: null,
        gender: tenantGender,
        dateOfBirth: null,
        occupation: 'Software Engineer',
        workOrCollegeName: 'Tech Mahindra',
        permanentAddress: 'Plot 42, Sector 12, Indiranagar',
        emergencyContactName: 'Rajesh Nair',
        emergencyContactRelation: 'Father',
        emergencyContactPhone: '9876599900',
        checkInDate: today,
        expectedCheckOutDate: null,
        noticeGivenDate: null,
        status: 'active',
        monthlyRent,
        securityDeposit,
        depositStatus: 'paid',
        depositPaidAmount: securityDeposit,
        notes: null,
        documents: [],
      };

      await createTenant(ownerId, createdTenant);

      firstRoom.status = 'occupied';
      firstRoom.primaryTenantId = tenantId;
    }

    // Save all rooms
    const savedRooms: Room[] = [];
    for (const room of generatedRooms) {
      const saved = await createRoom(ownerId, room);
      savedRooms.push(saved);
    }

    // Update user profile and mark isOnboarded: true
    const updatedUser = await updateUser(ownerId, {
      businessName: businessName.trim(),
      phone: phone.replace(/\D/g, '').slice(-10),
      isOnboarded: true,
      bankDetails: {
        ...(auth.context.user.bankDetails || {}),
        upiId: upiId ? upiId.trim() : auth.context.user.bankDetails?.upiId || null,
      },
    });

    return successResponse(
      {
        user: updatedUser,
        building,
        rooms: savedRooms,
        tenant: createdTenant,
      },
      undefined,
      201
    );
  } catch (err) {
    console.error('Onboarding error:', err);
    return errorResponse('INTERNAL', 'An unexpected error occurred during onboarding.', undefined, 500);
  }
}
