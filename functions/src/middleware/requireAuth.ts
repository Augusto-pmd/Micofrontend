import { Request, Response, NextFunction } from 'express';
import { auth } from '../config/firebase';

export interface AuthenticatedRequest extends Request {
  uid: string;
  email: string;
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
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
