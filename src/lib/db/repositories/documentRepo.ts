import { TenantDocument, DocType } from '@/types';
import { getUploadsDir, ensureDir } from '../jsonStore';
import { getTenant, updateTenant } from './tenantRepo';
import { getCoOccupant, updateCoOccupant } from './coOccupantRepo';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getFirestoreDb, COLLECTIONS } from '../firebase';

export async function saveTenantDocument(
  ownerId: string,
  tenantId: string,
  file: File,
  meta: {
    type: DocType;
    title: string;
    documentNumber?: string;
    notes?: string;
  }
): Promise<{ success: boolean; document?: TenantDocument; error?: string }> {
  const tenant = await getTenant(ownerId, tenantId);
  if (!tenant) {
    return { success: false, error: 'Tenant not found.' };
  }

  const docId = uuidv4();
  const originalName = file.name || 'document';
  const ext = path.extname(originalName) || '.pdf';
  const storageName = `${docId}${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const today = new Date().toISOString().split('T')[0];

  const db = getFirestoreDb();
  if (db) {
    // Store binary file as base64 in Firestore documents collection
    await db.collection(COLLECTIONS.DOCUMENTS).doc(docId).set({
      id: docId,
      ownerId,
      tenantId,
      storageName,
      fileName: originalName,
      contentType: file.type || 'application/octet-stream',
      sizeBytes: buffer.length,
      base64: buffer.toString('base64'),
      createdAt: new Date().toISOString(),
    });
  } else {
    const uploadsDir = getUploadsDir(ownerId);
    await ensureDir(uploadsDir);
    const diskPath = path.join(/*turbopackIgnore: true*/ uploadsDir, storageName);
    await fs.writeFile(diskPath, buffer);
  }

  const newDoc: TenantDocument = {
    id: docId,
    tenantId,
    type: meta.type,
    title: meta.title,
    documentNumber: meta.documentNumber || null,
    fileName: originalName,
    contentType: file.type || 'application/octet-stream',
    sizeBytes: buffer.length,
    uploadDate: today,
    status: 'pending',
    notes: meta.notes || null,
    storagePath: storageName,
  };

  const existingDocs = tenant.documents || [];
  existingDocs.push(newDoc);
  await updateTenant(ownerId, tenantId, { documents: existingDocs });

  return { success: true, document: newDoc };
}

export async function saveCoOccupantAadhaar(
  ownerId: string,
  coOccupantId: string,
  file: File
): Promise<{ success: boolean; coOccupant?: any; error?: string }> {
  const co = await getCoOccupant(ownerId, coOccupantId);
  if (!co) {
    return { success: false, error: 'Co-occupant not found.' };
  }

  const docId = uuidv4();
  const originalName = file.name || 'aadhaar.pdf';
  const ext = path.extname(originalName) || '.pdf';
  const storageName = `${docId}${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const db = getFirestoreDb();
  if (db) {
    await db.collection(COLLECTIONS.DOCUMENTS).doc(docId).set({
      id: docId,
      ownerId,
      coOccupantId,
      storageName,
      fileName: originalName,
      contentType: file.type || 'application/octet-stream',
      sizeBytes: buffer.length,
      base64: buffer.toString('base64'),
      createdAt: new Date().toISOString(),
    });
  } else {
    const uploadsDir = getUploadsDir(ownerId);
    await ensureDir(uploadsDir);
    const diskPath = path.join(/*turbopackIgnore: true*/ uploadsDir, storageName);
    await fs.writeFile(diskPath, buffer);
  }

  const updated = await updateCoOccupant(ownerId, coOccupantId, {
    aadharDocName: originalName,
    hasAadhaarFile: true,
    storagePath: storageName,
  });

  return { success: true, coOccupant: updated };
}

export async function getDocumentFile(
  ownerId: string,
  docIdOrStoragePath: string
): Promise<{ filePath?: string; fileBuffer?: Buffer; fileName: string; contentType: string } | null> {
  const db = getFirestoreDb();
  if (db) {
    const docId = docIdOrStoragePath.split('.')[0]!;
    const doc = await db.collection(COLLECTIONS.DOCUMENTS).doc(docId).get();
    if (doc.exists) {
      const data = doc.data() as any;
      if (data.ownerId === ownerId && data.base64) {
        return {
          fileBuffer: Buffer.from(data.base64, 'base64'),
          fileName: data.fileName || 'document',
          contentType: data.contentType || 'application/octet-stream',
        };
      }
    }
  }

  const uploadsDir = getUploadsDir(ownerId);
  try {
    await ensureDir(uploadsDir);
    const files = await fs.readdir(uploadsDir);
    const match = files.find(
      (f) => f === docIdOrStoragePath || f.startsWith(`${docIdOrStoragePath}.`)
    );
    if (!match) return null;

    const fullPath = path.join(uploadsDir, match);
    const ext = path.extname(match).toLowerCase();
    let contentType = 'application/octet-stream';
    if (ext === '.pdf') contentType = 'application/pdf';
    else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
    else if (ext === '.png') contentType = 'image/png';

    return { filePath: fullPath, fileName: match, contentType };
  } catch {
    return null;
  }
}
