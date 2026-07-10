import { Router, Request, Response } from 'express';
import { db } from '../../config/firebase';
import { CONTRATOS, EMAIL_BY_CTO } from './seed-data.local'; // PII de clientes: gitignored, NO va al repo
export const seedRouter = Router();

// ─── Real Nordelta data from Excel ────────────────────────────────────────────

// CONTRATOS y EMAIL_BY_CTO se importan de ./seed-data.local (PII: nombres/DNI/tel/email).
// Ese archivo está en .gitignore — NO se commitea, para no exponer datos de clientes.

// Precio por m2 (FACTURACION RESUMEN)
const PRICE_TABLE: Record<string, number> = {
  '1.50': 53550,  '2.00': 71400,   '3.00': 88200,
  '5.00': 139230, '5.10': 139230,  '6.00': 151200,
  '8.00': 204120, '8.10': 204120,  '9.00': 207900,
  '11.25': 259875,'13.50': 283500, '15.00': 441000,
  '16.00': 441000,
};

// Bauleras alquiladas (para marcarlas como occupied)
const ALQUILADAS = new Set(CONTRATOS.map(c => c.baulera));

// Layout completo de las 164 bauleras (por piso y rango)
function buildAllRooms(buildingId: string, branchId: string): any[] {
  const now = new Date().toISOString();
  const rooms: any[] = [];

  // PB / A0: 13 unidades de 15m² → A0-001 a A0-013
  for (let i = 1; i <= 13; i++) {
    const id = `A0-${String(i).padStart(3,'0')}`;
    rooms.push(makeRoom(id,'PB',15.00,buildingId,branchId,now));
  }
  // A1: 29 bauleras (mix 11.25 y 13.50)
  // A1-001 a A1-014 → 13.50m², A1-015 a A1-029 → alternating
  const a1Sizes: number[] = [
    13.50,13.50,13.50,13.50,13.50,13.50,13.50,13.50,13.50,13.50, // 001-010
    11.25,11.25,13.50,11.25,11.25,13.50,13.50,13.50,11.25,13.50, // 011-020
    13.50,13.50,13.50,11.25,11.25,11.25,13.50,13.50,13.50,       // 021-029
  ];
  for (let i = 0; i < 29; i++) {
    const id = `A1-${String(i+1).padStart(3,'0')}`;
    rooms.push(makeRoom(id,'1',a1Sizes[i]??13.50,buildingId,branchId,now));
  }
  // A1-030 bonus
  rooms.push(makeRoom('A1-030','1',13.50,buildingId,branchId,now));

  // A2: 49 bauleras (mix 8.1, 9.00)
  const a2Sizes: Record<string,number> = {
    'A2-001':8.10,'A2-002':9.00,'A2-003':9.00,'A2-004':9.00,'A2-005':9.00,
    'A2-006':9.00,'A2-007':9.00,'A2-008':9.00,'A2-009':9.00,'A2-010':9.00,
    'A2-011':9.00,'A2-012':9.00,'A2-013':9.00,'A2-014':9.00,'A2-015':9.00,
    'A2-016':9.00,'A2-017':9.00,'A2-018':9.00,'A2-019':9.00,'A2-020':9.00,
    'A2-021':9.00,'A2-022':9.00,'A2-023':9.00,'A2-024':9.00,'A2-025':9.00,
    'A2-026':9.00,'A2-027':9.00,'A2-028':9.00,'A2-029':9.00,'A2-030':9.00,
    'A2-031':9.00,'A2-032':9.00,'A2-033':9.00,'A2-034':9.00,'A2-035':9.00,
    'A2-036':9.00,'A2-037':9.00,'A2-038':9.00,'A2-039':9.00,'A2-040':9.00,
    'A2-041':9.00,'A2-042':9.00,'A2-043':9.00,'A2-044':9.00,'A2-045':9.00,
    'A2-046':9.00,'A2-047':8.10,'A2-048':8.10,
  };
  for (let i = 1; i <= 48; i++) {
    const id = `A2-${String(i).padStart(3,'0')}`;
    const sz = a2Sizes[id] ?? 9.00;
    rooms.push(makeRoom(id,'2',sz,buildingId,branchId,now));
  }

  // A3: 60 bauleras (mix 1.5, 2.0, 3.0, 5.0, 5.1, 8.0)
  const a3Sizes: Record<string,number> = {
    'A3-001':3.00,'A3-002':3.00,'A3-003':3.00,'A3-004':3.00,'A3-005':3.00,
    'A3-006':3.00,'A3-007':3.00,'A3-008':3.00,'A3-009':3.00,'A3-010':3.00,
    'A3-011':3.00,'A3-012':3.00,'A3-013':3.00,'A3-014':8.00,'A3-015':1.50,
    'A3-016':1.50,'A3-017':1.50,'A3-018':1.50,'A3-019':1.50,'A3-020':1.50,
    'A3-021':1.50,'A3-022':1.50,'A3-023':1.50,'A3-024':1.50,'A3-025':1.50,
    'A3-026':1.50,'A3-027':1.50,'A3-028':1.50,'A3-029':1.50,'A3-030':1.50,
    'A3-031':1.50,'A3-032':2.00,'A3-033':2.00,'A3-034':2.00,'A3-035':2.00,
    'A3-036':2.00,'A3-037':2.00,'A3-038':2.00,'A3-039':2.00,'A3-040':1.50,
    'A3-041':2.00,'A3-042':2.00,'A3-043':2.00,'A3-044':2.00,'A3-045':2.00,
    'A3-046':2.00,'A3-047':1.50,'A3-048':1.50,'A3-049':1.50,'A3-050':1.50,
    'A3-051':5.10,'A3-052':5.10,'A3-053':5.10,'A3-054':5.10,'A3-055':5.00,
    'A3-056':5.10,'A3-057':5.00,'A3-058':5.00,'A3-059':5.00,'A3-060':5.00,
  };
  for (let i = 1; i <= 60; i++) {
    const id = `A3-${String(i).padStart(3,'0')}`;
    const sz = a3Sizes[id] ?? 3.00;
    rooms.push(makeRoom(id,'3',sz,buildingId,branchId,now));
  }

  return rooms;
}

function makeRoom(id: string, floor: string, m2: number, buildingId: string, branchId: string, now: string) {
  const key = String(m2.toFixed(2));
  const price = PRICE_TABLE[key] ?? 88200;
  const isOccupied = ALQUILADAS.has(id);
  const contract = CONTRATOS.find(c => c.baulera === id);
  return {
    space: id,
    floor,
    width: String(m2),
    length: '2.50',
    height: '2.40',
    depth: '2.50',
    areaM2: String(m2),
    volumeM3: String((m2 * 2.4).toFixed(2)),
    price: String(price),
    images: [],
    status: isOccupied ? 'occupied' : 'available',
    description: `Baulera ${id} · ${m2}m²${contract ? ` · ${contract.titular}` : ''}`,
    buildingId,
    branchId,
    name: id,
    contractNumber: contract?.cto ?? null,
    currentTenant: contract?.titular ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

function parseDate(str: string): string {
  // "10/3/2026" → "2026-03-10"
  const parts = str.split('/');
  if (parts.length !== 3) return str;
  const [d, m, y] = parts;
  return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
}

// DELETE /seed/clear
seedRouter.delete('/clear', async (_req: Request, res: Response) => {
  try {
    const collections = ['branches','buildings','storageRooms','reservationOrders','customers','operators','pricingRules','users'];
    const deleted: Record<string,number> = {};
    for (const col of collections) {
      const snapshot = await db.collection(col).get();
      const CHUNK = 490;
      const docs = snapshot.docs;
      for (let i = 0; i < docs.length; i += CHUNK) {
        const batch = db.batch();
        docs.slice(i,i+CHUNK).forEach(d => batch.delete(d.ref));
        await batch.commit();
      }
      deleted[col] = docs.length;
    }
    res.json({ message:'All data cleared', deleted });
  } catch (err) {
    res.status(500).json({ message:'Internal server error', detail:String(err) });
  }
});

// POST /seed/nordelta — carga REAL de todos los datos de Nordelta
seedRouter.post('/nordelta', async (_req: Request, res: Response) => {
  try {
    const now = new Date().toISOString();

    // ── 1. Branch ──────────────────────────────────────────────────
    const branchRef = db.collection('branches').doc('nordelta');
    await branchRef.set({
      name: 'Nordelta',
      address: 'Av. de los Lagos 7250',
      city: 'Nordelta - Tigre',
      province: 'Buenos Aires',
      country: 'Argentina',
      zipCode: '1670',
      phone: '+54 9 11 3620-7989',
      email: 'info@micontainer.com',
      isActive: true,
      description: 'Sucursal Nordelta · Edificio A · 164 bauleras',
      images: [],
      createdAt: now,
      updatedAt: now,
    });

    // ── 2. Building ────────────────────────────────────────────────
    const buildingRef = db.collection('buildings').doc('edificio-a');
    await buildingRef.set({
      name: 'Edificio A',
      branchId: 'nordelta',
      floors: 4,
      isActive: true,
      description: 'Edificio A · PB + Pisos 1, 2 y 3 · 164 bauleras',
      createdAt: now,
      updatedAt: now,
    });

    // ── 3. Storage rooms ───────────────────────────────────────────
    const rooms = buildAllRooms('edificio-a', 'nordelta');
    const CHUNK = 490;
    // Use baulera ID as document ID so it's idempotent
    for (let i = 0; i < rooms.length; i += CHUNK) {
      const batch = db.batch();
      rooms.slice(i,i+CHUNK).forEach(r => {
        const ref = db.collection('storageRooms').doc(r.space.replace('-','')); // e.g. A0001
        batch.set(ref, r);
      });
      await batch.commit();
    }

    // ── 4. Customers + Orders ──────────────────────────────────────
    // Deduplicate customers by DNI
    const customerMap = new Map<string, string>(); // dni → customerId
    const customerBatch = db.batch();

    // Build per-customer list of bauleras (some clients have multiple)
    const customerBauleras = new Map<string, {bauleras: string[], contracts: string[]}>();
    for (const c of CONTRATOS) {
      const key = c.dni;
      if (!customerBauleras.has(key)) customerBauleras.set(key, { bauleras:[], contracts:[] });
      customerBauleras.get(key)!.bauleras.push(c.baulera);
      customerBauleras.get(key)!.contracts.push(c.cto);
    }

    for (const c of CONTRATOS) {
      if (!customerMap.has(c.dni)) {
        const custId = `cust-${c.cto}`;
        customerMap.set(c.dni, custId);
        const parts = c.titular.split(' ');
        const firstName = parts[0] ?? c.titular;
        const lastName = parts.slice(1).join(' ');
        const info = customerBauleras.get(c.dni)!;
        const custRef = db.collection('customers').doc(custId);
        customerBatch.set(custRef, {
          firstName,
          lastName,
          fullName: c.titular,
          dni: c.dni,
          cuit: c.dni.includes('-') ? c.dni : null,
          personType: c.dni.includes('-') ? 'juridica' : 'fisica',
          phone: c.tel === '-' ? '' : c.tel,
          email: EMAIL_BY_CTO[c.cto] || '',
          address: '',
          branchId: 'nordelta',
          isActive: true,
          isApproved: true,
          // Link bidireccional: el cliente sabe sus bauleras
          bauleraCodigo: info.bauleras[0],         // baulera principal
          bauleras: info.bauleras,                  // todas las bauleras (si tiene varias)
          storageRoomId: info.bauleras[0].replace('-',''),
          contractNumber: info.contracts[0],
          contractNumbers: info.contracts,
          startDate: parseDate(c.fecha),
          monthlyPrice: c.precio,
          m2: c.m2,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
    await customerBatch.commit();

    // Orders (one per contract)
    const orderBatch = db.batch();
    for (const c of CONTRATOS) {
      const customerId = customerMap.get(c.dni)!;
      const storageRoomId = c.baulera.replace('-','');
      const orderRef = db.collection('reservationOrders').doc(`order-${c.cto}`);
      orderBatch.set(orderRef, {
        contractNumber: c.cto,
        customerId,
        customerName: c.titular,
        storageRoomId,
        bauleraCodigo: c.baulera,
        branchId: 'nordelta',
        buildingId: 'edificio-a',
        entryDate: parseDate(c.fecha),
        m2: c.m2,
        monthlyPrice: c.precio,
        totalAmount: String(c.precio),
        status: 'CONFIRMED',
        source: 'manual',
        notes: '',
        createdAt: now,
        updatedAt: now,
      });
    }
    await orderBatch.commit();

    // ── 5. Pricing rules ───────────────────────────────────────────
    const pricingBatch = db.batch();
    const pricingRules = Object.entries(PRICE_TABLE).map(([m2, price]) => ({
      branchId: 'nordelta',
      m2: parseFloat(m2),
      pricePerMonth: price,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    }));
    // Deduplicate by m2
    const seenM2 = new Set<number>();
    for (const rule of pricingRules) {
      if (!seenM2.has(rule.m2)) {
        seenM2.add(rule.m2);
        const ref = db.collection('pricingRules').doc(`nordelta-${rule.m2}`);
        pricingBatch.set(ref, rule);
      }
    }
    await pricingBatch.commit();

    res.json({
      message: '✅ Nordelta data loaded successfully',
      seeded: {
        branches: 1,
        buildings: 1,
        storageRooms: rooms.length,
        customers: customerMap.size,
        orders: CONTRATOS.length,
        pricingRules: seenM2.size,
      },
    });
  } catch (err) {
    console.error('POST /seed/nordelta error:', err);
    res.status(500).json({ message:'Internal server error', detail:String(err) });
  }
});

// POST /seed/initial (backwards compat)
seedRouter.post('/initial', async (_req: Request, res: Response) => {
  res.json({ message:'Use POST /seed/nordelta for real data' });
});
