import fs from 'fs/promises';
import path from 'path';
import admin from 'firebase-admin';

// Load .env or .env.local
async function loadEnv() {
  const envFiles = ['.env.local', '.env'];
  for (const file of envFiles) {
    try {
      const content = await fs.readFile(file, 'utf-8');
      content.split('\n').forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx !== -1) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
          if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      });
    } catch {}
  }
}

async function readJsonSafe(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    if (!raw.trim()) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function main() {
  await loadEnv();

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;
  const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

  if (!serviceAccountKey && (!projectId || !clientEmail || !privateKey)) {
    console.error('❌ Error: Firebase environment variables not found.');
    console.error('Please configure FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY in .env.local or your environment.');
    process.exit(1);
  }

  if (serviceAccountKey) {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(serviceAccountKey)),
    });
  } else {
    privateKey = privateKey.replace(/\\n/g, '\n');
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
  }

  const db = admin.firestore();
  db.settings({ ignoreUndefinedProperties: true });
  console.log(`🚀 Connected to Firebase Project: ${admin.app().options.credential.projectId || projectId}`);

  const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');

  // 1. Users
  const usersPath = path.join(dataDir, 'global', 'users.json');
  const users = (await readJsonSafe(usersPath)) || [];
  console.log(`📦 Migrating ${users.length} users...`);
  for (const user of users) {
    await db.collection('users').doc(user.id).set(user);
  }

  // 2. Sessions
  const sessionsPath = path.join(dataDir, 'global', 'sessions.json');
  const sessions = (await readJsonSafe(sessionsPath)) || [];
  console.log(`📦 Migrating ${sessions.length} sessions...`);
  for (const session of sessions) {
    await db.collection('sessions').doc(session.id).set(session);
  }

  // 3. PGs per owner
  const pgsDir = path.join(dataDir, 'pgs');
  try {
    const ownerDirs = await fs.readdir(pgsDir);
    for (const ownerId of ownerDirs) {
      const ownerPath = path.join(pgsDir, ownerId);
      const stat = await fs.stat(ownerPath);
      if (!stat.isDirectory()) continue;

      console.log(`🏢 Migrating data for Owner: ${ownerId}...`);

      // Buildings
      const buildingsDir = path.join(ownerPath, 'buildings');
      try {
        const bFiles = await fs.readdir(buildingsDir);
        for (const file of bFiles) {
          if (!file.endsWith('.json')) continue;
          const building = await readJsonSafe(path.join(buildingsDir, file));
          if (building?.id) {
            await db.collection('buildings').doc(building.id).set({ ...building, ownerId });
          }
        }
      } catch {}

      // Rooms
      const roomsDir = path.join(ownerPath, 'rooms');
      try {
        const rFiles = await fs.readdir(roomsDir);
        for (const file of rFiles) {
          if (!file.endsWith('.json')) continue;
          const room = await readJsonSafe(path.join(roomsDir, file));
          if (room?.id) {
            await db.collection('rooms').doc(room.id).set({ ...room, ownerId });
          }
        }
      } catch {}

      // Tenants
      const tenantsDir = path.join(ownerPath, 'tenants');
      try {
        const tFiles = await fs.readdir(tenantsDir);
        for (const file of tFiles) {
          if (!file.endsWith('.json')) continue;
          const tenant = await readJsonSafe(path.join(tenantsDir, file));
          if (tenant?.id) {
            await db.collection('tenants').doc(tenant.id).set({ ...tenant, ownerId });
          }
        }
      } catch {}

      // Co-Occupants
      const coDir = path.join(ownerPath, 'co-occupants');
      try {
        const cFiles = await fs.readdir(coDir);
        for (const file of cFiles) {
          if (!file.endsWith('.json')) continue;
          const co = await readJsonSafe(path.join(coDir, file));
          if (co?.id) {
            await db.collection('coOccupants').doc(co.id).set({ ...co, ownerId });
          }
        }
      } catch {}

      // Electricity
      const elecDir = path.join(ownerPath, 'electricity');
      try {
        const eFiles = await fs.readdir(elecDir);
        for (const file of eFiles) {
          if (!file.endsWith('.json')) continue;
          const records = await readJsonSafe(path.join(elecDir, file));
          if (Array.isArray(records)) {
            for (const r of records) {
              await db.collection('electricity').doc(r.id).set({ ...r, ownerId });
            }
          }
        }
      } catch {}

      // Payments
      const payDir = path.join(ownerPath, 'payments');
      try {
        const pFiles = await fs.readdir(payDir);
        for (const file of pFiles) {
          if (!file.endsWith('.json')) continue;
          const payments = await readJsonSafe(path.join(payDir, file));
          if (Array.isArray(payments)) {
            for (const p of payments) {
              await db.collection('payments').doc(p.id).set({ ...p, ownerId });
            }
          }
        }
      } catch {}
    }
  } catch {}

  console.log('✅ Migration to Firebase Firestore completed successfully!');
}

main().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
