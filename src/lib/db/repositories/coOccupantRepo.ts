import { CoOccupant } from '@/types';
import {
  getCoOccupantFilePath,
  getCoOccupantsDir,
  listJsonFiles,
  readJson,
  writeJson,
  deleteFile,
} from '../jsonStore';

export async function listAllCoOccupants(ownerId: string): Promise<CoOccupant[]> {
  const dir = getCoOccupantsDir(ownerId);
  return listJsonFiles<CoOccupant>(dir);
}

export async function listCoOccupantsForRoom(
  ownerId: string,
  roomId: string
): Promise<CoOccupant[]> {
  const all = await listAllCoOccupants(ownerId);
  return all.filter((c) => c.roomId === roomId);
}

export async function listCoOccupantsForTenant(
  ownerId: string,
  tenantId: string
): Promise<CoOccupant[]> {
  const all = await listAllCoOccupants(ownerId);
  return all.filter((c) => c.tenantId === tenantId);
}

export async function getCoOccupant(
  ownerId: string,
  id: string
): Promise<CoOccupant | null> {
  const filePath = getCoOccupantFilePath(ownerId, id);
  return readJson<CoOccupant | null>(filePath, null);
}

export async function listCoOccupants(
  ownerId: string,
  filters?: { roomId?: string; tenantId?: string }
): Promise<CoOccupant[]> {
  let all = await listAllCoOccupants(ownerId);
  if (filters?.roomId) {
    all = all.filter((c) => c.roomId === filters.roomId);
  }
  if (filters?.tenantId) {
    all = all.filter((c) => c.tenantId === filters.tenantId);
  }
  return all;
}

export async function createCoOccupant(
  ownerId: string,
  coOccupant: CoOccupant
): Promise<CoOccupant> {
  const filePath = getCoOccupantFilePath(ownerId, coOccupant.id);
  await writeJson(filePath, coOccupant);
  return coOccupant;
}

export async function updateCoOccupant(
  ownerId: string,
  id: string,
  updates: Partial<CoOccupant>
): Promise<CoOccupant | null> {
  const current = await getCoOccupant(ownerId, id);
  if (!current) return null;

  const updated: CoOccupant = {
    ...current,
    ...updates,
    id: current.id,
    roomId: current.roomId,
    tenantId: current.tenantId,
  };

  const filePath = getCoOccupantFilePath(ownerId, id);
  await writeJson(filePath, updated);
  return updated;
}

export async function deleteCoOccupant(
  ownerId: string,
  id: string
): Promise<boolean> {
  const filePath = getCoOccupantFilePath(ownerId, id);
  return deleteFile(filePath);
}

export async function deleteCoOccupantsForRoom(
  ownerId: string,
  roomId: string
): Promise<void> {
  const coOccupants = await listCoOccupantsForRoom(ownerId, roomId);
  for (const c of coOccupants) {
    await deleteCoOccupant(ownerId, c.id);
  }
}
