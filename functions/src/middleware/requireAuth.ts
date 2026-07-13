import { Request, Response, NextFunction } from 'express';
import { auth } from '../config/firebase';

export interface AuthenticatedRequest extends Request {
  uid: string;
  email: string;
  // ¿El email del token está verificado? (Google Workspace @micontainer.com => true.
  // Un email+password self-service recién creado => false hasta clickear el mail.)
  // requireStaff lo usa para no dejar entrar a un `loquesea@micontainer.com` falso.
  emailVerified: boolean;
}

/**
 * Optional auth: tries to verify the Firebase JWT.
 * If valid, attaches uid and email to request.
 * If missing or invalid, continues as guest (uid/email will be empty strings).
 */
export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  // En el emulador local: identidad de prueba, sin verificar token.
  if (process.env.FUNCTIONS_EMULATOR === 'true') {
    (req as AuthenticatedRequest).uid = (req as AuthenticatedRequest).uid || 'emulator-user';
    (req as AuthenticatedRequest).email = (req as AuthenticatedRequest).email || 'emulator@local';
    (req as AuthenticatedRequest).emailVerified = true;
    next();
    return;
  }
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    const token = header.slice('Bearer '.length);
    try {
      const decoded = await auth.verifyIdToken(token);
      (req as AuthenticatedRequest).uid   = decoded.uid;
      (req as AuthenticatedRequest).email = decoded.email ?? '';
      (req as AuthenticatedRequest).emailVerified = decoded.email_verified ?? false;
    } catch {
      // token inválido → continuar como guest
    }
  }
  next();
}

/**
 * Verifies the Firebase JWT in the Authorization header.
 * If valid, attaches uid and email to request and calls next().
 * If not, responds 401.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // En el emulador local: admin de prueba, sin verificar token.
  if (process.env.FUNCTIONS_EMULATOR === 'true') {
    (req as AuthenticatedRequest).uid = 'emulator-admin';
    (req as AuthenticatedRequest).email = 'admin@local';
    (req as AuthenticatedRequest).emailVerified = true;
    next();
    return;
  }
  const header = req.headers.authorization;

  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }

  const token = header.slice('Bearer '.length);

  try {
    const decoded = await auth.verifyIdToken(token);
    (req as AuthenticatedRequest).uid = decoded.uid;
    (req as AuthenticatedRequest).email = decoded.email ?? '';
    (req as AuthenticatedRequest).emailVerified = decoded.email_verified ?? false;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
