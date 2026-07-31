import { Router, Request, Response } from 'express';
import { db } from '../config/firebase';
import { canon } from '../utils/bauleraCode';

// DIAGNÓSTICO — SOLO LECTURA. Reemplazo SEGURO de la vieja ruta /debug-cobros (que era sin auth y
// además ESCRIBÍA). Diferencias clave:
//  - Guard por LLAVE SECRETA en el HEADER (x-diag-token contra el secret DEBUG_TOKEN) — mismo patrón
//    que /sync. La llave NO viaja en la URL → no queda en logs/historial/proxies.
//  - CERO acciones de escritura. Solo GET/consultas a Firestore y a MP (GET). Nunca modifica nada.
//  - Rotable: si se sospecha, se cambia el secret DEBUG_TOKEN y listo.
export const diagRouter = Router();

const MP = 'https://api.mercadopago.com';

// Guard: exige el token correcto en el header. Reusa SYNC_TOKEN (el secret del import de la planilla)
// porque es el único ya autorizado para la función — crear un secret nuevo requería un permiso IAM
// que la cuenta no tiene (16/07). El token viaja en el HEADER (x-diag-token), nunca en la URL.
diagRouter.use((req: Request, res: Response, next) => {
  const expected = process.env['SYNC_TOKEN'];
  if (!expected) { res.status(503).json({ error: 'diag deshabilitado (sin token)' }); return; }
  const got = req.header('x-diag-token') || '';
  if (got !== expected) { res.status(401).json({ error: 'token invalido' }); return; }
  next();
});

async function mpGet(path: string): Promise<unknown> {
  const tok = process.env['MP_ACCESS_TOKEN'];
  if (!tok) return { error: 'sin MP_ACCESS_TOKEN' };
  const r = await fetch(`${MP}${path}`, { headers: { Authorization: `Bearer ${tok}` } });
  if (!r.ok) return { httpError: r.status };
  return r.json();
}

// Traduce lo que se escribe en la URL al código EXACTO del inventario, usando el criterio único
// (utils/bauleraCode). Así ?code=A2-25 o a2025 encuentran igual la baulera A2-025: las consultas de
// abajo son por igualdad exacta contra lo guardado, y sin esto una consulta con otro formato
// devolvía vacío y parecía que la baulera no tenía nada. Si no matchea ninguna, se usa tal cual.
async function codigoReal(input: string): Promise<string> {
  const q = canon(input);
  if (!q) return input;
  const rooms = await db.collection('storageRooms').get();
  for (const d of rooms.docs) {
    const r = d.data() as Record<string, unknown>;
    const real = String(r['space'] || r['name'] || '');
    if (real && canon(real) === q) return real;
  }
  return input;
}

diagRouter.get('/', async (req: Request, res: Response) => {
  const what = String(req.query['what'] || '');
  try {
    // ── Firestore (lectura) ──────────────────────────────────────────────
    if (what === 'baulera') {
      const code = await codigoReal(String(req.query['code'] || ''));
      const [reservas, deudas] = await Promise.all([
        db.collection('reservations').where('bauleraCodigo', '==', code).get(),
        db.collection('debts').where('bauleraCodigo', '==', code.toUpperCase()).get(),
      ]);
      res.json({
        codigo: code, // el código real del inventario con el que se consultó
        reservas: reservas.docs.map((x) => { const r = x.data() as Record<string, unknown>; return { id: x.id, status: r['status'], mpSub: r['mpSubscriptionStatus'], preapproval: r['mpPreapprovalId'], plan: r['mpPlanId'], mode: r['paymentMode'], email: r['customerEmail'], cliente: r['customerName'], monthly: r['monthly'], storageRoomId: r['storageRoomId'] }; }),
        deudas: deudas.docs.map((x) => ({ id: x.id, ...x.data() })),
      });
      return;
    }
    if (what === 'reserva') {
      const snap = await db.collection('reservations').doc(String(req.query['id'] || '')).get();
      res.json(snap.exists ? { id: snap.id, ...snap.data() } : { error: 'no existe' });
      return;
    }
    if (what === 'customer') {
      // clientes que apuntan a un código de baulera (para detectar contaminación de datos)
      const snap = await db.collection('customers').where('bauleraCodigo', '==', await codigoReal(String(req.query['code'] || ''))).get();
      res.json({ customers: snap.docs.map((x) => { const c = x.data() as Record<string, unknown>; return { id: x.id, fullName: c['fullName'], email: c['email'], phone: c['phone'], dni: c['dni'], isActive: c['isActive'], storageRoomId: c['storageRoomId'] }; }) });
      return;
    }
    if (what === 'mpplans') {
      const snap = await db.collection('mpPlans').get();
      res.json({ docs: snap.docs.map((x) => ({ key: x.id, ...x.data() })) });
      return;
    }
    if (what === 'audit') {
      const snap = await db.collection('audit_log').where('entityId', '==', String(req.query['id'] || '')).get();
      const rows = snap.docs.map((x) => x.data() as Record<string, { toDate?: () => Date }>)
        .sort((a, b) => (b['ts']?.toDate?.()?.getTime?.() || 0) - (a['ts']?.toDate?.()?.getTime?.() || 0))
        .map((a) => ({ ts: a['ts']?.toDate?.()?.toISOString?.() || null, actor: a['actor'], action: a['action'], detail: a['detail'] }));
      res.json({ eventos: rows });
      return;
    }
    // ── Mercado Pago (GET) ───────────────────────────────────────────────
    if (what === 'sub') {
      const q = String(req.query['q'] || '');
      const url = q ? `/preapproval/search?q=${encodeURIComponent(q)}&limit=20` : '/preapproval/search?sort=date_created:desc&limit=15';
      const d = await mpGet(url) as { results?: Array<Record<string, unknown>> };
      res.json({ subs: (d.results || []).map((s) => ({ id: s['id'], status: s['status'], reason: s['reason'], ext: s['external_reference'], email: s['payer_email'], planId: s['preapproval_plan_id'], created: s['date_created'], ar: s['auto_recurring'], next: s['next_payment_date'] })) });
      return;
    }
    if (what === 'payments') {
      const d = await mpGet('/v1/payments/search?sort=date_created&criteria=desc&limit=15') as { results?: Array<Record<string, unknown>> };
      res.json({ pagos: (d.results || []).map((p) => ({ id: p['id'], amount: p['transaction_amount'], status: p['status'], detail: p['status_detail'], date: p['date_created'], ext: p['external_reference'], email: (p['payer'] as Record<string, unknown> | undefined)?.['email'] })) });
      return;
    }
    if (what === 'plans') {
      const d = await mpGet('/preapproval_plan/search?limit=100') as { results?: Array<Record<string, unknown>> };
      const rows = (d.results || []).filter((p) => /cierra el 1/.test(String(p['reason'] || '')));
      res.json({ total: (d.results || []).length, alineados: rows.map((p) => ({ id: p['id'], reason: p['reason'], status: p['status'], ar: p['auto_recurring'] })) });
      return;
    }
    res.status(400).json({ error: 'what? (baulera|reserva|customer|mpplans|audit|sub|payments|plans)' });
  } catch (e) {
    res.status(500).json({ error: String(e).slice(0, 300) });
  }
});
