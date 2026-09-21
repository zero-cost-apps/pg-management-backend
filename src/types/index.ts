export type UserRole = 'owner';
export type RoomStatus = 'vacant' | 'occupied' | 'maintenance';
export type TenantStatus = 'active' | 'notice_period' | 'vacated';
export type DepositStatus = 'paid' | 'partial' | 'pending' | 'refunded';
export type Gender = 'male' | 'female' | 'other';
export type RelationshipType = 
  | 'Spouse' 
  | 'Brother' 
  | 'Sister' 
  | 'Friend' 
  | 'Colleague' 
  | 'Parent' 
  | 'Child' 
  | 'Relative' 
  | 'Roommate' 
  | 'Other';

export type DocType = 'aadhaar' | 'pan' | 'passport' | 'student_id' | 'employment_letter' | 'police_verification';
export type DocVerificationStatus = 'verified' | 'pending' | 'rejected';
export type PaymentMode = 'upi' | 'cash' | 'bank_transfer' | 'cheque' | 'card';
export type PaymentStatus = 'paid' | 'partial' | 'pending';
export type ElectricityBillingCycle = 'monthly' | 'bi-monthly';
export type BusinessType = 'mens_pg' | 'womens_pg' | 'coliving' | 'hostel';

export interface BankDetails {
  accountNumber?: string | null;
  ifscCode?: string | null;
  accountHolderName?: string | null;
  bankName?: string | null;
  upiId?: string | null;
}

export interface User {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  role: UserRole;
  businessName?: string | null;
  avatarUrl?: string | null;
  isOnboarded: boolean;
  createdAt: string;
  gstNumber?: string | null;
  businessAddress?: string | null;
  bankDetails?: BankDetails;
}

export interface StoredUser extends User {
  passwordHash: string;
}

export interface Session {
  id: string;
  userId: string;
  refreshTokenHash: string;
  createdAt: string;
  expiresAt: string;
  revokedAt?: string | null;
}

export interface PasswordOtp {
  id: string;
  userId: string;
  identifier: string; // email or phone
  otpHash: string;
  createdAt: string;
  expiresAt: string;
  consumedAt?: string | null;
}

export interface RoomTypeConfig {
  id: string;
  name: string;
  capacity: number;
  baseRent: number;
  description?: string;
}

export interface BuildingStats {
  totalRooms: number;
  occupiedRooms: number;
  vacantRooms: number;
  maintenanceRooms: number;
}

export interface FloorConfig {
  floor: number; // 0 for Ground Floor, 1 for 1st Floor, etc.
  roomCount: number;
  name?: string;
}

export interface Building {
  id: string;
  ownerId: string;
  name: string;
  code: string;
  address: string;
  city: string;
  totalFloors: number;
  floorConfigs?: FloorConfig[];
  electricityRatePerUnit: number;
  billingDueDay: number;
  electricityBillingCycle: ElectricityBillingCycle;
  managerName: string;
  managerPhone: string;
  upiId?: string | null;
  amenities: string[];
  roomTypes: RoomTypeConfig[];
  rulesNotes?: string | null;
  createdAt: string;
  stats?: BuildingStats;
}

export interface Room {
  id: string;
  buildingId: string;
  roomNumber: string;
  floor: number; // 0 for Ground Floor, 1 for 1st Floor, etc.
  roomTypeId: string;
  capacity: number;
  baseRent: number;
  status: RoomStatus;
  primaryTenantId?: string | null;
  maintenanceReason?: string | null;
  hasAttachedBathroom: boolean;
  hasAirConditioner: boolean;
  hasBalcony: boolean;
  meterNumber?: string | null;
  lastMeterReading?: number;
  lastMeterReadingDate?: string | null;
  occupantCount?: number;
  ownerId?: string;
}

export interface TenantDocument {
  id: string;
  tenantId: string;
  type: DocType;
  title: string;
  documentNumber?: string | null;
  fileName?: string | null;
  contentType?: string | null;
  sizeBytes?: number;
  uploadDate: string;
  status: DocVerificationStatus;
  notes?: string | null;
  storagePath?: string;
}

export interface Tenant {
  id: string;
  buildingId: string;
  roomId: string;
  fullName: string;
  phone: string;
  email: string;
  avatarUrl?: string | null;
  gender: Gender;
  dateOfBirth?: string | null;
  occupation: string;
  workOrCollegeName?: string | null;
  permanentAddress: string;
  emergencyContactName: string;
  emergencyContactRelation: string;
  emergencyContactPhone: string;
  checkInDate: string;
  expectedCheckOutDate?: string | null;
  noticeGivenDate?: string | null;
  status: TenantStatus;
  monthlyRent: number;
  securityDeposit: number;
  depositStatus: DepositStatus;
  depositPaidAmount: number;
  notes?: string | null;
  documents: TenantDocument[];
}

export interface CoOccupant {
  id: string;
  roomId: string;
  tenantId: string;
  fullName: string;
  relationship: RelationshipType | string;
  phone: string;
  gender: Gender;
  age?: number | null;
  occupation?: string | null;
  checkInDate: string;
  aadharNumber?: string | null;
  aadharDocName?: string | null;
  aadharDocUrl?: string | null;
  hasAadhaarFile?: boolean;
  notes?: string | null;
  createdAt: string;
  storagePath?: string;
}

export interface RentPayment {
  id: string;
  receiptNumber: string;
  tenantId: string;
  tenantName: string;
  buildingId: string;
  buildingName: string;
  roomId: string;
  roomNumber: string;
  billingMonth: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  rentAmount: number;
  electricityAmount: number;
  electricityUnits?: number;
  maintenanceCharges: number;
  otherCharges: number;
  discount: number;
  totalPayable: number;
  amountPaid: number;
  balanceDue: number;
  paymentDate: string;
  paymentMode: PaymentMode;
  transactionReference?: string | null;
  status: PaymentStatus;
  receivedBy: string;
  notes?: string | null;
  createdAt: string;
  idempotencyKey?: string | null;
}

export interface ElectricityRecord {
  id: string;
  buildingId: string;
  roomId: string;
  roomNumber: string;
  month: string;
  readingDate: string;
  previousReading: number;
  currentReading: number;
  unitsConsumed: number;
  ratePerUnit: number;
  totalAmount: number;
  splitCount: number;
  amountPerTenant: number;
  status: 'logged' | 'billed' | 'collected';
  meterPhotoUrl?: string | null;
  hasMeterPhoto?: boolean;
  notes?: string | null;
  billedTenantIds: string[];
  idempotencyKey?: string | null;
}

export interface DashboardStats {
  totalBuildings: number;
  totalRooms: number;
  occupiedRooms: number;
  vacantRooms: number;
  maintenanceRooms: number;
  totalResidents: number;
  totalAllowedCapacity: number;
  occupancyRate: number;
  expectedRevenue: number;
  collectedRevenue: number;
  totalOverdueAmount: number;
  overdueTenantsCount: number;
  electricityCollected: number;
}

export interface OverdueSummaryItem {
  tenantId: string;
  tenant: Partial<Tenant>;
  building: Partial<Building>;
  room: Partial<Room>;
  billingMonth: string;
  dueDate: string;
  daysOverdue: number;
  overdueRent: number;
  overdueElectricity: number;
  totalOverdue: number;
  lastContactedDate?: string | null;
  notes?: string | null;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'TOKEN_EXPIRED'
  | 'FORBIDDEN'
  | 'NOT_ONBOARDED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'PAYLOAD_TOO_LARGE'
  | 'RATE_LIMITED'
  | 'INTERNAL'
  | 'PLAN_LIMIT'
  | 'BUILDING_HAS_OCCUPANTS'
  | 'ROOM_NOT_VACANT'
  | 'ROOM_OCCUPIED'
  | 'ROOM_CAPACITY_EXCEEDED'
  | 'READING_EXISTS';

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: ApiErrorCode;
    message: string;
    fields?: Record<string, string>;
  };
  meta?: {
    requestId?: string;
    pagination?: PaginationMeta;
  };
}
