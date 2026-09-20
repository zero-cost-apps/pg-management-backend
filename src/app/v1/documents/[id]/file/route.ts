import { NextRequest, NextResponse } from 'next/server';
import { errorResponse } from '@/lib/utils/envelope';
import { authenticateRequest } from '@/lib/auth/authGuard';
import { getDocumentFile } from '@/lib/db/repositories/documentRepo';
import fs from 'fs/promises';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(req);
  if (!auth.success) return auth.response;

  try {
    const { id } = await context.params;
    const fileInfo = await getDocumentFile(auth.context.ownerId, id);

    if (!fileInfo) {
      return errorResponse('NOT_FOUND', 'Document file not found.', undefined, 404);
    }

    const buffer =
      fileInfo.fileBuffer ||
      (fileInfo.filePath ? await fs.readFile(fileInfo.filePath) : null);

    if (!buffer) {
      return errorResponse('NOT_FOUND', 'Document file not found.', undefined, 404);
    }

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': fileInfo.contentType,
        'Content-Disposition': `inline; filename="${fileInfo.fileName}"`,
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch (err) {
    console.error('Download document error:', err);
    return errorResponse('INTERNAL', 'Failed to retrieve document file.', undefined, 500);
  }
}
