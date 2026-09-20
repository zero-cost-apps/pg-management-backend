import fs from 'fs/promises';
import path from 'path';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');

// Simple in-process lock to serialize writes to the same file path
const fileLocks = new Map<string, Promise<void>>();

async function acquireLock(filePath: string): Promise<() => void> {
  while (fileLocks.has(filePath)) {
    await fileLocks.get(filePath);
  }
  let resolveLock: () => void;
  const lockPromise = new Promise<void>((resolve) => {
    resolveLock = resolve;
  });
  fileLocks.set(filePath, lockPromise);
  return () => {
    fileLocks.delete(filePath);
    resolveLock!();
  };
}

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function readJson<T>(filePath: string, defaultValue: T): Promise<T> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    if (!content || !content.trim()) {
      return defaultValue;
    }
    return JSON.parse(content) as T;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return defaultValue;
    }
    if (err instanceof SyntaxError) {
      console.warn(`[jsonStore] Warning: Malformed or empty JSON in ${filePath}, falling back to default value.`);
      return defaultValue;
    }
    throw err;
  }
}

export async function writeJson<T>(filePath: string, data: T): Promise<void> {
  const release = await acquireLock(filePath);
  try {
    await ensureDir(path.dirname(filePath));
    const tempPath = `${filePath}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
    const jsonStr = JSON.stringify(data, null, 2);
    await fs.writeFile(tempPath, jsonStr, 'utf-8');
    await fs.rename(tempPath, filePath);
  } finally {
    release();
  }
}

export async function deleteFile(filePath: string): Promise<boolean> {
  const release = await acquireLock(filePath);
  try {
    await fs.unlink(filePath);
    return true;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return false;
    }
    throw err;
  } finally {
    release();
  }
}

export async function listJsonFiles<T>(dirPath: string): Promise<T[]> {
  try {
    await ensureDir(dirPath);
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const jsonFiles = entries.filter((e) => e.isFile() && e.name.endsWith('.json'));

    const results: T[] = [];
    for (const file of jsonFiles) {
      const fullPath = path.join(dirPath, file.name);
      try {
        const content = await fs.readFile(fullPath, 'utf-8');
        results.push(JSON.parse(content) as T);
      } catch (err) {
        console.error(`Error reading json file ${fullPath}:`, err);
      }
    }
    return results;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw err;
  }
}

// ---------------- Paths Hierarchy ----------------

export function getGlobalUsersPath(): string {
  return path.join(DATA_DIR, 'global', 'users.json');
}

export function getGlobalSessionsPath(): string {
  return path.join(DATA_DIR, 'global', 'sessions.json');
}

export function getGlobalOtpsPath(): string {
  return path.join(DATA_DIR, 'global', 'otps.json');
}

export function getPgDir(ownerId: string): string {
  return path.join(DATA_DIR, 'pgs', ownerId);
}

export function getBuildingsDir(ownerId: string): string {
  return path.join(getPgDir(ownerId), 'buildings');
}

export function getBuildingFilePath(ownerId: string, buildingId: string): string {
  return path.join(getBuildingsDir(ownerId), `${buildingId}.json`);
}

export function getRoomsDir(ownerId: string): string {
  return path.join(getPgDir(ownerId), 'rooms');
}

export function getRoomFilePath(ownerId: string, roomId: string): string {
  return path.join(getRoomsDir(ownerId), `${roomId}.json`);
}

export function getTenantsDir(ownerId: string): string {
  return path.join(getPgDir(ownerId), 'tenants');
}

export function getTenantFilePath(ownerId: string, tenantId: string): string {
  return path.join(getTenantsDir(ownerId), `${tenantId}.json`);
}

export function getCoOccupantsDir(ownerId: string): string {
  return path.join(getPgDir(ownerId), 'co_occupants');
}

export function getCoOccupantFilePath(ownerId: string, id: string): string {
  return path.join(getCoOccupantsDir(ownerId), `${id}.json`);
}

export function getPaymentsDir(ownerId: string): string {
  return path.join(getPgDir(ownerId), 'payments');
}

export function getPaymentsFilePath(ownerId: string, month: string): string {
  // e.g. "2026-09.json" containing array of payments for that month
  return path.join(getPaymentsDir(ownerId), `${month}.json`);
}

export function getElectricityDir(ownerId: string): string {
  return path.join(getPgDir(ownerId), 'electricity');
}

export function getElectricityFilePath(ownerId: string, month: string): string {
  // e.g. "2026-09.json" containing array of electricity records for that month
  return path.join(getElectricityDir(ownerId), `${month}.json`);
}

export function getUploadsDir(ownerId: string): string {
  return path.join(getPgDir(ownerId), 'uploads');
}

export function getIdempotencyFilePath(ownerId: string): string {
  return path.join(getPgDir(ownerId), 'idempotency.json');
}
