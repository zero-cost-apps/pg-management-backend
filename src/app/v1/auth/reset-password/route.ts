import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/utils/envelope';
import {
  findUserByEmailOrPhone,
  findValidOtp,
  consumeOtp,
  updateUser,
  revokeAllUserSessions,
} from '@/lib/db/repositories/userRepo';
import { hashOtp, hashPassword } from '@/lib/auth/jwt';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { emailOrPhone, otp, newPassword } = body;

    if (!emailOrPhone || !otp || !newPassword) {
      return errorResponse(
        'VALIDATION_ERROR',
        'emailOrPhone, otp, and newPassword are required.',
        undefined,
        400
      );
    }

    if (typeof newPassword !== 'string' || newPassword.length < 6) {
      return errorResponse(
        'VALIDATION_ERROR',
        'Password must be at least 6 characters.',
        { newPassword: 'min 6 characters' },
        400
      );
    }

    const user = await findUserByEmailOrPhone(emailOrPhone);
    if (!user) {
      return errorResponse('VALIDATION_ERROR', 'Invalid or expired OTP.', undefined, 400);
    }

    const otpHash = hashOtp(otp.trim());
    const validOtp = await findValidOtp(user.id, otpHash);
    if (!validOtp) {
      return errorResponse('VALIDATION_ERROR', 'Invalid or expired OTP.', undefined, 400);
    }

    await consumeOtp(validOtp.id);

    // Update password
    const passwordHash = await hashPassword(newPassword);
    await updateUser(user.id, { passwordHash });

    // Invalidate all active sessions
    await revokeAllUserSessions(user.id);

    return successResponse({ reset: true });
  } catch (err) {
    console.error('Reset password error:', err);
    return errorResponse('INTERNAL', 'An unexpected error occurred.', undefined, 500);
  }
}
