import { db } from '../config/firebase';
import { Timestamp } from 'firebase-admin/firestore';

export interface AuditInput {
  actor: string;                    // email/uid de quien ejecuta
  via?: string;                     // 'admin' | 'chat' | 'web' | 'sistema'
  role?: string;                    // operador | admin | bot_operator
  action: string;                   // 'venta_manual' | 'reasignar_baulera' | ...
  entity?: string;                  // 'reservation' | 'storageRoom' | 'pricing'
  entityId?: string;
  branchId?: string;
  detail?: Record<string, unknown>;
}

// Registra una accion en audit_log. NUNCA rompe la operacion principal:
// si falla la auditoria, loguea y sigue.
export async function logAudit(input: AuditInput): Promise<void> {
  try {
    await db.collection('audit_log').add({
      actor: input.actor || 'desconocido',
      via: input.via || 'admin',
      role: input.role || null,
      action: input.action,
      entity: input.entity || null,
      entityId: input.entityId || null,
      branchId: input.branchId || null,
      detail: input.detail || {},
      ts: Timestamp.now(),
    });
  } catch (err) {
    console.error('[audit] no se pudo registrar la accion:', err);
  }
}
