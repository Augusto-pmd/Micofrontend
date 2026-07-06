import { Router, Request, Response } from 'express';
import { db } from '../config/firebase';
import { FieldPath, FieldValue } from 'firebase-admin/firestore';

// Importación / sincronización del inventario desde la planilla (Google Sheet).
// Recibe { bauleras:[...], clientes:[...] } y hace upsert en Firestore.
// Protegido por token (header x-sync-token === SYNC_TOKEN).
export const syncRouter = Router();

const FLOOR: Record<string, string> = { A0: 'PB', A1: '1', A2: '2', A3: '3' };

// Unifica medidas equivalentes (mismo tamano y precio) a una sola: 5.1 -> 5, 8.1 -> 8.
// NO toca las demas: 22 y 22.1 (PB) quedan como medidas distintas a proposito.
function canonM2(x: unknown): number {
  const n = Number(x) || 0;
  if (n === 5.1) return 5;
  if (n === 8.1) return 8;
  return n;
}

function roomDoc(b: any, now: string, branchId: string, buildingId: string) {
  const m2 = canonM2(b.m2);
  return {
    space: b.code,
    name: b.code,
    floor: FLOOR[b.floor] || b.floor || 'PB',
    width: String(m2),
    length: '2.50',
    height: '2.40',
    depth: '2.50',
    areaM2: String(m2),
    volumeM3: String((m2 * 2.4).toFixed(2)),
    price: String(b.price ?? ''),
    images: [],
    status: b.status === 'occupied' ? 'occupied' : 'available',
    description: `Baulera ${b.code} · ${m2}m2` + (b.titular ? ` · ${b.titular}` : ''),
    buildingId,
    branchId,
    contractNumber: b.contractNumber || null,
    currentTenant: b.titular || null,
    tenantEmail: String(b.mail || b.email || '').trim().toLowerCase() || null,
    tenantDni: String(b.dni || b.dniTitular || '').replace(/[^0-9]/g, '') || null,
    createdAt: now,
    updatedAt: now,
  };
}

syncRouter.post('/import', async (req: Request, res: Response) => {
  try {
    const token = req.header('x-sync-token');
    if (process.env.FUNCTIONS_EMULATOR !== 'true' && (!token || token !== process.env['SYNC_TOKEN'])) {
      res.status(401).json({ error: 'Token invalido' });
      return;
    }
    const bauleras: any[] = req.body?.bauleras;
    const clientes: any[] = req.body?.clientes || [];
    if (!Array.isArray(bauleras) || bauleras.length === 0) {
      res.status(400).json({ error: 'bauleras[] requerido' });
      return;
    }
    const now = new Date().toISOString();
    const branchId = String(req.body?.branchId || 'nordelta');
    const branchName = String(req.body?.branchName || (branchId === 'nordelta' ? 'Nordelta' : branchId));
    const buildingId = `${branchId}-A`;

    // 1. Branch + Building (idempotente, por sucursal)
    const branchExtra = branchId === 'nordelta'
      ? { address: 'Av. de los Lagos 7250', city: 'Nordelta - Tigre', province: 'Buenos Aires',
          country: 'Argentina', zipCode: '1670', phone: '+54 9 11 3620-7989', email: 'info@micontainer.com' }
      : {};
    await db.collection('branches').doc(branchId).set({
      name: branchName, isActive: true, createdAt: now, updatedAt: now, ...branchExtra,
    }, { merge: true });
    await db.collection('buildings').doc(buildingId).set({
      name: `Edificio ${branchName}`, branchId, isActive: true, updatedAt: now,
    }, { merge: true });

    // 2. Storage rooms (overwrite: refleja status real)
    // Preservar bauleras BLOQUEADAS manualmente: el sync NO las desbloquea.
    const blockedMap = new Map<string, Record<string, unknown>>();
    const existingRooms = await db.collection('storageRooms').where('branchId', '==', branchId).get();
    existingRooms.forEach((d) => { const r = d.data() as Record<string, unknown>; if (r.status === 'blocked') blockedMap.set(d.id, r); });
    const CHUNK = 450;
    for (let i = 0; i < bauleras.length; i += CHUNK) {
      const batch = db.batch();
      bauleras.slice(i, i + CHUNK).forEach((b) => {
        const id = `${branchId}__${b.code}`;
        const roomData: Record<string, unknown> = { ...roomDoc(b, now, branchId, buildingId) };
        const blk = blockedMap.get(id);
        if (blk) {
          roomData.status = 'blocked';
          roomData.blockedUntil = blk.blockedUntil ?? null;
          roomData.blockReason = blk.blockReason ?? 'Bloqueo manual';
        }
        batch.set(db.collection('storageRooms').doc(id), roomData);
      });
      await batch.commit();
    }

    // 2.5 Precios por medida (motor de precios / web). Precio de grupo = el mas
    // frecuente por m2 (los distintos quedan como override puntual en la baulera).
    const priceVotes: Record<string, Record<string, number>> = {};
    for (const b of bauleras) {
      const m2 = canonM2(b.m2);
      const price = Number(b.price) || 0;
      if (!m2 || !price) continue;
      const km = String(m2);
      priceVotes[km] = priceVotes[km] || {};
      const kp = String(price);
      priceVotes[km][kp] = (priceVotes[km][kp] || 0) + 1;
    }
    const byM2: Record<string, number> = {};
    for (const km of Object.keys(priceVotes)) {
      // mas votado; si empatan, el mas bajo (asumimos que los caros son overrides)
      const winner = Object.entries(priceVotes[km])
        .sort((a, b) => b[1] - a[1] || Number(a[0]) - Number(b[0]))[0];
      if (winner) byM2[km] = Number(winner[0]);
    }
    if (Object.keys(byM2).length) {
      await db.collection('pricing').doc(branchId).set(
        { branchId, byM2, updatedAt: now, source: 'sheet-sync' },
        { merge: true },
      );
      // Limpia medidas viejas ya unificadas (5.1 -> 5, 8.1 -> 8) del mapa de precios,
      // asi no quedan filas fantasma en el admin.
      await db.collection('pricing').doc(branchId).update(
        new FieldPath('byM2', '5.1'), FieldValue.delete(),
        new FieldPath('byM2', '8.1'), FieldValue.delete(),
      ).catch(() => {});
    }

    // 2.7 Candado anti-duplicacion: borra cualquier resto de esquema viejo
    // (id sin '__'), asi NUNCA se vuelven a duplicar las bauleras al sincronizar.
    const legacySnap = await db.collection('storageRooms').get();
    const legacy = legacySnap.docs.filter((d) => !d.id.includes('__'));
    for (let i = 0; i < legacy.length; i += 400) {
      const lb = db.batch();
      legacy.slice(i, i + 400).forEach((d) => lb.delete(d.ref));
      await lb.commit();
    }

    // 3. Customers (dedupe por DNI) + Orders (uno por contrato)
    const byDni = new Map<string, any[]>();
    for (const c of clientes) {
      const key = c.dni || c.contractNumber;
      if (!byDni.has(key)) byDni.set(key, []);
      byDni.get(key)!.push(c);
    }
    const custBatch = db.batch();
    let custCount = 0;
    for (const [, list] of byDni) {
      const first = list[0];
      const bauleras2 = list.map((x) => x.baulera);
      const contracts = list.map((x) => x.contractNumber);
      const parts = String(first.titular || '').split(' ');
      const custId = `cust-${branchId}-${first.contractNumber}`;
      custBatch.set(db.collection('customers').doc(custId), {
        firstName: parts[0] || first.titular || '',
        lastName: parts.slice(1).join(' '),
        fullName: first.titular || '',
        dni: first.dni || '',
        cuit: (first.dni || '').includes('-') ? first.dni : null,
        personType: (first.dni || '').includes('-') ? 'juridica' : 'fisica',
        phone: first.telefono || '',
        email: first.mail || '',
        address: '',
        branchId: 'nordelta',
        isActive: true,
        isApproved: true,
        bauleraCodigo: bauleras2[0],
        bauleras: bauleras2,
        storageRoomId: `${branchId}__${bauleras2[0]}`,
        contractNumber: contracts[0],
        contractNumbers: contracts,
        startDate: first.fechaIngreso || null,
        monthlyPrice: first.price || 0,
        m2: canonM2(first.m2),
        updatedAt: now,
      }, { merge: true });
      custCount++;
    }
    await custBatch.commit();

    // 4. Orders + reconciliación (borra órdenes manuales que ya no están)
    const orderBatch = db.batch();
    for (const c of clientes) {
      const dniKey = c.dni || c.contractNumber;
      const custId = `cust-${branchId}-${(byDni.get(dniKey)![0]).contractNumber}`;
      orderBatch.set(db.collection('reservationOrders').doc(`order-${branchId}-${c.contractNumber}`), {
        contractNumber: c.contractNumber,
        customerId: custId,
        customerName: c.titular,
        storageRoomId: `${branchId}__${c.baulera}`,
        bauleraCodigo: c.baulera,
        branchId: 'nordelta',
        buildingId: 'edificio-a',
        entryDate: c.fechaIngreso || null,
        m2: canonM2(c.m2),
        monthlyPrice: c.price || 0,
        totalAmount: String(c.price || ''),
        status: 'CONFIRMED',
        source: 'manual',
        updatedAt: now,
        createdAt: now,
      }, { merge: true });
    }
    await orderBatch.commit();

    // MODO ADITIVO: el sync NO borra. Las cancelaciones se marcan a mano
    // (una baulera liberada en la planilla queda 'available' al sincronizar).

    res.json({ ok: true, branchId, rooms: bauleras.length, customers: custCount, orders: clientes.length, ordersDeleted: 0, mode: 'aditivo' });
  } catch (err) {
    console.error('POST /sync/import error:', err);
    res.status(500).json({ error: 'Internal server error', detail: String(err) });
  }
});
