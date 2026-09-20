import { Tenant, TenantStatus, CoOccupant } from '@/types';
import {
  getTenantFilePath,
  getTenantsDir,
  listJsonFiles,
  readJson,
  writeJson,
  deleteFile,
} from '../jsonStore';
import { getRoom, updateRoom } from './roomRepo';
import { createCoOccupant, deleteCoOccupantsForRoom } from './coOccupantRepo';
import { v4 as uuidv4 } from 'uuid';

export async function listAllTenants(ownerId: string): Promise<Tenant[]> {
  const dir = getTenantsDir(ownerId);
  return listJsonFiles<Tenant>(dir);
}

export async function listTenantsForBuilding(
  ownerId: string,
  buildingId: string
): Promise<Tenant[]> {
  const all = await listAllTenants(ownerId);
  return all.filter((t) => t.buildingId === buildingId);
}

export async function getTenant(
  ownerId: string,
  tenantId: string
): Promise<Tenant | null> {
  const filePath = getTenantFilePath(ownerId, tenantId);
  return readJson<Tenant | null>(filePath, null);
}

export async function listTenants(
  ownerId: string,
  filters?: {
    buildingId?: string;
    roomId?: string;
    status?: TenantStatus;
    search?: string;
  }
): Promise<Tenant[]> {
  let tenants = await listAllTenants(ownerId);

  if (filters?.buildingId) {
    tenants = tenants.filter((t) => t.buildingId === filters.buildingId);
  }
  if (filters?.roomId) {
    tenants = tenants.filter((t) => t.roomId === filters.roomId);
  }
  if (filters?.status) {
    tenants = tenants.filter((t) => t.status === filters.status);
  }
  if (filters?.search) {
    const q = filters.search.toLowerCase().trim();
    tenants = tenants.filter(
      (t) =>
        t.fullName.toLowerCase().includes(q) ||
        t.phone.includes(q) ||
        t.email.toLowerCase().includes(q)
    );
  }

  // Sort by checkInDate desc
  tenants.sort(
    (a, b) => new Date(b.checkInDate).getTime() - new Date(a.checkInDate).getTime()
  );
  return tenants;
}

export async function createTenant(ownerId: string, tenant: Tenant): Promise<Tenant> {
  const filePath = getTenantFilePath(ownerId, tenant.id);
  await writeJson(filePath, tenant);
  return tenant;
}

export async function updateTenant(
  ownerId: string,
  tenantId: string,
  updates: Partial<Tenant>
): Promise<Tenant | null> {
  const current = await getTenant(ownerId, tenantId);
  if (!current) return null;

  // status, roomId, buildingId, checkInDate cannot be modified via simple patch
  const updated: Tenant = {
    ...current,
    ...updates,
    id: current.id,
    buildingId: current.buildingId,
    roomId: current.roomId,
    checkInDate: current.checkInDate,
    status: current.status,
  };

  const filePath = getTenantFilePath(ownerId, tenantId);
  await writeJson(filePath, updated);
  return updated;
}

export async function deleteTenant(ownerId: string, tenantId: string): Promise<boolean> {
  const filePath = getTenantFilePath(ownerId, tenantId);
  return deleteFile(filePath);
}

export interface CheckInPayload {
  buildingId: string;
  roomId: string;
  fullName: string;
  phone: string;
  email?: string;
  gender?: 'male' | 'female' | 'other';
  occupation?: string;
  workOrCollegeName?: string;
  permanentAddress?: string;
  emergencyContactName?: string;
  emergencyContactRelation?: string;
  emergencyContactPhone?: string;
  checkInDate: string;
  monthlyRent: number;
  securityDeposit: number;
  depositStatus: 'paid' | 'partial' | 'pending';
  idProofNumber?: string;
  coOccupants?: Array<{
    fullName: string;
    relationship: string;
    phone: string;
    gender: 'male' | 'female' | 'other';
    aadharNumber?: string;
  }>;
}

export async function checkInTenant(
  ownerId: string,
  data: CheckInPayload
): Promise<
  | { success: true; tenant: Tenant; room: any; coOccupants: CoOccupant[] }
  | { success: false; code: 'ROOM_NOT_FOUND' | 'ROOM_NOT_VACANT' | 'ROOM_CAPACITY_EXCEEDED'; message: string }
> {
  const room = await getRoom(ownerId, data.roomId);
  if (!room || room.buildingId !== data.buildingId) {
    return { success: false, code: 'ROOM_NOT_FOUND', message: 'Room not found in specified building.' };
  }

  if (room.status !== 'vacant') {
    return { success: false, code: 'ROOM_NOT_VACANT', message: 'Room is not vacant.' };
  }

  const requestedOccupants = 1 + (data.coOccupants?.length || 0);
  if (requestedOccupants > room.capacity) {
    return {
      success: false,
      code: 'ROOM_CAPACITY_EXCEEDED',
      message: `Room capacity is ${room.capacity}, but attempted to check in ${requestedOccupants} persons.`,
    };
  }

  const tenantId = uuidv4();
  const newTenant: Tenant = {
    id: tenantId,
    buildingId: data.buildingId,
    roomId: data.roomId,
    fullName: data.fullName,
    phone: data.phone,
    email: data.email || '',
    gender: data.gender || 'male',
    dateOfBirth: null,
    occupation: data.occupation || 'Software Professional',
    workOrCollegeName: data.workOrCollegeName || '',
    permanentAddress: data.permanentAddress || 'Bangalore, India',
    emergencyContactName: data.emergencyContactName || 'Family',
    emergencyContactRelation: data.emergencyContactRelation || 'Parent',
    emergencyContactPhone: data.emergencyContactPhone || data.phone,
    checkInDate: data.checkInDate,
    expectedCheckOutDate: null,
    noticeGivenDate: null,
    status: 'active',
    monthlyRent: data.monthlyRent,
    securityDeposit: data.securityDeposit,
    depositStatus: data.depositStatus,
    depositPaidAmount: data.depositStatus === 'paid' ? data.securityDeposit : 0,
    documents: data.idProofNumber
      ? [
          {
            id: uuidv4(),
            tenantId,
            type: 'aadhaar',
            title: 'Aadhaar Identity Proof',
            documentNumber: data.idProofNumber,
            uploadDate: data.checkInDate,
            status: 'pending',
          },
        ]
      : [],
    notes: null,
  };

  await createTenant(ownerId, newTenant);

  // Update room status
  const updatedRoom = await updateRoom(ownerId, room.id, {
    status: 'occupied',
    primaryTenantId: tenantId,
  });

  // Create co-occupants
  const createdCoOccupants: CoOccupant[] = [];
  if (data.coOccupants && data.coOccupants.length > 0) {
    for (const co of data.coOccupants) {
      const coOccupant: CoOccupant = {
        id: uuidv4(),
        roomId: data.roomId,
        tenantId,
        fullName: co.fullName,
        relationship: co.relationship,
        phone: co.phone,
        gender: co.gender,
        checkInDate: data.checkInDate,
        aadharNumber: co.aadharNumber || null,
        createdAt: new Date().toISOString(),
      };
      await createCoOccupant(ownerId, coOccupant);
      createdCoOccupants.push(coOccupant);
    }
  }

  return {
    success: true,
    tenant: newTenant,
    room: updatedRoom,
    coOccupants: createdCoOccupants,
  };
}

export async function setTenantNotice(
  ownerId: string,
  tenantId: string,
  expectedCheckOutDate: string
): Promise<{ success: boolean; tenant?: Tenant; error?: string }> {
  const tenant = await getTenant(ownerId, tenantId);
  if (!tenant) return { success: false, error: 'Tenant not found.' };

  if (tenant.status === 'vacated') {
    return { success: false, error: 'Tenant already vacated.' };
  }

  const today = new Date().toISOString().split('T')[0];
  const updated: Tenant = {
    ...tenant,
    status: 'notice_period',
    noticeGivenDate: today,
    expectedCheckOutDate,
  };

  await writeJson(getTenantFilePath(ownerId, tenantId), updated);
  return { success: true, tenant: updated };
}

export async function vacateTenant(
  ownerId: string,
  tenantId: string,
  refundDeposit: boolean
): Promise<{ success: boolean; tenant?: Tenant; room?: any; error?: string }> {
  const tenant = await getTenant(ownerId, tenantId);
  if (!tenant) return { success: false, error: 'Tenant not found.' };

  if (tenant.status === 'vacated') {
    return { success: false, error: 'Tenant already vacated.' };
  }

  const today = new Date().toISOString().split('T')[0];
  const updatedTenant: Tenant = {
    ...tenant,
    status: 'vacated',
    expectedCheckOutDate: tenant.expectedCheckOutDate || today,
    depositStatus: refundDeposit ? 'refunded' : tenant.depositStatus,
  };

  await writeJson(getTenantFilePath(ownerId, tenantId), updatedTenant);

  // Delete co-occupants for that room
  await deleteCoOccupantsForRoom(ownerId, tenant.roomId);

  // Free the room
  const updatedRoom = await updateRoom(ownerId, tenant.roomId, {
    status: 'vacant',
    primaryTenantId: null,
  });

  return {
    success: true,
    tenant: updatedTenant,
    room: updatedRoom,
  };
}
