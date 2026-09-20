import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/utils/envelope';
import { authenticateRequest } from '@/lib/auth/authGuard';
import { getTenant } from '@/lib/db/repositories/tenantRepo';
import { saveTenantDocument } from '@/lib/db/repositories/documentRepo';
import { DocType } from '@/types';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(req);
  if (!auth.success) return auth.response;

  try {
    const { id } = await context.params;
    const tenant = await getTenant(auth.context.ownerId, id);

    if (!tenant) {
      return errorResponse('NOT_FOUND', 'Tenant not found.', undefined, 404);
    }

    return successResponse({ documents: tenant.documents || [] });
  } catch (err) {
    console.error('Get tenant documents error:', err);
    return errorResponse('INTERNAL', 'Failed to get documents.', undefined, 500);
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(req);
  if (!auth.success) return auth.response;

  try {
    const { id } = await context.params;
    const tenant = await getTenant(auth.context.ownerId, id);
    if (!tenant) {
      return errorResponse('NOT_FOUND', 'Tenant not found.', undefined, 404);
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const type = formData.get('type') as DocType | null;
    const title = formData.get('title') as string | null;
    const documentNumber = (formData.get('documentNumber') as string | null) || undefined;
    const notes = (formData.get('notes') as string | null) || undefined;

    if (!file) {
      return errorResponse('VALIDATION_ERROR', 'file part is required.', { file: 'required' }, 400);
    }

    // Max 10 MB
    if (file.size > 10 * 1024 * 1024) {
      return errorResponse('PAYLOAD_TOO_LARGE', 'File exceeds 10MB limit.', undefined, 413);
    }

    if (!type || !title) {
      return errorResponse('VALIDATION_ERROR', 'type and title are required.', undefined, 400);
    }

    const result = await saveTenantDocument(auth.context.ownerId, id, file, {
      type,
      title,
      documentNumber,
      notes,
    });

    if (!result.success) {
      return errorResponse('INTERNAL', result.error || 'Failed to save document.', undefined, 500);
    }

    return successResponse({ document: result.document }, undefined, 201);
  } catch (err) {
    console.error('Upload document error:', err);
    return errorResponse('INTERNAL', 'Failed to upload document.', undefined, 500);
  }
}
