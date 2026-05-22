import { Router, Request, Response } from 'express';
import { db } from '../../config/firebase';
import { verifyToken } from '../../middleware/verifyToken';

export const inventoryRouter = Router();

// GET /inventory — returns storage rooms grouped by building
inventoryRouter.get('/', verifyToken, async (req: Request, res: Response) => {
  try {
    const branchId = req.query['branchId'] as string | undefined;

    let srQuery: FirebaseFirestore.Query = db.collection('storageRooms');
    if (branchId) srQuery = srQuery.where('branchId', '==', branchId);

    const [buildingsSnap, storageSnap] = await Promise.all([
      db.collection('buildings').get(),
      srQuery.get(),
    ]);

    const buildings = buildingsSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
    const rooms = storageSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];

    // Group rooms by buildingId
    const grouped = buildings.map(b => ({
      ...b,
      storageRooms: rooms.filter(r => r.buildingId === b.id),
    }));

    res.json({ data: grouped });
  } catch (err) {
    console.error('GET /inventory error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});
