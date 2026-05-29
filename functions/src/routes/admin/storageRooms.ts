import { Router, Request, Response } from 'express';
import { db } from '../../config/firebase';
import { verifyToken } from '../../middleware/verifyToken';

export const storageRoomsRouter = Router();

async function getBuildingMap() {
  const [bldSnap, brSnap] = await Promise.all([
    db.collection('buildings').get(),
    db.collection('branches').get(),
  ]);
  const branches: Record<string, any> = {};
  brSnap.docs.forEach(d => { branches[d.id] = { id: d.id, ...d.data() }; });
  const buildings: Record<string, any> = {};
  bldSnap.docs.forEach(d => {
    const b = { id: d.id, ...d.data() } as any;
    b.branch = branches[b.branchId] || null;
    buildings[d.id] = b;
  });
  return buildings;
}

// GET /storage-room
storageRoomsRouter.get('/', verifyToken, async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query['page'] as string) || 1;
    const limit = parseInt(req.query['limit'] as string) || 10;
    const status = req.query['status'] as string | undefined;
    const branchId = req.query['branchId'] as string | undefined;
    const buildingId = req.query['buildingId'] as string | undefined;

    let query: FirebaseFirestore.Query = db.collection('storageRooms');
    if (status) query = query.where('status', '==', status);
    if (branchId) query = query.where('branchId', '==', branchId);
    if (buildingId) query = query.where('buildingId', '==', buildingId);

    const [snapshot, buildings] = await Promise.all([query.get(), getBuildingMap()]);
    const rawRooms = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as any));

    // Enrich occupied rooms with full tenant/customer data
    const occupiedContractNums = rawRooms
      .filter((r: any) => r.contractNumber)
      .map((r: any) => r.contractNumber as string);

    let customerByContract: Record<string, any> = {};
    if (occupiedContractNums.length > 0) {
      const custSnap = await db.collection('customers')
        .where('contractNumber', 'in', occupiedContractNums.slice(0, 10)) // Firestore limit
        .get();
      custSnap.docs.forEach(d => {
        const cust = { id: d.id, ...d.data() } as any;
        if (cust.contractNumber) customerByContract[cust.contractNumber] = cust;
        if (cust.contractNumbers) {
          cust.contractNumbers.forEach((cn: string) => { customerByContract[cn] = cust; });
        }
      });
    }

    const all = rawRooms.map((raw: any) => ({
      ...raw,
      building: buildings[raw.buildingId] || null,
      tenant: raw.contractNumber ? (customerByContract[raw.contractNumber] || {
        fullName: raw.currentTenant,
        contractNumber: raw.contractNumber,
      }) : null,
    }));

    const total = all.length;
    const start = (page - 1) * limit;
    const data = all.slice(start, start + limit);

    res.json({ data, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('GET /storage-room error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /storage-room/:id
storageRoomsRouter.get('/:id', verifyToken, async (req: Request, res: Response) => {
  try {
    const [doc, buildings] = await Promise.all([
      db.collection('storageRooms').doc(req.params['id']).get(),
      getBuildingMap(),
    ]);
    if (!doc.exists) {
      res.status(404).json({ message: 'Storage room not found' });
      return;
    }
    const raw = { id: doc.id, ...doc.data() } as any;
    // Get tenant if occupied
    let tenant = null;
    if (raw.contractNumber) {
      const custSnap = await db.collection('customers')
        .where('contractNumber', '==', raw.contractNumber).limit(1).get();
      if (!custSnap.empty) tenant = { id: custSnap.docs[0].id, ...custSnap.docs[0].data() };
    }
    const result = { ...raw, building: buildings[raw.buildingId] || null, tenant };
    res.json(result);
  } catch (err) {
    console.error('GET /storage-room/:id error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /storage-room
storageRoomsRouter.post('/', verifyToken, async (req: Request, res: Response) => {
  try {
    const now = new Date().toISOString();
    const data = { ...req.body, createdAt: now, updatedAt: now };
    const ref = await db.collection('storageRooms').add(data);
    res.status(201).json({ id: ref.id, ...data });
  } catch (err) {
    console.error('POST /storage-room error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PUT /storage-room/:id
storageRoomsRouter.put('/:id', verifyToken, async (req: Request, res: Response) => {
  try {
    const now = new Date().toISOString();
    const data = { ...req.body, updatedAt: now };
    await db.collection('storageRooms').doc(req.params['id']).set(data, { merge: true });
    const updated = await db.collection('storageRooms').doc(req.params['id']).get();
    res.json({ id: updated.id, ...updated.data() });
  } catch (err) {
    console.error('PUT /storage-room/:id error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// DELETE /storage-room/:id
storageRoomsRouter.delete('/:id', verifyToken, async (req: Request, res: Response) => {
  try {
    await db.collection('storageRooms').doc(req.params['id']).delete();
    res.json({ message: 'Storage room deleted' });
  } catch (err) {
    console.error('DELETE /storage-room/:id error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});
