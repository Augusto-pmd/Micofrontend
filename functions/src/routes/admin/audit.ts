import { Router, Response } from 'express';
import { requireAuth } from '../../middleware/requireAuth';
import { db } from '../../config/firebase';

export const adminAuditRouter = Router();

// GET /admin/audit?actor=&action=&from=&to=&limit=  — historial de acciones
adminAuditRouter.get('/', requireAuth, async (req, res: Response) => {
  try {
    const limit  = parseInt(req.query['limit'] as string) || 100;
    const actor  = (req.query['actor']  as string || '').toLowerCase();
    const action = (req.query['action'] as string || '').toLowerCase();
    const from   = req.query['from'] as string | undefined;  // 'YYYY-MM-DD'
    const to     = req.query['to']   as string | undefined;

    const snap = await db.collection('audit_log').orderBy('ts', 'desc').limit(800).get();
    let docs = snap.docs.map((d) => {
      const x = d.data();
      return {
        id: d.id,
        actor: x['actor'] || '',
        via: x['via'] || '',
        role: x['role'] || null,
        action: x['action'] || '',
        entity: x['entity'] || null,
        entityId: x['entityId'] || null,
        branchId: x['branchId'] || null,
        detail: x['detail'] || {},
        ts: x['ts']?.toDate?.()?.toISOString() || null,
      };
    });

    if (actor)  docs = docs.filter((r) => String(r.actor).toLowerCase().includes(actor));
    if (action) docs = docs.filter((r) => String(r.action).toLowerCase().includes(action));
    if (from)   docs = docs.filter((r) => r.ts && r.ts >= from);
    if (to)     docs = docs.filter((r) => r.ts && r.ts <= to + 'T23:59:59');

    res.json({ data: docs.slice(0, limit), total: docs.length });
  } catch (err) {
    console.error('GET /admin/audit error:', err);
    res.status(500).json({ error: 'Could not list audit log' });
  }
});
