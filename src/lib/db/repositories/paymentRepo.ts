import { RentPayment, PaymentMode, PaymentStatus } from '@/types';
import {
  getPaymentsDir,
  getPaymentsFilePath,
  getIdempotencyFilePath,
  listJsonFiles,
  readJson,
  writeJson,
} from '../jsonStore';
import { getTenant } from './tenantRepo';
import { getBuilding } from './buildingRepo';
import { getRoom } from './roomRepo';
import { getElectricityForRoomAndMonth } from './electricityRepo';
import { v4 as uuidv4 } from 'uuid';
import { getFirestoreDb, COLLECTIONS } from '../firebase';

export async function listAllPayments(ownerId: string): Promise<RentPayment[]> {
  const db = getFirestoreDb();
  if (db) {
    const snapshot = await db
      .collection(COLLECTIONS.PAYMENTS)
      .where('ownerId', '==', ownerId)
      .get();
    return snapshot.docs.map((d: any) => d.data() as RentPayment);
  }

  const dir = getPaymentsDir(ownerId);
  const monthFiles = await listJsonFiles<RentPayment[]>(dir);
  const all: RentPayment[] = [];
  for (const arr of monthFiles) {
    if (Array.isArray(arr)) {
      all.push(...arr);
    }
  }
  return all;
}

export async function listPayments(
  ownerId: string,
  filters?: {
    buildingId?: string;
    tenantId?: string;
    billingMonth?: string;
    status?: PaymentStatus;
  }
): Promise<RentPayment[]> {
  let payments: RentPayment[] = [];
  const db = getFirestoreDb();

  if (db) {
    let query: any = db
      .collection(COLLECTIONS.PAYMENTS)
      .where('ownerId', '==', ownerId);

    if (filters?.billingMonth) {
      query = query.where('billingMonth', '==', filters.billingMonth);
    }
    if (filters?.buildingId) {
      query = query.where('buildingId', '==', filters.buildingId);
    }
    if (filters?.tenantId) {
      query = query.where('tenantId', '==', filters.tenantId);
    }
    if (filters?.status) {
      query = query.where('status', '==', filters.status);
    }
    const snapshot = await query.get();
    payments = snapshot.docs.map((d: any) => d.data() as RentPayment);
  } else {
    if (filters?.billingMonth) {
      const filePath = getPaymentsFilePath(ownerId, filters.billingMonth);
      payments = await readJson<RentPayment[]>(filePath, []);
    } else {
      payments = await listAllPayments(ownerId);
    }

    if (filters?.buildingId) {
      payments = payments.filter((p) => p.buildingId === filters.buildingId);
    }
    if (filters?.tenantId) {
      payments = payments.filter((p) => p.tenantId === filters.tenantId);
    }
    if (filters?.status) {
      payments = payments.filter((p) => p.status === filters.status);
    }
  }

  // Sort by createdAt desc
  payments.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  return payments;
}

export async function getPayment(
  ownerId: string,
  paymentId: string
): Promise<RentPayment | null> {
  const db = getFirestoreDb();
  if (db) {
    const doc = await db.collection(COLLECTIONS.PAYMENTS).doc(paymentId).get();
    if (!doc.exists) return null;
    const data = doc.data() as RentPayment & { ownerId?: string };
    if (data.ownerId && data.ownerId !== ownerId) return null;
    return data;
  }

  const all = await listAllPayments(ownerId);
  return all.find((p) => p.id === paymentId) || null;
}

export async function checkIdempotency(
  ownerId: string,
  key: string
): Promise<any | null> {
  const db = getFirestoreDb();
  if (db) {
    const doc = await db
      .collection(COLLECTIONS.IDEMPOTENCY)
      .doc(`${ownerId}_${key}`)
      .get();
    if (!doc.exists) return null;
    return doc.data()?.data || null;
  }

  const filePath = getIdempotencyFilePath(ownerId);
  const cache = await readJson<Record<string, any>>(filePath, {});
  return cache[key] || null;
}

export async function saveIdempotency(
  ownerId: string,
  key: string,
  data: any
): Promise<void> {
  const db = getFirestoreDb();
  if (db) {
    await db
      .collection(COLLECTIONS.IDEMPOTENCY)
      .doc(`${ownerId}_${key}`)
      .set({
        ownerId,
        key,
        data,
        createdAt: new Date().toISOString(),
      });
    return;
  }

  const filePath = getIdempotencyFilePath(ownerId);
  const cache = await readJson<Record<string, any>>(filePath, {});
  cache[key] = data;
  await writeJson(filePath, cache);
}

function getMonthDates(month: string): { start: string; end: string } {
  const [yearStr, monthStr] = month.split('-');
  const year = parseInt(yearStr, 10);
  const m = parseInt(monthStr, 10);
  const startDate = `${month}-01`;
  const lastDay = new Date(Date.UTC(year, m, 0)).getUTCDate();
  const endDate = `${month}-${String(lastDay).padStart(2, '0')}`;
  return { start: startDate, end: endDate };
}

export interface CreatePaymentPayload {
  tenantId: string;
  billingMonth: string;
  rentAmount: number;
  includeElectricity?: boolean;
  electricityAmount?: number;
  electricityUnits?: number;
  maintenanceCharges?: number;
  otherCharges?: number;
  discount?: number;
  amountPaid: number;
  paymentDate: string;
  paymentMode: PaymentMode;
  transactionReference?: string | null;
  receivedBy?: string;
  notes?: string | null;
}

export async function createPayment(
  ownerId: string,
  payload: CreatePaymentPayload,
  idempotencyKey?: string | null
): Promise<{ success: boolean; payment?: RentPayment; error?: string }> {
  if (idempotencyKey) {
    const cached = await checkIdempotency(ownerId, idempotencyKey);
    if (cached) {
      return { success: true, payment: cached };
    }
  }

  const tenant = await getTenant(ownerId, payload.tenantId);
  if (!tenant) {
    return { success: false, error: 'Tenant not found.' };
  }
  if (tenant.status === 'vacated') {
    return { success: false, error: 'Tenant is already vacated.' };
  }

  const building = await getBuilding(ownerId, tenant.buildingId);
  const room = await getRoom(ownerId, tenant.roomId);

  let electricityAmount = payload.electricityAmount ?? 0;
  let electricityUnits = payload.electricityUnits;

  if (payload.includeElectricity && payload.electricityAmount === undefined) {
    const elecRecord = await getElectricityForRoomAndMonth(
      ownerId,
      tenant.roomId,
      payload.billingMonth
    );
    if (elecRecord && elecRecord.billedTenantIds.includes(tenant.id)) {
      electricityAmount = elecRecord.amountPerTenant;
      electricityUnits = Math.round(elecRecord.unitsConsumed / elecRecord.splitCount);
    }
  }

  const rentAmount = payload.rentAmount;
  const maintenanceCharges = payload.maintenanceCharges ?? 0;
  const otherCharges = payload.otherCharges ?? 0;
  const discount = payload.discount ?? 0;
  const amountPaid = payload.amountPaid;

  const totalPayable = Math.max(
    0,
    rentAmount + electricityAmount + maintenanceCharges + otherCharges - discount
  );
  const balanceDue = Math.max(0, totalPayable - amountPaid);
  const status: PaymentStatus =
    balanceDue === 0 && amountPaid > 0
      ? 'paid'
      : amountPaid > 0
      ? 'partial'
      : 'pending';

  // Read current month payments to calculate next sequence
  const currentPayments = await listPayments(ownerId, { billingMonth: payload.billingMonth });
  const seq = String(currentPayments.length + 1).padStart(3, '0');
  const cleanMonth = payload.billingMonth.replace('-', '');
  const receiptNumber = `RCP-${cleanMonth}-${seq}`;

  const { start: billingPeriodStart, end: billingPeriodEnd } = getMonthDates(
    payload.billingMonth
  );

  const payment: RentPayment = {
    id: uuidv4(),
    receiptNumber,
    tenantId: tenant.id,
    tenantName: tenant.fullName,
    buildingId: tenant.buildingId,
    buildingName: building?.name || 'Property',
    roomId: tenant.roomId,
    roomNumber: room?.roomNumber || 'Room',
    billingMonth: payload.billingMonth,
    billingPeriodStart,
    billingPeriodEnd,
    rentAmount,
    electricityAmount,
    electricityUnits,
    maintenanceCharges,
    otherCharges,
    discount,
    totalPayable,
    amountPaid,
    balanceDue,
    paymentDate: payload.paymentDate,
    paymentMode: payload.paymentMode,
    transactionReference: payload.transactionReference || null,
    status,
    receivedBy: payload.receivedBy || building?.managerName || 'Manager',
    notes: payload.notes || null,
    createdAt: new Date().toISOString(),
    idempotencyKey: idempotencyKey || null,
  };

  const db = getFirestoreDb();
  if (db) {
    await db.collection(COLLECTIONS.PAYMENTS).doc(payment.id).set({ ...payment, ownerId });
  } else {
    const filePath = getPaymentsFilePath(ownerId, payload.billingMonth);
    const fileRecords = await readJson<RentPayment[]>(filePath, []);
    fileRecords.push(payment);
    await writeJson(filePath, fileRecords);
  }

  if (idempotencyKey) {
    await saveIdempotency(ownerId, idempotencyKey, payment);
  }

  return { success: true, payment };
}

export async function calculateTenantDues(
  ownerId: string,
  tenantId: string,
  billingMonth: string
): Promise<{
  tenantId: string;
  billingMonth: string;
  monthlyRent: number;
  electricityShare: number;
  electricityUnits: number;
  electricityRecordId: string | null;
  alreadyPaid: number;
  totalPayable: number;
  balanceDue: number;
  dueDate: string;
  isOverdue: boolean;
  daysOverdue: number;
} | null> {
  const tenant = await getTenant(ownerId, tenantId);
  if (!tenant) return null;

  const building = await getBuilding(ownerId, tenant.buildingId);
  const dueDay = building?.billingDueDay || 5;

  const [yearStr, monthStr] = billingMonth.split('-');
  const year = parseInt(yearStr, 10);
  const m = parseInt(monthStr, 10);
  const lastDayOfMonth = new Date(Date.UTC(year, m, 0)).getUTCDate();
  const clampedDueDay = Math.min(dueDay, lastDayOfMonth);
  const dueDate = `${billingMonth}-${String(clampedDueDay).padStart(2, '0')}`;

  // Find electricity share
  const elecRecord = await getElectricityForRoomAndMonth(
    ownerId,
    tenant.roomId,
    billingMonth
  );

  let electricityShare = 0;
  let electricityUnits = 0;
  let electricityRecordId: string | null = null;

  if (elecRecord && elecRecord.billedTenantIds.includes(tenant.id)) {
    electricityShare = elecRecord.amountPerTenant;
    electricityUnits = Math.round(elecRecord.unitsConsumed / elecRecord.splitCount);
    electricityRecordId = elecRecord.id;
  }

  // Find already paid
  const monthPayments = await listPayments(ownerId, {
    tenantId,
    billingMonth,
  });
  const alreadyPaid = monthPayments.reduce((sum, p) => sum + p.amountPaid, 0);

  const monthlyRent = tenant.monthlyRent;
  const totalPayable = monthlyRent + electricityShare;
  const balanceDue = Math.max(0, totalPayable - alreadyPaid);

  const todayStr = new Date().toISOString().split('T')[0];
  const today = new Date(todayStr).getTime();
  const dueTime = new Date(dueDate).getTime();
  const isOverdue = today > dueTime && balanceDue > 0;
  const daysOverdue = isOverdue
    ? Math.floor((today - dueTime) / (1000 * 60 * 60 * 24))
    : 0;

  return {
    tenantId: tenant.id,
    billingMonth,
    monthlyRent,
    electricityShare,
    electricityUnits,
    electricityRecordId,
    alreadyPaid,
    totalPayable,
    balanceDue,
    dueDate,
    isOverdue,
    daysOverdue,
  };
}

export async function deletePaymentsForBuilding(
  ownerId: string,
  buildingId: string
): Promise<void> {
  const db = getFirestoreDb();
  if (db) {
    const snapshot = await db
      .collection(COLLECTIONS.PAYMENTS)
      .where('ownerId', '==', ownerId)
      .where('buildingId', '==', buildingId)
      .get();
    const batch = db.batch();
    snapshot.docs.forEach((doc: any) => batch.delete(doc.ref));
    await batch.commit();
    return;
  }

  const dir = getPaymentsDir(ownerId);
  const fs = await import('fs/promises');
  const path = await import('path');
  try {
    const entries = await fs.readdir(dir);
    for (const name of entries) {
      if (name.endsWith('.json')) {
        const p = path.join(dir, name);
        const payments = await readJson<RentPayment[]>(p, []);
        const filtered = payments.filter((item) => item.buildingId !== buildingId);
        await writeJson(p, filtered);
      }
    }
  } catch {}
}
