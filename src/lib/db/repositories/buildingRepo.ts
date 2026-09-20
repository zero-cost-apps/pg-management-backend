import { Building, BuildingStats } from '@/types';
import {
  getBuildingFilePath,
  getBuildingsDir,
  listJsonFiles,
  readJson,
  writeJson,
  deleteFile,
} from '../jsonStore';
import { listRoomsForBuilding, deleteRoom } from './roomRepo';
import { listTenantsForBuilding, deleteTenant } from './tenantRepo';
import { deletePaymentsForBuilding } from './paymentRepo';
import { deleteElectricityForBuilding } from './electricityRepo';
import { getFirestoreDb, COLLECTIONS } from '../firebase';

export async function listBuildings(ownerId: string): Promise<Building[]> {
  const db = getFirestoreDb();
  let buildings: Building[] = [];

  if (db) {
    const snapshot = await db
      .collection(COLLECTIONS.BUILDINGS)
      .where('ownerId', '==', ownerId)
      .get();
    buildings = snapshot.docs.map((doc: any) => doc.data() as Building);
  } else {
    const dir = getBuildingsDir(ownerId);
    buildings = await listJsonFiles<Building>(dir);
  }

  // Attach computed stats to each building
  const withStats: Building[] = [];
  for (const b of buildings) {
    const stats = await computeBuildingStats(ownerId, b.id);
    withStats.push({ ...b, stats });
  }

  // Sort by createdAt desc
  withStats.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  return withStats;
}

export async function getBuilding(
  ownerId: string,
  buildingId: string
): Promise<Building | null> {
  const db = getFirestoreDb();
  let building: Building | null = null;

  if (db) {
    const doc = await db.collection(COLLECTIONS.BUILDINGS).doc(buildingId).get();
    if (!doc.exists) return null;
    const data = doc.data() as Building;
    if (data.ownerId !== ownerId) return null;
    building = data;
  } else {
    const filePath = getBuildingFilePath(ownerId, buildingId);
    building = await readJson<Building | null>(filePath, null);
    if (!building || building.ownerId !== ownerId) return null;
  }

  const stats = await computeBuildingStats(ownerId, building.id);
  return { ...building, stats };
}

export async function computeBuildingStats(
  ownerId: string,
  buildingId: string
): Promise<BuildingStats> {
  const rooms = await listRoomsForBuilding(ownerId, buildingId);
  const totalRooms = rooms.length;
  let occupiedRooms = 0;
  let vacantRooms = 0;
  let maintenanceRooms = 0;

  for (const r of rooms) {
    if (r.status === 'occupied') occupiedRooms++;
    else if (r.status === 'maintenance') maintenanceRooms++;
    else vacantRooms++;
  }

  return {
    totalRooms,
    occupiedRooms,
    vacantRooms,
    maintenanceRooms,
  };
}

export async function createBuilding(
  ownerId: string,
  building: Building
): Promise<Building> {
  const db = getFirestoreDb();
  if (db) {
    const { stats: _stats, ...cleanBuilding } = building;
    await db.collection(COLLECTIONS.BUILDINGS).doc(building.id).set(cleanBuilding);
    const stats = await computeBuildingStats(ownerId, building.id);
    return { ...building, stats };
  }

  const filePath = getBuildingFilePath(ownerId, building.id);
  await writeJson(filePath, building);
  const stats = await computeBuildingStats(ownerId, building.id);
  return { ...building, stats };
}

export async function updateBuilding(
  ownerId: string,
  buildingId: string,
  updates: Partial<Building>
): Promise<Building | null> {
  const current = await getBuilding(ownerId, buildingId);
  if (!current) return null;

  // Do not allow changing ownerId or id
  const updated: Building = {
    ...current,
    ...updates,
    id: current.id,
    ownerId: current.ownerId,
  };
  delete updated.stats;

  const db = getFirestoreDb();
  if (db) {
    await db.collection(COLLECTIONS.BUILDINGS).doc(buildingId).set(updated);
    const stats = await computeBuildingStats(ownerId, buildingId);
    return { ...updated, stats };
  }

  const filePath = getBuildingFilePath(ownerId, buildingId);
  await writeJson(filePath, updated);

  const stats = await computeBuildingStats(ownerId, buildingId);
  return { ...updated, stats };
}

export async function deleteBuilding(
  ownerId: string,
  buildingId: string
): Promise<{ success: boolean; conflictReason?: string }> {
  const building = await getBuilding(ownerId, buildingId);
  if (!building) return { success: false };

  const rooms = await listRoomsForBuilding(ownerId, buildingId);
  const occupiedRoom = rooms.find((r) => r.status === 'occupied');
  if (occupiedRoom) {
    return { success: false, conflictReason: 'BUILDING_HAS_OCCUPANTS' };
  }

  const tenants = await listTenantsForBuilding(ownerId, buildingId);
  const activeTenant = tenants.find((t) => t.status !== 'vacated');
  if (activeTenant) {
    return { success: false, conflictReason: 'BUILDING_HAS_OCCUPANTS' };
  }

  // Cascade delete rooms
  for (const r of rooms) {
    await deleteRoom(ownerId, r.id);
  }

  // Cascade delete vacated tenants
  for (const t of tenants) {
    await deleteTenant(ownerId, t.id);
  }

  // Cascade delete payments and electricity
  await deletePaymentsForBuilding(ownerId, buildingId);
  await deleteElectricityForBuilding(ownerId, buildingId);

  const db = getFirestoreDb();
  if (db) {
    await db.collection(COLLECTIONS.BUILDINGS).doc(buildingId).delete();
    return { success: true };
  }

  // Delete the building file itself
  const filePath = getBuildingFilePath(ownerId, buildingId);
  await deleteFile(filePath);

  return { success: true };
}
