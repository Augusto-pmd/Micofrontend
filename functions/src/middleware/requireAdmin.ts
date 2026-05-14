import { Request, Response, NextFunction } from 'express';
import { auth } from '../config/firebase';
import { AuthenticatedRequest } from './requireAuth';

/**
 * Verifies that the token has Custom Claim role: 'admin'.
 * Must be used AFTER requireAuth.
 */
export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const uid = (req as AuthenticatedRequest).uid;

  if (!uid) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  try {
    const user = await auth.getUser(uid);
    const claims = user.customClaims as { role?: string } | undefined;

    if (claims?.role !== 'admin') {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    next();
  } catch {
    res.status(403).json({ error: 'Could not verify admin role' });
  }
}
