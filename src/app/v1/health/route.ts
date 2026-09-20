import { successResponse } from '@/lib/utils/envelope';

export async function GET() {
  return successResponse({
    status: 'ok',
    version: '1.0.0',
    time: new Date().toISOString(),
  });
}
