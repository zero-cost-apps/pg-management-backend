import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/utils/envelope';
import { findUserByEmailOrPhone, createPasswordOtp } from '@/lib/db/repositories/userRepo';
import { generateOtp, hashOtp } from '@/lib/auth/jwt';
import { v4 as uuidv4 } from 'uuid';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { emailOrPhone } = body;

    if (!emailOrPhone || typeof emailOrPhone !== 'string') {
      return errorResponse('VALIDATION_ERROR', 'emailOrPhone is required.', undefined, 400);
    }

    const user = await findUserByEmailOrPhone(emailOrPhone);
    if (user) {
      const rawOtp = generateOtp();
      const otpHash = hashOtp(rawOtp);
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

      await createPasswordOtp({
        id: uuidv4(),
        userId: user.id,
        identifier: emailOrPhone.trim(),
        otpHash,
        createdAt: new Date().toISOString(),
        expiresAt,
        consumedAt: null,
      });

      // In dev / test environment, log OTP for verification
      console.log(`[AUTH] Password reset OTP for ${emailOrPhone}: ${rawOtp}`);
    }

    // Always return 200 sent: true
    return successResponse({ sent: true });
  } catch (err) {
    console.error('Forgot password error:', err);
    return errorResponse('INTERNAL', 'An unexpected error occurred.', undefined, 500);
  }
}
