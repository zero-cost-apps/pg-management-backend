import { ElectricityRecord } from '@/types';
import { getRoom, updateRoom } from './roomRepo';
import { getBuilding } from './buildingRepo';
import { listCoOccupantsForRoom } from './coOccupantRepo';
import { checkIdempotency, saveIdempotency } from './paymentRepo';
import { v4 as uuidv4 } from 'uuid';
import { getFirestoreDb, COLLECTIONS } from '../firebase';

export async function listAllElectricity(ownerId: string): Promise<ElectricityRecord[]> {
  const db = getFirestoreDb();
  const snapshot = await db
    .collection(COLLECTIONS.ELECTRICITY)
    .where('ownerId', '==', ownerId)
    .get();
  return snapshot.docs.map((d: any) => d.data() as ElectricityRecord);
}

export async function getElectricityForRoomAndMonth(
  ownerId: string,
  roomId: string,
  month: string
): Promise<ElectricityRecord | null> {
  const db = getFirestoreDb();
  const snapshot = await db
    .collection(COLLECTIONS.ELECTRICITY)
    .where('ownerId', '==', ownerId)
    .where('roomId', '==', roomId)
    .where('month', '==', month)
    .limit(1)
    .get();
  if (snapshot.empty) return null;
  return snapshot.docs[0].data() as ElectricityRecord;
}

export async function listElectricity(
  ownerId: string,
  filters?: {
    buildingId?: string;
    roomId?: string;
    month?: string;
  }
): Promise<ElectricityRecord[]> {
  const db = getFirestoreDb();
  let query: any = db
    .collection(COLLECTIONS.ELECTRICITY)
    .where('ownerId', '==', ownerId);

  if (filters?.month) {
    query = query.where('month', '==', filters.month);
  }
  if (filters?.buildingId) {
    query = query.where('buildingId', '==', filters.buildingId);
  }
  if (filters?.roomId) {
    query = query.where('roomId', '==', filters.roomId);
  }

  const snapshot = await query.get();
  const records: ElectricityRecord[] = snapshot.docs.map((d: any) => d.data() as ElectricityRecord);

  // Sort by month desc, roomNumber asc
  records.sort((a, b) => {
    if (a.month !== b.month) return b.month.localeCompare(a.month);
    return a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true });
  });

  return records;
}

export interface CreateElectricityPayload {
  roomId: string;
  month: string;
  readingDate: string;
  currentReading: number;
  ratePerUnit?: number;
  billedTenantIds?: string[];
  notes?: string | null;
}

export async function createElectricityRecord(
  ownerId: string,
  payload: CreateElectricityPayload,
  idempotencyKey?: string | null
): Promise<
  | { success: true; record: ElectricityRecord; room: any }
  | {
      success: false;
      code: 'ROOM_NOT_FOUND' | 'INVALID_READING' | 'READING_EXISTS' | 'ALREADY_BILLED';
      message: string;
    }
> {
  if (idempotencyKey) {
    const cached = await checkIdempotency(ownerId, idempotencyKey);
    if (cached) {
      return { success: true, record: cached, room: null };
    }
  }

  const room = await getRoom(ownerId, payload.roomId);
  if (!room) {
    return { success: false, code: 'ROOM_NOT_FOUND', message: 'Room not found.' };
  }

  const existing = await getElectricityForRoomAndMonth(
    ownerId,
    payload.roomId,
    payload.month
  );
  if (existing) {
    return {
      success: false,
      code: 'READING_EXISTS',
      message: `Electricity reading already recorded for Room ${room.roomNumber} in ${payload.month}.`,
    };
  }

  const previousReading = room.lastMeterReading ?? 0;
  if (payload.currentReading < previousReading) {
    return {
      success: false,
      code: 'INVALID_READING',
      message: `Current reading (${payload.currentReading}) cannot be less than previous reading (${previousReading}).`,
    };
  }

  const building = await getBuilding(ownerId, room.buildingId);
  const ratePerUnit = payload.ratePerUnit ?? building?.electricityRatePerUnit ?? 10;
  const unitsConsumed = payload.currentReading - previousReading;
  const totalAmount = Math.round(unitsConsumed * ratePerUnit);

  let billedTenantIds = payload.billedTenantIds;
  const coOccupants = await listCoOccupantsForRoom(ownerId, room.id);
  const occupantCount = (room.primaryTenantId ? 1 : 0) + coOccupants.length;
  if (!billedTenantIds || billedTenantIds.length === 0) {
    billedTenantIds = room.primaryTenantId ? [room.primaryTenantId] : [];
  }

  const splitCount = Math.max(1, payload.billedTenantIds?.length || occupantCount || 1);
  const amountPerTenant = Number((totalAmount / splitCount).toFixed(2));

  const record: ElectricityRecord = {
    id: uuidv4(),
    buildingId: room.buildingId,
    roomId: room.id,
    roomNumber: room.roomNumber,
    month: payload.month,
    readingDate: payload.readingDate,
    previousReading,
    currentReading: payload.currentReading,
    unitsConsumed,
    ratePerUnit,
    totalAmount,
    splitCount,
    amountPerTenant,
    status: 'billed',
    meterPhotoUrl: null,
    hasMeterPhoto: false,
    notes: payload.notes || null,
    billedTenantIds,
    idempotencyKey: idempotencyKey || null,
  };

  const db = getFirestoreDb();
  await db
    .collection(COLLECTIONS.ELECTRICITY)
    .doc(record.id)
    .set({ ...record, ownerId });

  // Update room last meter reading
  const updatedRoom = await updateRoom(ownerId, room.id, {
    lastMeterReading: payload.currentReading,
    lastMeterReadingDate: payload.readingDate,
  });

  if (idempotencyKey) {
    await saveIdempotency(ownerId, idempotencyKey, record);
  }

  return { success: true, record, room: updatedRoom };
}

export async function deleteElectricityForBuilding(
  ownerId: string,
  buildingId: string
): Promise<void> {
  const db = getFirestoreDb();
  const snapshot = await db
    .collection(COLLECTIONS.ELECTRICITY)
    .where('ownerId', '==', ownerId)
    .where('buildingId', '==', buildingId)
    .get();
  const batch = db.batch();
  snapshot.docs.forEach((doc: any) => batch.delete(doc.ref));
  await batch.commit();
}
