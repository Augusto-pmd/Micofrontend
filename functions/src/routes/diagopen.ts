import { Router, Request, Response } from 'express';
import { db } from '../config/firebase';
import { getPreapprovalDetail, searchSubscriptions } from '../services/mercadopago.service';
import { getPricingByM2 } from '../services/pricing.service';
import { canon, codigoDeRef } from '../utils/bauleraCode';

// CONSOLA DE DIAGNÓSTICO — ABIERTA, SOLO LECTURA (pedido Lucas 17/07, mientras la web está en obra).
// CERO escritura: solo GET/consultas a Firestore y a MP. Path poco conocido. Se cierra cuando Lucas
// diga (sacar el import + app.use de index.ts + este archivo). Reemplazo del curl temporal a mano.
export const diagOpenRouter = Router();

const MP = 'https://api.mercadopago.com';
// canon/codigoDeRef: criterio ÚNICO de igualdad de código (utils/bauleraCode). Antes esta consola
// solo hacía trim+mayúsculas, así que una sub escrita "A2-25" no encontraba la baulera "A2-025" del
// inventario y salía listada como "suelta" o sin medida.

async function mpGet(path: string): Promise<unknown> {
  const tok = process.env['MP_ACCESS_TOKEN'];
  if (!tok) return { error: 'sin MP_ACCESS_TOKEN' };
  const r = await fetch(`${MP}${path}`, { headers: { Authorization: `Bearer ${tok}` } });
  if (!r.ok) return { httpError: r.status };
  return r.json();
}

diagOpenRouter.get('/', async (req: Request, res: Response) => {
  const what = String(req.query['what'] || '');
  try {
    // Buscar una baulera: reserva + estado + la sub de MP atada (con su referencia externa/código).
    if (what === 'baulera') {
      const code = String(req.query['code'] || '');
      const snap = await db.collection('reservations').where('bauleraCodigo', '==', code).get();
      const reservas = [];
      for (const d of snap.docs) {
        const r = d.data() as Record<string, unknown>;
        let sub: unknown = null;
        if (r['mpPreapprovalId']) sub = await getPreapprovalDetail(String(r['mpPreapprovalId']));
        reservas.push({ id: d.id, status: r['status'], mpSub: r['mpSubscriptionStatus'], preapproval: r['mpPreapprovalId'] || '(vacío)', mode: r['paymentMode'], email: r['customerEmail'], cliente: r['customerName'], monthly: r['monthly'], room: r['storageRoomId'], sub });
      }
      res.json({ code, reservas });
      return;
    }
    // Reserva por id.
    if (what === 'reserva') {
      const snap = await db.collection('reservations').doc(String(req.query['id'] || '')).get();
      res.json(snap.exists ? { id: snap.id, ...snap.data() } : { error: 'no existe' });
      return;
    }
    // PANORAMA: los dos números clave — subs SUELTAS (sin código de baulera) y con PRECIO VIEJO
    // (monto distinto a la tarifa vigente de esa medida). Read-only, ~una pasada por las subs vivas.
    if (what === 'panorama') {
      const [auth, pend, tarifa, roomsSnap] = await Promise.all([
        searchSubscriptions('authorized'), searchSubscriptions('pending'),
        getPricingByM2('nordelta'), db.collection('storageRooms').get(),
      ]);
      const subs = [...auth, ...pend];
      const m2ByCode = new Map<string, number>();
      roomsSnap.forEach((x) => { const rr = x.data() as Record<string, unknown>; const c = canon(String(rr['space'] || rr['name'] || '')); if (c) m2ByCode.set(c, Number(rr['areaM2']) || 0); });
      const sueltasList: unknown[] = [];
      const precioList: unknown[] = [];
      for (const s of subs) {
        const code = codigoDeRef(String(s.externalReference || ''));
        if (!code) { sueltasList.push({ id: s.id, amount: s.amount, email: s.payerEmail, status: s.status, reason: s.reason }); continue; }
        const m2 = m2ByCode.get(code);
        const tar = m2 != null ? tarifa[String(m2)] : undefined;
        if (tar && Math.abs(s.amount - tar) > tar * 0.02) precioList.push({ baulera: code, paga: s.amount, deberia: tar, dif: tar - s.amount, email: s.payerEmail });
      }
      res.json({
        subsVivas: subs.length,
        sueltas: sueltasList.length, sueltasList: sueltasList.slice(0, 50),
        precioViejo: precioList.length, precioList: precioList.slice(0, 50),
      });
      return;
    }
    // Buscar subs en MP por texto (email / external_reference / id).
    if (what === 'sub') {
      const q = String(req.query['q'] || '');
      const url = q ? `/preapproval/search?q=${encodeURIComponent(q)}&limit=20` : '/preapproval/search?sort=date_created:desc&limit=15';
      const d = await mpGet(url) as { results?: Array<Record<string, unknown>> };
      res.json({ subs: (d.results || []).map((s) => ({ id: s['id'], status: s['status'], reason: s['reason'], ext: s['external_reference'], email: s['payer_email'], planId: s['preapproval_plan_id'], created: s['date_created'], ar: s['auto_recurring'], next: s['next_payment_date'] })) });
      return;
    }
    // Últimos pagos.
    if (what === 'payments') {
      const d = await mpGet('/v1/payments/search?sort=date_created&criteria=desc&limit=20') as { results?: Array<Record<string, unknown>> };
      res.json({ pagos: (d.results || []).map((p) => ({ id: p['id'], amount: p['transaction_amount'], status: p['status'], detail: p['status_detail'], date: p['date_created'], ext: p['external_reference'], email: (p['payer'] as Record<string, unknown> | undefined)?.['email'] })) });
      return;
    }
    res.status(400).json({ error: 'what? (baulera|reserva|panorama|sub|payments)' });
  } catch (e) {
    res.status(500).json({ error: String(e).slice(0, 300) });
  }
});
