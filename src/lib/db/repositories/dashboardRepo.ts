import { DashboardStats, OverdueSummaryItem } from '@/types';
import { listBuildings } from './buildingRepo';
import { listRooms } from './roomRepo';
import { listTenants } from './tenantRepo';
import { listCoOccupants } from './coOccupantRepo';
import { listPayments } from './paymentRepo';
import { listElectricity } from './electricityRepo';

function getCurrentMonth(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export async function getOverdueItems(
  ownerId: string,
  buildingId?: string | null,
  monthQuery?: string | null
): Promise<{ month: string; asOf: string; items: OverdueSummaryItem[] }> {
  const month = monthQuery || getCurrentMonth();
  const todayStr = new Date().toISOString().split('T')[0];
  const today = new Date(todayStr).getTime();

  const buildings = await listBuildings(ownerId);
  const buildingsMap = new Map(buildings.map((b) => [b.id, b]));

  let tenants = await listTenants(ownerId);
  tenants = tenants.filter((t) => t.status !== 'vacated');
  if (buildingId) {
    tenants = tenants.filter((t) => t.buildingId === buildingId);
  }

  const payments = await listPayments(ownerId, { billingMonth: month });
  const electricityRecords = await listElectricity(ownerId, { month });

  const [yearStr, monthStr] = month.split('-');
  const year = parseInt(yearStr, 10);
  const m = parseInt(monthStr, 10);
  const lastDayOfMonth = new Date(Date.UTC(year, m, 0)).getUTCDate();

  const items: OverdueSummaryItem[] = [];

  for (const tenant of tenants) {
    const building = buildingsMap.get(tenant.buildingId);
    if (!building) continue;

    const dueDay = building.billingDueDay || 5;
    const clampedDueDay = Math.min(dueDay, lastDayOfMonth);
    const dueDate = `${month}-${String(clampedDueDay).padStart(2, '0')}`;
    const dueTime = new Date(dueDate).getTime();

    // If today is not past due date, skip
    if (today < dueTime) {
      continue;
    }

    const tenantPayments = payments.filter((p) => p.tenantId === tenant.id);
    const paid = tenantPayments.reduce((sum, p) => sum + p.amountPaid, 0);

    const roomElec = electricityRecords.find(
      (r) => r.roomId === tenant.roomId && r.billedTenantIds.includes(tenant.id)
    );
    const elecShare = roomElec ? roomElec.amountPerTenant : 0;

    const expected = tenant.monthlyRent + elecShare;
    const balance = Math.max(0, expected - paid);

    if (balance <= 0) {
      continue;
    }

    const overdueRent = Math.max(0, tenant.monthlyRent - paid);
    const overdueElectricity = Math.max(0, balance - overdueRent);
    const daysOverdue = Math.floor((today - dueTime) / (1000 * 60 * 60 * 24));

    items.push({
      tenantId: tenant.id,
      tenant: {
        id: tenant.id,
        fullName: tenant.fullName,
        phone: tenant.phone,
        email: tenant.email,
        status: tenant.status,
      },
      building: {
        id: building.id,
        name: building.name,
        code: building.code,
      },
      room: {
        id: tenant.roomId,
        roomNumber: roomElec?.roomNumber || 'Room',
      },
      billingMonth: month,
      dueDate,
      daysOverdue,
      overdueRent,
      overdueElectricity,
      totalOverdue: balance,
      lastContactedDate: null,
      notes: null,
    });
  }

  // Sort daysOverdue desc
  items.sort((a, b) => b.daysOverdue - a.daysOverdue);

  return {
    month,
    asOf: todayStr,
    items,
  };
}

export async function getDashboardStats(
  ownerId: string,
  buildingId?: string | null,
  monthQuery?: string | null
): Promise<{ month: string; buildingId: string | null; stats: DashboardStats }> {
  const month = monthQuery || getCurrentMonth();

  let buildings = await listBuildings(ownerId);
  if (buildingId) {
    buildings = buildings.filter((b) => b.id === buildingId);
  }
  const totalBuildings = buildings.length;

  let rooms = await listRooms(ownerId);
  if (buildingId) {
    rooms = rooms.filter((r) => r.buildingId === buildingId);
  }
  const totalRooms = rooms.length;
  let occupiedRooms = 0;
  let vacantRooms = 0;
  let maintenanceRooms = 0;
  let totalAllowedCapacity = 0;

  for (const r of rooms) {
    totalAllowedCapacity += r.capacity;
    if (r.status === 'occupied') occupiedRooms++;
    else if (r.status === 'maintenance') maintenanceRooms++;
    else vacantRooms++;
  }

  const occupancyRate = totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 100) : 0;

  let tenants = await listTenants(ownerId);
  tenants = tenants.filter((t) => t.status !== 'vacated');
  if (buildingId) {
    tenants = tenants.filter((t) => t.buildingId === buildingId);
  }

  let coOccupants = await listCoOccupants(ownerId);
  if (buildingId) {
    const roomIds = new Set(rooms.map((r) => r.id));
    coOccupants = coOccupants.filter((c) => roomIds.has(c.roomId));
  }

  const totalResidents = tenants.length + coOccupants.length;

  // Payments in month
  let payments = await listPayments(ownerId, { billingMonth: month });
  if (buildingId) {
    payments = payments.filter((p) => p.buildingId === buildingId);
  }
  const collectedRevenue = payments.reduce((sum, p) => sum + p.amountPaid, 0);
  const electricityCollected = payments.reduce((sum, p) => sum + (p.electricityAmount || 0), 0);

  // Electricity records in month
  let electricityRecords = await listElectricity(ownerId, { month });
  if (buildingId) {
    electricityRecords = electricityRecords.filter((e) => e.buildingId === buildingId);
  }
  const totalElectricityBilled = electricityRecords.reduce((sum, e) => sum + e.totalAmount, 0);

  const rentExpected = tenants.reduce((sum, t) => sum + t.monthlyRent, 0);
  const expectedRevenue = rentExpected + totalElectricityBilled;

  // Overdue
  const overdueData = await getOverdueItems(ownerId, buildingId, month);
  const totalOverdueAmount = overdueData.items.reduce((sum, item) => sum + item.totalOverdue, 0);
  const overdueTenantsCount = overdueData.items.length;

  return {
    month,
    buildingId: buildingId || null,
    stats: {
      totalBuildings,
      totalRooms,
      occupiedRooms,
      vacantRooms,
      maintenanceRooms,
      totalResidents,
      totalAllowedCapacity,
      occupancyRate,
      expectedRevenue,
      collectedRevenue,
      totalOverdueAmount,
      overdueTenantsCount,
      electricityCollected,
    },
  };
}
