import { NextRequest, NextResponse } from 'next/server';
import { successResponse, errorResponse } from '@/lib/utils/envelope';
import { authenticateRequest } from '@/lib/auth/authGuard';
import { getCoOccupant } from '@/lib/db/repositories/coOccupantRepo';
import { saveCoOccupantAadhaar, getDocumentFile } from '@/lib/db/repositories/documentRepo';
import fs from 'fs/promises';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(req);
  if (!auth.success) return auth.response;

  try {
    const { id } = await context.params;
    const co = await getCoOccupant(auth.context.ownerId, id);
    if (!co) {
      return errorResponse('NOT_FOUND', 'Co-occupant not found.', undefined, 404);
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return errorResponse('VALIDATION_ERROR', 'file part is required.', { file: 'required' }, 400);
    }

    if (file.size > 10 * 1024 * 1024) {
      return errorResponse('PAYLOAD_TOO_LARGE', 'File exceeds 10MB limit.', undefined, 413);
    }

    const result = await saveCoOccupantAadhaar(auth.context.ownerId, id, file);
    if (!result.success) {
      return errorResponse('INTERNAL', result.error || 'Failed to upload Aadhaar.', undefined, 500);
    }

    return successResponse({ coOccupant: result.coOccupant });
  } catch (err) {
    console.error('Co-occupant Aadhaar upload error:', err);
    return errorResponse('INTERNAL', 'Failed to upload Aadhaar.', undefined, 500);
  }
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(req);
  if (!auth.success) return auth.response;

  try {
    const { id } = await context.params;
    const co = await getCoOccupant(auth.context.ownerId, id);
    if (!co || !co.storagePath) {
      return errorResponse('NOT_FOUND', 'Aadhaar document not found.', undefined, 404);
    }

    const fileInfo = await getDocumentFile(auth.context.ownerId, co.storagePath);
    if (!fileInfo) {
      return errorResponse('NOT_FOUND', 'Aadhaar document file not found.', undefined, 404);
    }

    const buffer = await fs.readFile(fileInfo.filePath);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': fileInfo.contentType,
        'Content-Disposition': `inline; filename="${fileInfo.fileName}"`,
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch (err) {
    console.error('Download Aadhaar error:', err);
    return errorResponse('INTERNAL', 'Failed to retrieve Aadhaar file.', undefined, 500);
  }
}
