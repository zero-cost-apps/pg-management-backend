import { ElectricityRecord } from '@/types';
import {
  getElectricityDir,
  getElectricityFilePath,
  listJsonFiles,
  readJson,
  writeJson,
} from '../jsonStore';
import { getRoom, updateRoom } from './roomRepo';
import { getBuilding } from './buildingRepo';
import { checkIdempotency, saveIdempotency } from './paymentRepo';
import { v4 as uuidv4 } from 'uuid';

export async function listAllElectricity(ownerId: string): Promise<ElectricityRecord[]> {
  const dir = getElectricityDir(ownerId);
  const monthFiles = await listJsonFiles<ElectricityRecord[]>(dir);
  const all: ElectricityRecord[] = [];
  for (const arr of monthFiles) {
    if (Array.isArray(arr)) {
      all.push(...arr);
    }
  }
  return all;
}

export async function getElectricityForRoomAndMonth(
  ownerId: string,
  roomId: string,
  month: string
): Promise<ElectricityRecord | null> {
  const filePath = getElectricityFilePath(ownerId, month);
  const records = await readJson<ElectricityRecord[]>(filePath, []);
  return records.find((r) => r.roomId === roomId) || null;
}

export async function listElectricity(
  ownerId: string,
  filters?: {
    buildingId?: string;
    roomId?: string;
    month?: string;
  }
): Promise<ElectricityRecord[]> {
  let records: ElectricityRecord[] = [];
  if (filters?.month) {
    const filePath = getElectricityFilePath(ownerId, filters.month);
    records = await readJson<ElectricityRecord[]>(filePath, []);
  } else {
    records = await listAllElectricity(ownerId);
  }

  if (filters?.buildingId) {
    records = records.filter((r) => r.buildingId === filters.buildingId);
  }
  if (filters?.roomId) {
    records = records.filter((r) => r.roomId === filters.roomId);
  }

  records.sort(
    (a, b) => new Date(b.readingDate).getTime() - new Date(a.readingDate).getTime()
  );
  return records;
}

export interface CreateElectricityPayload {
  roomId: string;
  month: string;
  readingDate: string;
  previousReading?: number;
  currentReading: number;
  ratePerUnit?: number;
  allowDecrease?: boolean;
  notes?: string | null;
}

export async function createElectricityRecord(
  ownerId: string,
  payload: CreateElectricityPayload,
  idempotencyKey?: string | null
): Promise<
  | { success: true; record: ElectricityRecord; room: any }
  | { success: false; code: 'READING_EXISTS' | 'INVALID_READING' | 'ROOM_NOT_FOUND'; message: string }
> {
  if (idempotencyKey) {
    const cached = await checkIdempotency(ownerId, idempotencyKey);
    if (cached) {
      const room = await getRoom(ownerId, payload.roomId);
      return { success: true, record: cached, room };
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
      message: `Electricity reading already recorded for room ${room.roomNumber} in ${payload.month}.`,
    };
  }

  const building = await getBuilding(ownerId, room.buildingId);
  const previousReading =
    payload.previousReading !== undefined
      ? payload.previousReading
      : room.lastMeterReading || 0;

  if (payload.currentReading < previousReading && !payload.allowDecrease) {
    return {
      success: false,
      code: 'INVALID_READING',
      message: `Current reading (${payload.currentReading}) is less than previous reading (${previousReading}). Provide allowDecrease: true to confirm.`,
    };
  }

  const ratePerUnit =
    payload.ratePerUnit !== undefined
      ? payload.ratePerUnit
      : building?.electricityRatePerUnit || 10;

  const unitsConsumed = Math.max(0, payload.currentReading - previousReading);
  const totalAmount = Math.round(unitsConsumed * ratePerUnit * 100) / 100;

  // Split calculation: count of occupants (room.occupantCount or primary tenant)
  const splitCount = Math.max(1, room.occupantCount || 1);
  const amountPerTenant = Math.round((totalAmount / splitCount) * 100) / 100;
  const billedTenantIds = room.primaryTenantId ? [room.primaryTenantId] : [];

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

  const filePath = getElectricityFilePath(ownerId, payload.month);
  const monthRecords = await readJson<ElectricityRecord[]>(filePath, []);
  monthRecords.push(record);
  await writeJson(filePath, monthRecords);

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
  const dir = getElectricityDir(ownerId);
  const fs = await import('fs/promises');
  const path = await import('path');
  try {
    const entries = await fs.readdir(dir);
    for (const name of entries) {
      if (name.endsWith('.json')) {
        const p = path.join(dir, name);
        const records = await readJson<ElectricityRecord[]>(p, []);
        const filtered = records.filter((item) => item.buildingId !== buildingId);
        await writeJson(p, filtered);
      }
    }
  } catch {}
}
