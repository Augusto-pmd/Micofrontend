import { db } from '../config/firebase';

// DEUDAS (SPEC cobros-alineados §5): un mes rechazado se cobra con un PAGO ÚNICO (no una
// suscripción nueva). Cada deuda es un doc en `debts`. Cuando MP avisa que el pago único se
// aprobó (external_reference = "DEUDA <id>"), se marca `paid` → apaga el titileo de esa baulera.
export type DebtTipo = 'mes_adeudado' | 'proporcional';
export interface Debt {
  id: string;
  bauleraCodigo: string;
  reservationId?: string | null;
  periodo: string;        // 'YYYY-MM' del mes que se cobra (ancla para cruzar con el rechazo de MP)
  desde?: string | null;  // 'YYYY-MM-DD'
  hasta?: string | null;
  tipo: DebtTipo;
  monto: number;
  // 'anulada' (13/08, caso A1-029): deuda generada POR ERROR (el mes ya lo había cobrado MP solo).
  // Nadie la iba a pagar nunca → la baulera titilaba violeta para siempre. Anular la saca del
  // titileo y del guard anti-doble-link, y vence la preference en MP para que el link muerto no
  // se pueda pagar después (sería un doble cobro).
  status: 'pending' | 'paid' | 'anulada';
  sentAt: string;
  sentBy?: string | null;
  mpPreferenceId?: string | null;
  initPoint?: string | null;
  paidAt?: string | null;
  mpPaymentId?: string | null;
  email?: string | null;
  cliente?: string | null;
  anuladaAt?: string | null;
  anuladaBy?: string | null;
}

const col = () => db.collection('debts');
const canon = (c: string): string => String(c || '').trim().toUpperCase();

export async function createDebt(d: Omit<Debt, 'status'>): Promise<void> {
  await col().doc(d.id).set({ ...d, bauleraCodigo: canon(d.bauleraCodigo), status: 'pending' });
}

export async function getDebt(id: string): Promise<Debt | null> {
  const s = await col().doc(id).get();
  return s.exists ? ({ id: s.id, ...(s.data() as Record<string, unknown>) } as Debt) : null;
}

export async function markDebtPaid(id: string, mpPaymentId: string): Promise<void> {
  await col().doc(id).set({ status: 'paid', paidAt: new Date().toISOString(), mpPaymentId }, { merge: true });
}

// ANULAR una deuda enviada por error (nunca borra el doc: queda el rastro de que se envió y se
// anuló, con quién y cuándo). Solo tiene sentido sobre una 'pending'.
export async function anularDebt(id: string, by: string): Promise<void> {
  await col().doc(id).set({ status: 'anulada', anuladaAt: new Date().toISOString(), anuladaBy: by || 'admin' }, { merge: true });
}

// Estado de deuda por baulera (para cruzar con el titileo de Inventario):
//  - pagadas: set de períodos 'YYYY-MM' ya saldados por pago único → NO deben titilar naranja.
//  - pagadasDetalle: las deudas PAGADAS con su detalle (monto/fecha/tipo), más recientes primero —
//    la ficha las muestra ("✓ Pagó deuda") para que quede ASENTADO qué se cobró (pedido Lucas 15/07:
//    Débora pagó el mes adeudado de A1-006 y no quedaba rastro visible en ningún lado).
//  - pendiente: la deuda con link enviado y aún sin pagar (la más reciente) → titila VIOLETA.
export interface DebtEstado { pendiente: Debt | null; pagadas: Set<string>; pagadasDetalle: Debt[] }
export async function debtsByBaulera(): Promise<Map<string, DebtEstado>> {
  const snap = await col().get();
  const m = new Map<string, DebtEstado>();
  snap.forEach((doc) => {
    const d = { id: doc.id, ...(doc.data() as Record<string, unknown>) } as Debt;
    const key = canon(d.bauleraCodigo);
    if (!key) return;
    if (!m.has(key)) m.set(key, { pendiente: null, pagadas: new Set<string>(), pagadasDetalle: [] });
    const e = m.get(key)!;
    if (d.status === 'paid') { e.pagadas.add(d.periodo); e.pagadasDetalle.push(d); }
    else if (d.status === 'pending') {
      // el pendiente más reciente gana (por si se regeneró el link)
      if (!e.pendiente || String(d.sentAt) > String(e.pendiente.sentAt)) e.pendiente = d;
    }
  });
  // más recientes primero, y con tope (la ficha no necesita el historial completo de años)
  for (const e of m.values()) {
    e.pagadasDetalle.sort((a, b) => String(b.paidAt || '').localeCompare(String(a.paidAt || '')));
    e.pagadasDetalle = e.pagadasDetalle.slice(0, 6);
  }
  return m;
}

// ¿Hay una deuda con link VIVO (pendiente) para esta baulera? — guard anti-doble-link del server.
export async function getPendingDebtByBaulera(bauleraCodigo: string): Promise<Debt | null> {
  const snap = await col()
    .where('bauleraCodigo', '==', canon(bauleraCodigo))
    .where('status', '==', 'pending')
    .get();
  if (snap.empty) return null;
  const debts = snap.docs.map((x) => ({ id: x.id, ...(x.data() as Record<string, unknown>) }) as Debt);
  debts.sort((a, b) => String(b.sentAt).localeCompare(String(a.sentAt)));
  return debts[0];
}
