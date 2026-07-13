import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: { id: string; role: string; name: string };
    }
  }
}

// Minimal dev-friendly auth: the authenticated user is resolved from an
// `x-user-id` header (set by the frontend after login). Swap this for real
// session/JWT verification once an identity provider is chosen - every
// downstream route already reads req.user, not the header, so that change
// is isolated to this file.
export async function attachUser(req: Request, _res: Response, next: NextFunction) {
  const headerUserId = req.header("x-user-id");
  if (headerUserId) {
    const user = await prisma.user.findUnique({ where: { id: headerUserId } });
    if (user) req.user = { id: user.id, role: user.role, name: user.name };
  }
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: "Nicht angemeldet" });
  next();
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "Nicht angemeldet" });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: "Keine Berechtigung" });
    next();
  };
}
