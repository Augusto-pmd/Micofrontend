import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './requireAuth';

// Emails de staff autorizados a operaciones sensibles de dinero
// (cambio de valor a suscripciones existentes). Los clientes del portal
// tienen token Firebase valido pero NO estan en esta lista => no pueden.
// Se puede ampliar con la env STAFF_EMAILS (emails separados por coma).
const DEFAULT_STAFF = [
  'augustomn29@gmail.com',
  'am@micontainer.com',
  'amorporloshierros@gmail.com',
  'comercial@micontainer.com',
  'gf@micontainer.com',
  'info@micontainer.com',
  'micontainer.storage@gmail.com',
  'info@pmdarquitectura.com',
  'l.lanzalot@pmdarquitectura.com',
  'admin@local',
];

function staffSet(): Set<string> {
  const extra = (process.env.STAFF_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return new Set([...DEFAULT_STAFF.map((e) => e.toLowerCase()), ...extra]);
}

/** ¿El email pertenece al staff? REGLA UNIFICADA (12/07): allowlist + env STAFF_EMAILS +
 *  cualquier casilla @micontainer.com (antes el front aceptaba el dominio pero el backend no
 *  → un @micontainer.com podía loguear y recibir 403 en todo). FUENTE ÚNICA de verdad:
 *  el front consulta POST /auth/is-staff en el login en vez de su lista local. */
export function isStaffEmail(email: string): boolean {
  const e = String(email || '').toLowerCase().trim();
  if (!e) return false;
  return e.endsWith('@micontainer.com') || staffSet().has(e);
}

/** Lista de emails de la allowlist (para la pantalla de usuarios del panel). */
export function staffEmails(): string[] {
  return [...staffSet()].sort();
}

/**
 * Debe usarse DESPUES de verifyToken (que setea req.email).
 * Permite solo a emails de staff. Clientes del portal => 403.
 */
export function requireStaff(req: Request, res: Response, next: NextFunction): void {
  if (process.env.FUNCTIONS_EMULATOR === 'true') { next(); return; }
  const areq = req as AuthenticatedRequest;
  const email = String(areq.email || '').toLowerCase();
  // (1) Allowlist explícita (emails conocidos): pasan sin más. Un atacante NO puede registrar
  // estos emails en Firebase Auth porque ya existen (unicidad de email en Auth).
  if (staffSet().has(email)) { next(); return; }
  // (2) Dominio @micontainer.com: SOLO con el email VERIFICADO. Cierra el agujero de que
  // alguien se registre un `loquesea@micontainer.com` self-service (no puede verificar una
  // casilla que no es suya) y caiga como staff. Google Workspace @micontainer.com ya viene
  // verificado, así que el staff real no se ve afectado.
  if (email.endsWith('@micontainer.com') && areq.emailVerified === true) { next(); return; }
  res.status(403).json({ error: 'Solo personal autorizado.' });
}
