import { Tenant, TenantStatus, CoOccupant } from '@/types';
import { getRoom, updateRoom } from './roomRepo';
import { createCoOccupant, deleteCoOccupantsForRoom } from './coOccupantRepo';
import { v4 as uuidv4 } from 'uuid';
import { getFirestoreDb, COLLECTIONS } from '../firebase';

export async function listAllTenants(ownerId: string): Promise<Tenant[]> {
  const db = getFirestoreDb();
  const snapshot = await db
    .collection(COLLECTIONS.TENANTS)
    .where('ownerId', '==', ownerId)
    .get();
  return snapshot.docs.map((doc: any) => doc.data() as Tenant);
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
  const db = getFirestoreDb();
  const doc = await db.collection(COLLECTIONS.TENANTS).doc(tenantId).get();
  if (!doc.exists) return null;
  const data = doc.data() as Tenant & { ownerId?: string };
  if (data.ownerId && data.ownerId !== ownerId) return null;
  return data;
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
  const db = getFirestoreDb();
  const toSave = { ...tenant, ownerId };
  await db.collection(COLLECTIONS.TENANTS).doc(tenant.id).set(toSave);
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
    ownerId,
  } as any;

  const db = getFirestoreDb();
  await db.collection(COLLECTIONS.TENANTS).doc(tenantId).set(updated);
  return updated;
}

export async function deleteTenant(ownerId: string, tenantId: string): Promise<boolean> {
  const db = getFirestoreDb();
  await db.collection(COLLECTIONS.TENANTS).doc(tenantId).delete();
  return true;
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
    fullName: data.fullName.trim(),
    phone: data.phone.trim(),
    email: data.email?.trim().toLowerCase() || `${data.phone.replace(/\D/g, '')}@tenant.staysync.in`,
    gender: data.gender || 'male',
    occupation: data.occupation || 'Private Employee',
    workOrCollegeName: data.workOrCollegeName || null,
    permanentAddress: data.permanentAddress || null,
    emergencyContactName: data.emergencyContactName || null,
    emergencyContactRelation: data.emergencyContactRelation || null,
    emergencyContactPhone: data.emergencyContactPhone || null,
    checkInDate: data.checkInDate,
    expectedCheckOutDate: null,
    monthlyRent: data.monthlyRent,
    securityDeposit: data.securityDeposit,
    depositStatus: data.depositStatus,
    status: 'active',
    documents: [],
    ownerId,
  } as any;

  await createTenant(ownerId, newTenant);

  // Create Co-Occupants if provided
  const createdCoOccupants: CoOccupant[] = [];
  if (data.coOccupants && data.coOccupants.length > 0) {
    for (const co of data.coOccupants) {
      const coId = uuidv4();
      const coRecord: CoOccupant = {
        id: coId,
        tenantId,
        roomId: data.roomId,
        fullName: co.fullName.trim(),
        relationship: co.relationship || 'Friend / Roommate',
        phone: co.phone?.trim() || '',
        gender: co.gender || 'male',
        aadharNumber: co.aadharNumber || null,
        aadharDocName: null,
        hasAadhaarFile: false,
        createdAt: new Date().toISOString(),
        ownerId,
      } as any;
      const saved = await createCoOccupant(ownerId, coRecord);
      createdCoOccupants.push(saved);
    }
  }

  // Update room status to occupied and set primaryTenantId
  const updatedRoom = await updateRoom(ownerId, data.roomId, {
    status: 'occupied',
    primaryTenantId: tenantId,
  });

  return {
    success: true,
    tenant: newTenant,
    room: updatedRoom,
    coOccupants: createdCoOccupants,
  };
}

export async function putTenantOnNotice(
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
    ownerId,
  } as any;

  const db = getFirestoreDb();
  await db.collection(COLLECTIONS.TENANTS).doc(tenantId).set(updated);
  return { success: true, tenant: updated };
}

export const setTenantNotice = putTenantOnNotice;

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
    ownerId,
  } as any;

  const db = getFirestoreDb();
  await db.collection(COLLECTIONS.TENANTS).doc(tenantId).set(updatedTenant);

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
