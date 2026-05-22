import { Router, Request, Response } from 'express';
import { db } from '../../config/firebase';
import { verifyToken } from '../../middleware/verifyToken';

export const seedRouter = Router();

// Generate 164 storage rooms across 4 floors (PB, 1, 2, 3) for Edificio A
function generateStorageRooms(buildingId: string, branchId: string): any[] {
  const floors = ['PB', '1', '2', '3'];
  const sizes = [
    { width: '2.00', length: '2.00', height: '2.40', areaM2: '4.00', volumeM3: '9.60', price: 18000 },
    { width: '2.00', length: '3.00', height: '2.40', areaM2: '6.00', volumeM3: '14.40', price: 24000 },
    { width: '2.50', length: '3.00', height: '2.40', areaM2: '7.50', volumeM3: '18.00', price: 30000 },
    { width: '3.00', length: '3.00', height: '2.40', areaM2: '9.00', volumeM3: '21.60', price: 36000 },
    { width: '3.00', length: '4.00', height: '2.40', areaM2: '12.00', volumeM3: '28.80', price: 48000 },
    { width: '4.00', length: '4.00', height: '2.40', areaM2: '16.00', volumeM3: '38.40', price: 64000 },
  ];

  const rooms: any[] = [];
  let counter = 1;

  // 41 rooms on PB, 41 on floor 1, 41 on floor 2, 41 on floor 3 = 164 total
  for (const floor of floors) {
    const count = floor === 'PB' ? 41 : 41;
    for (let i = 0; i < count; i++) {
      const size = sizes[i % sizes.length];
      const padded = String(counter).padStart(3, '0');
      const statusRoll = Math.random();
      const status =
        statusRoll < 0.55 ? 'available' :
        statusRoll < 0.80 ? 'occupied' :
        statusRoll < 0.92 ? 'reserved' : 'blocked';

      rooms.push({
        space: `B-${padded}`,
        floor,
        width: size.width,
        length: size.length,
        height: size.height,
        depth: size.length,
        areaM2: size.areaM2,
        volumeM3: size.volumeM3,
        price: String(size.price),
        images: [],
        status,
        description: `Baulera ${padded} - Piso ${floor}`,
        buildingId,
        branchId,
        name: `Baulera ${padded}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      counter++;
    }
  }

  return rooms;
}

// POST /seed/initial
seedRouter.post('/initial', verifyToken, async (_req: Request, res: Response) => {
  try {
    const now = new Date().toISOString();
    const batch = db.batch();

    // 1. Branch
    const branchRef = db.collection('branches').doc('nordelta');
    batch.set(branchRef, {
      name: 'Nordelta',
      address: 'Av. de los Lagos 7250',
      phone: '',
      email: '',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    // 2. Building
    const buildingRef = db.collection('buildings').doc('edificio-a');
    batch.set(buildingRef, {
      name: 'Edificio A',
      branchId: 'nordelta',
      floors: ['PB', '1', '2', '3'],
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    await batch.commit();

    // 3. Storage rooms — written in batches of 500 (Firestore limit)
    const rooms = generateStorageRooms('edificio-a', 'nordelta');
    const CHUNK = 490;
    for (let i = 0; i < rooms.length; i += CHUNK) {
      const chunk = rooms.slice(i, i + CHUNK);
      const chunkBatch = db.batch();
      chunk.forEach(room => {
        const ref = db.collection('storageRooms').doc();
        chunkBatch.set(ref, room);
      });
      await chunkBatch.commit();
    }

    res.json({
      message: 'Initial seed completed',
      seeded: {
        branches: 1,
        buildings: 1,
        storageRooms: rooms.length,
      },
    });
  } catch (err) {
    console.error('POST /seed/initial error:', err);
    res.status(500).json({ message: 'Internal server error', detail: String(err) });
  }
});
