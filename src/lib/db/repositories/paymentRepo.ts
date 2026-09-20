import { RentPayment, PaymentMode, PaymentStatus } from '@/types';
import { getTenant } from './tenantRepo';
import { getBuilding } from './buildingRepo';
import { getRoom } from './roomRepo';
import { getElectricityForRoomAndMonth } from './electricityRepo';
import { v4 as uuidv4 } from 'uuid';
import { getFirestoreDb, COLLECTIONS } from '../firebase';

export async function listAllPayments(ownerId: string): Promise<RentPayment[]> {
  const db = getFirestoreDb();
  const snapshot = await db
    .collection(COLLECTIONS.PAYMENTS)
    .where('ownerId', '==', ownerId)
    .get();
  return snapshot.docs.map((d: any) => d.data() as RentPayment);
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
  const db = getFirestoreDb();
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
  const payments: RentPayment[] = snapshot.docs.map((d: any) => d.data() as RentPayment);

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
  const doc = await db.collection(COLLECTIONS.PAYMENTS).doc(paymentId).get();
  if (!doc.exists) return null;
  const data = doc.data() as RentPayment & { ownerId?: string };
  if (data.ownerId && data.ownerId !== ownerId) return null;
  return data;
}

export async function checkIdempotency(
  ownerId: string,
  key: string
): Promise<any | null> {
  const db = getFirestoreDb();
  const doc = await db
    .collection(COLLECTIONS.IDEMPOTENCY)
    .doc(`${ownerId}_${key}`)
    .get();
  if (!doc.exists) return null;
  return doc.data()?.data || null;
}

export async function saveIdempotency(
  ownerId: string,
  key: string,
  data: any
): Promise<void> {
  const db = getFirestoreDb();
  await db
    .collection(COLLECTIONS.IDEMPOTENCY)
    .doc(`${ownerId}_${key}`)
    .set({
      ownerId,
      key,
      data,
      createdAt: new Date().toISOString(),
    });
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
    buildingId: tenant.buildingId,
    buildingName: building?.name || 'Building',
    roomId: tenant.roomId,
    roomNumber: room?.roomNumber || 'Room',
    tenantId: tenant.id,
    tenantName: tenant.fullName,
    billingMonth: payload.billingMonth,
    billingPeriodStart,
    billingPeriodEnd,
    rentAmount,
    electricityAmount,
    electricityUnits: electricityUnits ?? undefined,
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
  await db.collection(COLLECTIONS.PAYMENTS).doc(payment.id).set({ ...payment, ownerId });

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

  const alreadyPaid = monthPayments.reduce((acc, p) => acc + p.amountPaid, 0);
  const totalPayable = tenant.monthlyRent + electricityShare;
  const balanceDue = Math.max(0, totalPayable - alreadyPaid);

  const todayStr = new Date().toISOString().split('T')[0];
  const isOverdue = balanceDue > 0 && todayStr > dueDate;
  let daysOverdue = 0;
  if (isOverdue) {
    const dueTime = new Date(dueDate).getTime();
    const nowTime = new Date(todayStr).getTime();
    daysOverdue = Math.max(0, Math.floor((nowTime - dueTime) / (1000 * 60 * 60 * 24)));
  }

  return {
    tenantId,
    billingMonth,
    monthlyRent: tenant.monthlyRent,
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
  const snapshot = await db
    .collection(COLLECTIONS.PAYMENTS)
    .where('ownerId', '==', ownerId)
    .where('buildingId', '==', buildingId)
    .get();
  const batch = db.batch();
  snapshot.docs.forEach((doc: any) => batch.delete(doc.ref));
  await batch.commit();
}
