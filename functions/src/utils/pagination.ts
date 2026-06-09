import { db } from '../config/firebase';

/**
 * Paginación eficiente en Firestore.
 *
 * Resuelve el anti-patrón de traer TODA la colección a memoria:
 *  - `total` se obtiene con la agregación `.count()` (≈1 lectura / 1000 docs)
 *    en vez de leer todos los documentos.
 *  - La página se trae con `.limit(limit)` + cursor (`.startAfter`) cuando el
 *    cliente manda `cursor`, o con `.offset()` para el esquema clásico por
 *    número de página (compatibilidad con el front actual del admin).
 *
 * Devuelve siempre `nextCursor` (id del último doc de la página) para permitir
 * migrar el front a paginación por cursor sin romper el esquema actual.
 */
export interface PaginateOpts {
  page: number;
  limit: number;
  cursor?: string; // id del último doc de la página anterior
}

export interface PaginateResult {
  docs: FirebaseFirestore.QueryDocumentSnapshot[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  nextCursor: string | null;
}

export async function paginate(
  collectionName: string,
  baseQuery: FirebaseFirestore.Query,
  opts: PaginateOpts
): Promise<PaginateResult> {
  const page = Math.max(1, opts.page || 1);
  const limit = Math.max(1, Math.min(opts.limit || 10, 1000));
  const { cursor } = opts;

  // total con agregación count() — barato; cae a select() solo si falla
  let total = 0;
  try {
    const countSnap = await baseQuery.count().get();
    total = countSnap.data().count;
  } catch {
    // fallback: trae solo refs (sin campos), mucho más barato que leer todo
    const refsSnap = await baseQuery.select().get();
    total = refsSnap.size;
  }

  let pageQuery = baseQuery.limit(limit);
  if (cursor) {
    const curSnap = await db.collection(collectionName).doc(cursor).get();
    if (curSnap.exists) {
      pageQuery = baseQuery.startAfter(curSnap).limit(limit);
    }
  } else if (page > 1) {
    pageQuery = baseQuery.offset((page - 1) * limit).limit(limit);
  }

  const snap = await pageQuery.get();
  const docs = snap.docs;
  const nextCursor =
    docs.length === limit && docs.length > 0 ? docs[docs.length - 1].id : null;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return { docs, total, page, limit, totalPages, nextCursor };
}
