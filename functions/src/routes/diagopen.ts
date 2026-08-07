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
    // ¿DE QUIÉN ES ESTA SUSCRIPCIÓN? — para las "sueltas" (sin código de baulera atado).
    // MP NO expone el mail del pagador en el preapproval, pero SÍ en los PAGOS de esa suscripción:
    // por ahí se identifica al cliente. Además intenta resolver solo por los otros dos caminos:
    //   (a) el título/referencia trae un id de venta "MC-XXXX" → reserva → cliente + baulera;
    //   (b) el título/referencia trae un código de baulera → reserva de esa baulera.
    // ?what=quien&sub=<preapprovalId>
    if (what === 'quien') {
      const subId = String(req.query['sub'] || '').trim();
      if (!subId) { res.status(400).json({ error: 'falta ?sub=<preapprovalId>' }); return; }
      const det = await mpGet(`/preapproval/${encodeURIComponent(subId)}`) as Record<string, unknown>;
      const reason = String(det['reason'] || '');
      const ext = String(det['external_reference'] || '');
      const texto = `${reason} ${ext}`;

      // (a) id de venta embebido en el título o la referencia
      const mcMatch = texto.match(/MC-[A-Z0-9]{4}-[A-Z0-9]{4}/i);
      let porVenta: unknown = null;
      if (mcMatch) {
        const rs = await db.collection('reservations').doc(mcMatch[0].toUpperCase()).get();
        porVenta = rs.exists
          ? { id: rs.id, ...(({ customerName, customerEmail, customerPhone, customerDni, status, bauleraCodigo, storageRoomId, monthly }) =>
              ({ customerName, customerEmail, customerPhone, customerDni, status, bauleraCodigo, storageRoomId, monthly }))(rs.data() as Record<string, string>) }
          : { error: `la venta ${mcMatch[0]} no existe en la base` };
      }

      // (b) código de baulera embebido
      const code = codigoDeRef(ext) || codigoDeRef(reason);
      let porBaulera: unknown = null;
      if (code) {
        const snap = await db.collection('reservations').get();
        const hits = snap.docs
          .filter((d) => canon(String((d.data() as Record<string, unknown>)['bauleraCodigo'] || '')) === code)
          .map((d) => { const r = d.data() as Record<string, unknown>; return { id: d.id, cliente: r['customerName'], email: r['customerEmail'], status: r['status'], baulera: r['bauleraCodigo'], monthly: r['monthly'] }; });
        porBaulera = { codigo: code, reservas: hits };
      }

      // (c) LOS PAGOS: acá vive el mail del pagador (el dato más fuerte).
      const ap = await mpGet(`/authorized_payments/search?preapproval_id=${encodeURIComponent(subId)}`) as { results?: Array<Record<string, unknown>> };
      const cobros: unknown[] = [];
      for (const a of (ap.results || []).slice(0, 6)) {
        const pid = (a['payment'] as Record<string, unknown> | undefined)?.['id'] ?? a['id'];
        let email: unknown = null, nombre: unknown = null;
        if (pid) {
          const p = await mpGet(`/v1/payments/${encodeURIComponent(String(pid))}`) as Record<string, unknown>;
          const payer = (p?.['payer'] as Record<string, unknown>) || {};
          email = payer['email'] || null;
          const idn = (payer['first_name'] || payer['last_name'])
            ? `${payer['first_name'] || ''} ${payer['last_name'] || ''}`.trim() : null;
          nombre = idn || (payer['identification'] as Record<string, unknown> | undefined)?.['number'] || null;
        }
        cobros.push({ fecha: a['date_created'], monto: a['transaction_amount'], estado: a['status'], pagoId: pid, email, nombre });
      }

      const mails = [...new Set(cobros.map((c) => (c as Record<string, unknown>)['email']).filter(Boolean))];
      // Si el mail del pagador aparece en algún cliente/reserva, decir en cuál.
      const porMail: unknown[] = [];
      for (const m of mails) {
        const q = String(m).toLowerCase();
        const [rs, cs] = await Promise.all([
          db.collection('reservations').where('customerEmail', '==', q).limit(5).get(),
          db.collection('customers').where('email', '==', q).limit(5).get(),
        ]);
        porMail.push({
          mail: q,
          reservas: rs.docs.map((d) => { const r = d.data() as Record<string, unknown>; return { id: d.id, cliente: r['customerName'], status: r['status'], baulera: r['bauleraCodigo'] }; }),
          clientes: cs.docs.map((d) => { const c = d.data() as Record<string, unknown>; return { id: d.id, nombre: c['fullName'], baulera: c['bauleraCodigo'] }; }),
        });
      }

      // El PREAPPROVAL en si trae payer_id (y a veces payer_email). Es el unico dato de identidad
      // cuando la sub todavia NO cobro (mes gratis): ahi no hay pagos de donde sacar el mail.
      const payerId = det['payer_id'] ? String(det['payer_id']) : '';
      const payerEmail = det['payer_email'] ? String(det['payer_email']) : '';
      // Si guardamos ese payer_id en alguna reserva (se estampa al casar la sub), sale el cliente.
      let porPayer: unknown = null;
      if (payerId) {
        const rs = await db.collection('reservations').where('customerMpPayerId', '==', payerId).limit(5).get();
        porPayer = rs.docs.map((d) => { const r = d.data() as Record<string, unknown>; return { id: d.id, cliente: r['customerName'], email: r['customerEmail'], baulera: r['bauleraCodigo'], status: r['status'] }; });
      }

      res.json({
        sub: { id: subId, status: det['status'], reason, ext: ext || '(vacío)', monto: (det['auto_recurring'] as Record<string, unknown>)?.['transaction_amount'], planId: det['preapproval_plan_id'] || null, creada: det['date_created'], proximoDebito: det['next_payment_date'] || null },
        payerId: payerId || null, payerEmail: payerEmail || null, porPayer,
        porVenta, porBaulera, cobros, mailsDelPagador: mails, porMail,
      });
      return;
    }
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
