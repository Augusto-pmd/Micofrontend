import { db } from '../config/firebase';

/**
 * Cache en memoria del módulo para el join buildings + branches.
 * Son pocos documentos y casi nunca cambian, así que se cachean con TTL
 * en vez de releerlos en cada request (antes se leían en orders.ts y
 * storageRooms.ts en CADA llamada).
 *
 * La instancia de Cloud Function se reutiliza entre requests (warm), así que
 * el cache sobrevive entre llamadas mientras la instancia esté viva.
 */
let cache: { data: Record<string, any>; expires: number } | null = null;
const TTL_MS = 60_000; // 60s

export async function getBuildingMap(): Promise<Record<string, any>> {
  const now = Date.now();
  if (cache && cache.expires > now) return cache.data;

  const [bldSnap, brSnap] = await Promise.all([
    db.collection('buildings').get(),
    db.collection('branches').get(),
  ]);

  const branches: Record<string, any> = {};
  brSnap.docs.forEach((d) => {
    branches[d.id] = { id: d.id, ...d.data() };
  });

  const buildings: Record<string, any> = {};
  bldSnap.docs.forEach((d) => {
    const b = { id: d.id, ...d.data() } as any;
    b.branch = branches[b.branchId] || null;
    buildings[d.id] = b;
  });

  cache = { data: buildings, expires: now + TTL_MS };
  return buildings;
}

/** Invalidar manualmente (p. ej. tras crear/editar una sucursal o edificio). */
export function invalidateBuildingCache(): void {
  cache = null;
}
