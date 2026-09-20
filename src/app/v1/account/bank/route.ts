import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/utils/envelope';
import { authenticateRequest } from '@/lib/auth/authGuard';
import { updateUser } from '@/lib/db/repositories/userRepo';

export async function PATCH(req: NextRequest) {
  const auth = await authenticateRequest(req, { requireOnboarded: false });
  if (!auth.success) return auth.response;

  try {
    const body = await req.json();
    const { upiId, bankName, accountNumber, ifscCode, accountHolderName } = body;

    const fields: Record<string, string> = {};

    if (!upiId || typeof upiId !== 'string' || !upiId.includes('@') || upiId.length < 3 || upiId.length > 80) {
      fields.upiId = 'Valid UPI ID containing @ is required.';
    }

    if (ifscCode) {
      const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;
      if (!ifscRegex.test(ifscCode.trim().toUpperCase())) {
        fields.ifscCode = 'Invalid IFSC code format (e.g. HDFC0001824).';
      }
    }

    if (accountNumber) {
      const digits = accountNumber.replace(/\D/g, '');
      if (digits.length < 9 || digits.length > 18) {
        fields.accountNumber = 'Account number must be 9-18 digits.';
      }
    }

    if (Object.keys(fields).length > 0) {
      return errorResponse('VALIDATION_ERROR', 'Validation failed.', fields, 400);
    }

    const bankDetails = {
      upiId: upiId.trim(),
      bankName: bankName ? bankName.trim() : null,
      accountNumber: accountNumber ? accountNumber.trim() : null,
      ifscCode: ifscCode ? ifscCode.trim().toUpperCase() : null,
      accountHolderName: accountHolderName ? accountHolderName.trim() : null,
    };

    const updatedUser = await updateUser(auth.context.user.id, { bankDetails });
    return successResponse({ user: updatedUser });
  } catch (err) {
    console.error('Account bank update error:', err);
    return errorResponse('INTERNAL', 'An unexpected error occurred.', undefined, 500);
  }
}
