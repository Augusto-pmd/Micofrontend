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
  status: 'pending' | 'paid';
  sentAt: string;
  sentBy?: string | null;
  mpPreferenceId?: string | null;
  initPoint?: string | null;
  paidAt?: string | null;
  mpPaymentId?: string | null;
  email?: string | null;
  cliente?: string | null;
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

// Estado de deuda por baulera (para cruzar con el titileo de Inventario):
//  - pagadas: set de períodos 'YYYY-MM' ya saldados por pago único → NO deben titilar naranja.
//  - pendiente: la deuda con link enviado y aún sin pagar (la más reciente) → titila VIOLETA.
export interface DebtEstado { pendiente: Debt | null; pagadas: Set<string> }
export async function debtsByBaulera(): Promise<Map<string, DebtEstado>> {
  const snap = await col().get();
  const m = new Map<string, DebtEstado>();
  snap.forEach((doc) => {
    const d = { id: doc.id, ...(doc.data() as Record<string, unknown>) } as Debt;
    const key = canon(d.bauleraCodigo);
    if (!key) return;
    if (!m.has(key)) m.set(key, { pendiente: null, pagadas: new Set<string>() });
    const e = m.get(key)!;
    if (d.status === 'paid') { e.pagadas.add(d.periodo); }
    else if (d.status === 'pending') {
      // el pendiente más reciente gana (por si se regeneró el link)
      if (!e.pendiente || String(d.sentAt) > String(e.pendiente.sentAt)) e.pendiente = d;
    }
  });
  return m;
}
