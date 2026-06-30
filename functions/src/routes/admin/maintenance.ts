import { Router, Response } from 'express';
import { requireAuth } from '../../middleware/requireAuth';
import { db } from '../../config/firebase';
import { logAudit } from '../../services/audit.service';

export const adminMaintenanceRouter = Router();

// GET /admin/maintenance/rooms-report — SOLO LECTURA: diagnostico de bauleras (no modifica nada)
adminMaintenanceRouter.get('/rooms-report', requireAuth, async (_req, res: Response) => {
  try {
    const snap = await db.collection('storageRooms').get();
    let withPrefix = 0;    // esquema nuevo: id con '__' (ej. nordelta__A0-001) — lo mantiene el Sync
    let withoutPrefix = 0; // esquema viejo: id sin '__' (ej. A0001) — duplicado a limpiar
    const byBranch: Record<string, number> = {};
    const sampleNew: string[] = [];
    const sampleOld: string[] = [];
    snap.docs.forEach((d) => {
      const id = d.id;
      const branchId = String((d.data() as any).branchId || '(sin branchId)');
      byBranch[branchId] = (byBranch[branchId] || 0) + 1;
      if (id.includes('__')) { withPrefix++; if (sampleNew.length < 6) sampleNew.push(id); }
      else { withoutPrefix++; if (sampleOld.length < 6) sampleOld.push(id); }
    });
    const bsnap = await db.collection('buildings').get();
    const buildings = bsnap.docs.map((d) => ({ id: d.id, name: (d.data() as any).name, branchId: (d.data() as any).branchId }));
    res.json({
      total: snap.size,
      esquemaNuevo_conPrefijo: withPrefix,
      esquemaViejo_sinPrefijo: withoutPrefix,
      porBranchId: byBranch,
      ejemploNuevo: sampleNew,
      ejemploViejo: sampleOld,
      edificios: buildings,
    });
  } catch (err) {
    console.error('GET /admin/maintenance/rooms-report error:', err);
    res.status(500).json({ error: String(err) });
  }
});

// POST /admin/maintenance/rooms-cleanup { confirm:true }
// Borra SOLO bauleras del esquema viejo (id sin '__'). NO toca clientes ni contratos.
// Antes de borrar, copia cada una a 'storageRooms_backup' (100% reversible).
adminMaintenanceRouter.post('/rooms-cleanup', requireAuth, async (req, res: Response) => {
  try {
    if (req.body?.confirm !== true) { res.status(400).json({ error: 'Falta confirm:true' }); return; }
    const snap = await db.collection('storageRooms').get();
    const toDelete = snap.docs.filter((d) => !d.id.includes('__'));
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const CHUNK = 200;

    // 1) Backup primero
    let backed = 0;
    for (let i = 0; i < toDelete.length; i += CHUNK) {
      const batch = db.batch();
      toDelete.slice(i, i + CHUNK).forEach((d) => {
        batch.set(db.collection('storageRooms_backup').doc(`${stamp}__${d.id}`), {
          ...(d.data() as any), _backupOf: d.id, _backupAt: stamp,
        });
        backed++;
      });
      await batch.commit();
    }
    // 2) Borrar
    let deleted = 0;
    for (let i = 0; i < toDelete.length; i += CHUNK) {
      const batch = db.batch();
      toDelete.slice(i, i + CHUNK).forEach((d) => { batch.delete(d.ref); deleted++; });
      await batch.commit();
    }
    await logAudit({
      actor: (req as any).email || (req as any).uid || 'admin',
      via: 'admin',
      action: 'limpieza_bauleras_duplicadas',
      entity: 'storageRooms',
      detail: { respaldadas: backed, borradas: deleted, backupStamp: stamp, criterio: 'id sin __ (esquema viejo)' },
    });
    res.json({ backed, deleted, restantes: snap.size - deleted, backupStamp: stamp });
  } catch (err) {
    console.error('POST /admin/maintenance/rooms-cleanup error:', err);
    res.status(500).json({ error: String(err) });
  }
});

// POST /admin/maintenance/rename-building { id, name } — renombrar un edificio (cosmetico)
adminMaintenanceRouter.post('/rename-building', requireAuth, async (req, res: Response) => {
  try {
    const id = req.body?.id as string;
    const name = req.body?.name as string;
    if (!id || !name) { res.status(400).json({ error: 'Falta id o name' }); return; }
    await db.collection('buildings').doc(id).set({ name, updatedAt: new Date().toISOString() }, { merge: true });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});
