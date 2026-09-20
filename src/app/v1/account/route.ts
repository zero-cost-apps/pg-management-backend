import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/utils/envelope';
import { authenticateRequest } from '@/lib/auth/authGuard';
import { findUserByPhone, updateUser } from '@/lib/db/repositories/userRepo';

export async function PATCH(req: NextRequest) {
  const auth = await authenticateRequest(req, { requireOnboarded: false });
  if (!auth.success) return auth.response;

  try {
    const body = await req.json();
    const { fullName, phone, businessName, gstNumber, businessAddress } = body;

    const updates: Record<string, any> = {};

    if (fullName !== undefined) {
      if (typeof fullName !== 'string' || fullName.trim().length < 2) {
        return errorResponse('VALIDATION_ERROR', 'fullName must be at least 2 characters.', undefined, 400);
      }
      updates.fullName = fullName.trim();
    }

    if (phone !== undefined) {
      const cleanPhone = phone.replace(/\D/g, '').slice(-10);
      if (cleanPhone.length !== 10) {
        return errorResponse('VALIDATION_ERROR', 'phone must be a 10-digit Indian mobile number.', undefined, 400);
      }
      const existing = await findUserByPhone(cleanPhone);
      if (existing && existing.id !== auth.context.user.id) {
        return errorResponse('CONFLICT', 'Phone number is already in use by another account.', undefined, 409);
      }
      updates.phone = cleanPhone;
    }

    if (businessName !== undefined) {
      updates.businessName = typeof businessName === 'string' ? businessName.trim() : null;
    }
    if (gstNumber !== undefined) {
      updates.gstNumber = typeof gstNumber === 'string' ? gstNumber.trim() : null;
    }
    if (businessAddress !== undefined) {
      updates.businessAddress = typeof businessAddress === 'string' ? businessAddress.trim() : null;
    }

    if (Object.keys(updates).length === 0) {
      return errorResponse('VALIDATION_ERROR', 'At least one field is required to update.', undefined, 400);
    }

    const updatedUser = await updateUser(auth.context.user.id, updates);
    return successResponse({ user: updatedUser });
  } catch (err) {
    console.error('Account update error:', err);
    return errorResponse('INTERNAL', 'An unexpected error occurred.', undefined, 500);
  }
}
