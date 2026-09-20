import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/utils/envelope';
import { authenticateRequest } from '@/lib/auth/authGuard';
import { getOverdueItems } from '@/lib/db/repositories/dashboardRepo';

export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.success) return auth.response;

  try {
    const { searchParams } = new URL(req.url);
    const buildingId = searchParams.get('buildingId');
    const month = searchParams.get('month');

    const data = await getOverdueItems(
      auth.context.ownerId,
      buildingId && buildingId !== 'all' ? buildingId : null,
      month
    );

    return successResponse(data);
  } catch (err) {
    console.error('Get overdue error:', err);
    return errorResponse('INTERNAL', 'Failed to retrieve overdue data.', undefined, 500);
  }
}
