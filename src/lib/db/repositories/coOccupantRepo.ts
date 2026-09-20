import { CoOccupant } from '@/types';
import { getFirestoreDb, COLLECTIONS } from '../firebase';

export async function listAllCoOccupants(ownerId: string): Promise<CoOccupant[]> {
  const db = getFirestoreDb();
  const snapshot = await db
    .collection(COLLECTIONS.CO_OCCUPANTS)
    .where('ownerId', '==', ownerId)
    .get();
  return snapshot.docs.map((d: any) => d.data() as CoOccupant);
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
  const db = getFirestoreDb();
  const doc = await db.collection(COLLECTIONS.CO_OCCUPANTS).doc(id).get();
  if (!doc.exists) return null;
  const data = doc.data() as CoOccupant & { ownerId?: string };
  if (data.ownerId && data.ownerId !== ownerId) return null;
  return data;
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
  const db = getFirestoreDb();
  const toSave = { ...coOccupant, ownerId };
  await db.collection(COLLECTIONS.CO_OCCUPANTS).doc(coOccupant.id).set(toSave);
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
    ownerId,
  } as any;

  const db = getFirestoreDb();
  await db.collection(COLLECTIONS.CO_OCCUPANTS).doc(id).set(updated);
  return updated;
}

export async function deleteCoOccupant(
  ownerId: string,
  id: string
): Promise<boolean> {
  const db = getFirestoreDb();
  await db.collection(COLLECTIONS.CO_OCCUPANTS).doc(id).delete();
  return true;
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
