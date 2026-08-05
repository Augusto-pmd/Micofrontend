import { Router, Request, Response } from 'express';
import { requireAuth } from '../../middleware/requireAuth';
import { db } from '../../config/firebase';
import { logAudit } from '../../services/audit.service';
import { limpiarPendientesVencidos } from '../../jobs/cleanup';

export const adminMaintenanceRouter = Router();

// POST /admin/maintenance/cleanup-pendings — dispara A MANO la misma limpieza del cron
// (holds de venta vencidos → solicitud cancelada + sub pendiente cancelada en MP; barre
// también las subs 'pending' viejas no referenciadas). Devuelve qué limpió.
adminMaintenanceRouter.post('/cleanup-pendings', requireAuth, async (_req, res: Response) => {
  try {
    const out = await limpiarPendientesVencidos();
    res.json(out);
  } catch (err) {
    console.error('POST /admin/maintenance/cleanup-pendings error:', err);
    res.status(500).json({ error: 'No se pudo correr la limpieza' });
  }
});

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

// ── INQUILINOS HUÉRFANOS EN BAULERAS LIBRES ─────────────────────────────────────────────────
// Barrido de una sola vez por el bug del 05/08: al liberar/dar de baja quedaban punteros del
// inquilino anterior vivos, y la ficha volvía a mostrarlo. El bug ya está arreglado (liberar limpia
// por customerId + bauleraCodigo + storageRoomId, y borra tenantEmail/tenantDni), pero las bauleras
// liberadas ANTES del fix arrastran la basura. Esto la limpia.
//
// Qué se considera huérfano en una baulera DISPONIBLE:
//   - customers con bauleraCodigo o storageRoomId apuntando a ella
//   - la propia baulera con tenantEmail / tenantDni / currentTenant / contractNumber / customerId
// NO toca bauleras ocupadas ni borra ningún cliente: solo despega punteros.

interface HuerfanoRoom { roomId: string; baulera: string; enBaulera: string[]; customers: string[]; }

async function detectarInquilinosHuerfanos(): Promise<HuerfanoRoom[]> {
  const [rooms, customers] = await Promise.all([
    db.collection('storageRooms').get(),
    db.collection('customers').get(),
  ]);
  // Índices de clientes por sus punteros a baulera.
  const custPorCodigo = new Map<string, string[]>();
  const custPorRoom = new Map<string, string[]>();
  customers.forEach((c) => {
    const d = c.data() as Record<string, unknown>;
    const cod = String(d['bauleraCodigo'] || '').trim();
    const rid = String(d['storageRoomId'] || '').trim();
    if (cod) { if (!custPorCodigo.has(cod)) custPorCodigo.set(cod, []); custPorCodigo.get(cod)!.push(c.id); }
    if (rid) { if (!custPorRoom.has(rid)) custPorRoom.set(rid, []); custPorRoom.get(rid)!.push(c.id); }
  });

  const out: HuerfanoRoom[] = [];
  rooms.forEach((r) => {
    const d = r.data() as Record<string, unknown>;
    if (String(d['status'] || '') !== 'available') return; // SOLO bauleras libres
    const code = String(d['space'] || d['name'] || '').trim();
    const enBaulera = ['tenantEmail', 'tenantDni', 'currentTenant', 'contractNumber', 'customerId']
      .filter((k) => d[k] !== undefined && d[k] !== null && String(d[k]).trim() !== '');
    const ids = new Set<string>([...(custPorCodigo.get(code) || []), ...(custPorRoom.get(r.id) || [])]);
    if (enBaulera.length === 0 && ids.size === 0) return;
    out.push({ roomId: r.id, baulera: code || r.id, enBaulera, customers: [...ids] });
  });
  return out.sort((a, b) => a.baulera.localeCompare(b.baulera));
}

// GET /admin/maintenance/inquilinos-huerfanos — REPORTE (no toca nada).
adminMaintenanceRouter.get('/inquilinos-huerfanos', requireAuth, async (_req, res: Response) => {
  try {
    const items = await detectarInquilinosHuerfanos();
    res.json({
      bauleras: items.length,
      customersAfectados: new Set(items.flatMap((i) => i.customers)).size,
      detalle: items.slice(0, 200),
    });
  } catch (err) {
    console.error('GET /admin/maintenance/inquilinos-huerfanos error:', err);
    res.status(500).json({ error: String(err) });
  }
});

// POST /admin/maintenance/inquilinos-huerfanos { confirm:true } — LIMPIA.
// Respalda cada baulera en 'storageRooms_backup' antes de tocarla (reversible), igual que rooms-cleanup.
adminMaintenanceRouter.post('/inquilinos-huerfanos', requireAuth, async (req: Request, res: Response) => {
  try {
    if (req.body?.confirm !== true) { res.status(400).json({ error: 'Falta confirm:true' }); return; }
    const items = await detectarInquilinosHuerfanos();
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const custLimpiados = new Set<string>();
    let bauleras = 0;

    for (const it of items) {
      const roomRef = db.collection('storageRooms').doc(it.roomId);
      // Backup antes de tocar (100% reversible).
      const snap = await roomRef.get();
      if (snap.exists) {
        await db.collection('storageRooms_backup').doc(`${stamp}__${it.roomId}`)
          .set({ ...(snap.data() as Record<string, unknown>), _backupOf: it.roomId, _backupAt: stamp, _motivo: 'inquilinos-huerfanos' });
      }
      if (it.enBaulera.length) {
        await roomRef.set({
          customerId: null, currentTenant: null, contractNumber: null,
          tenantEmail: null, tenantDni: null, updatedAt: new Date().toISOString(),
        }, { merge: true });
      }
      for (const cid of it.customers) {
        if (custLimpiados.has(cid)) continue;
        await db.collection('customers').doc(cid).set(
          { bauleraCodigo: null, storageRoomId: null, updatedAt: new Date().toISOString() }, { merge: true });
        custLimpiados.add(cid);
      }
      bauleras++;
    }

    await logAudit({
      actor: (req as unknown as { email?: string }).email || 'admin', via: 'admin',
      action: 'limpieza_inquilinos_huerfanos', entity: 'storageRooms',
      detail: { bauleras, customersDesanexados: custLimpiados.size, backupStamp: stamp },
    });
    res.json({ bauleras, customersDesanexados: custLimpiados.size, backupStamp: stamp });
  } catch (err) {
    console.error('POST /admin/maintenance/inquilinos-huerfanos error:', err);
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
