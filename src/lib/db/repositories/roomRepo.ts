import { Room, RoomStatus } from '@/types';
import { listCoOccupantsForRoom } from './coOccupantRepo';
import { getFirestoreDb, COLLECTIONS } from '../firebase';

export async function listAllRooms(ownerId: string): Promise<Room[]> {
  const db = getFirestoreDb();
  const snapshot = await db
    .collection(COLLECTIONS.ROOMS)
    .where('ownerId', '==', ownerId)
    .get();
  return snapshot.docs.map((doc: any) => doc.data() as Room);
}

export async function listRoomsForBuilding(
  ownerId: string,
  buildingId: string
): Promise<Room[]> {
  const allRooms = await listAllRooms(ownerId);
  return allRooms.filter((r) => r.buildingId === buildingId);
}

export async function computeOccupantCount(
  ownerId: string,
  roomId: string,
  primaryTenantId?: string | null
): Promise<number> {
  let count = primaryTenantId ? 1 : 0;
  const coOccupants = await listCoOccupantsForRoom(ownerId, roomId);
  count += coOccupants.length;
  return count;
}

export async function getRoom(
  ownerId: string,
  roomId: string
): Promise<Room | null> {
  const db = getFirestoreDb();
  const doc = await db.collection(COLLECTIONS.ROOMS).doc(roomId).get();
  if (!doc.exists) return null;
  const data = doc.data() as Room;
  if (data.ownerId !== ownerId) return null;

  const occupantCount = await computeOccupantCount(
    ownerId,
    data.id,
    data.primaryTenantId
  );
  return { ...data, occupantCount };
}

export async function listRooms(
  ownerId: string,
  filters?: {
    buildingId?: string;
    status?: RoomStatus;
    floor?: number;
    search?: string;
  }
): Promise<Room[]> {
  let rooms = await listAllRooms(ownerId);

  if (filters?.buildingId) {
    rooms = rooms.filter((r) => r.buildingId === filters.buildingId);
  }
  if (filters?.status) {
    rooms = rooms.filter((r) => r.status === filters.status);
  }
  if (filters?.floor !== undefined) {
    rooms = rooms.filter((r) => r.floor === filters.floor);
  }
  if (filters?.search) {
    const q = filters.search.toLowerCase().trim();
    rooms = rooms.filter((r) => r.roomNumber.toLowerCase().includes(q));
  }

  // Sort by floor asc, roomNumber asc
  rooms.sort((a, b) => {
    if (a.floor !== b.floor) return a.floor - b.floor;
    return a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true });
  });

  const withOccupantCount: Room[] = [];
  for (const r of rooms) {
    const occupantCount = await computeOccupantCount(
      ownerId,
      r.id,
      r.primaryTenantId
    );
    withOccupantCount.push({ ...r, occupantCount });
  }

  return withOccupantCount;
}

function stripUndefined(obj: any): any {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, v]) => v !== undefined)
  );
}

export async function createRoom(ownerId: string, room: Room): Promise<Room> {
  const db = getFirestoreDb();
  const { occupantCount: _count, ...cleanRoom } = room;
  const toSave = { ...cleanRoom, ownerId };

  await db.collection(COLLECTIONS.ROOMS).doc(room.id).set(stripUndefined(toSave));
  const occupantCount = await computeOccupantCount(
    ownerId,
    room.id,
    room.primaryTenantId
  );
  return { ...toSave, occupantCount };
}

export async function updateRoom(
  ownerId: string,
  roomId: string,
  updates: Partial<Room>
): Promise<Room | null> {
  const current = await getRoom(ownerId, roomId);
  if (!current) return null;

  const updated: Room = {
    ...current,
    ...updates,
    id: current.id,
    ownerId: current.ownerId,
  };
  delete updated.occupantCount;

  const db = getFirestoreDb();
  await db.collection(COLLECTIONS.ROOMS).doc(roomId).set(stripUndefined(updated));
  const occupantCount = await computeOccupantCount(
    ownerId,
    roomId,
    updated.primaryTenantId
  );
  return { ...updated, occupantCount };
}

export async function deleteRoom(
  ownerId: string,
  roomId: string
): Promise<{ success: boolean; conflictReason?: string }> {
  const room = await getRoom(ownerId, roomId);
  if (!room) return { success: false };

  if (room.status !== 'vacant' || room.primaryTenantId) {
    return { success: false, conflictReason: 'ROOM_NOT_VACANT' };
  }

  const db = getFirestoreDb();
  await db.collection(COLLECTIONS.ROOMS).doc(roomId).delete();
  return { success: true };
}
