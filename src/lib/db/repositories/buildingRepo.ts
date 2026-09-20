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

export async function listBuildings(ownerId: string): Promise<Building[]> {
  const dir = getBuildingsDir(ownerId);
  const buildings = await listJsonFiles<Building>(dir);

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
  const filePath = getBuildingFilePath(ownerId, buildingId);
  const building = await readJson<Building | null>(filePath, null);
  if (!building || building.ownerId !== ownerId) return null;

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

  // Delete the building file itself
  const filePath = getBuildingFilePath(ownerId, buildingId);
  await deleteFile(filePath);

  return { success: true };
}
