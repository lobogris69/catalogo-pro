/**
 * Auth Middleware
 * Verifica JWT en requests autenticadas
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
  user?: {
    id: number;
    email: string;
    role: string;
    iat?: number;
    exp?: number;
  };
}

/**
 * Middleware para verificar JWT
 */
export function verifyToken(req: AuthRequest, res: Response, next: NextFunction): void {
  try {
    const token = extractToken(req);

    if (!token) {
      res.status(401).json({
        error: 'No token provided',
        code: 'NO_TOKEN',
      });
      return;
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_secret_change_me');

    req.user = decoded as any;

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({
        error: 'Token expired',
        code: 'TOKEN_EXPIRED',
      });
    } else if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({
        error: 'Invalid token',
        code: 'INVALID_TOKEN',
      });
    } else {
      res.status(500).json({
        error: 'Authentication error',
        code: 'AUTH_ERROR',
      });
    }
  }
}

/**
 * Middleware para verificar rol admin
 */
export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({
      error: 'Unauthorized',
      code: 'UNAUTHORIZED',
    });
    return;
  }

  if (req.user.role !== 'admin') {
    res.status(403).json({
      error: 'Access denied. Admin role required',
      code: 'FORBIDDEN',
    });
    return;
  }

  next();
}

/**
 * Middleware para verificar rol sales
 */
export function requireSales(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({
      error: 'Unauthorized',
      code: 'UNAUTHORIZED',
    });
    return;
  }

  if (req.user.role !== 'sales' && req.user.role !== 'admin') {
    res.status(403).json({
      error: 'Access denied. Sales role required',
      code: 'FORBIDDEN',
    });
    return;
  }

  next();
}

/**
 * Middleware opcional para verificar token (no falla si no existe)
 */
export function optionalToken(req: AuthRequest, res: Response, next: NextFunction): void {
  try {
    const token = extractToken(req);

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_secret_change_me');
      req.user = decoded as any;
    }

    next();
  } catch (error) {
    // Si hay error, continuamos sin autenticación
    next();
  }
}

/**
 * Extrae el token del header Authorization
 */
function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(' ');

  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  return parts[1];
}

/**
 * Error handler para autenticación
 */
export class AuthError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 401
  ) {
    super(message);
    this.name = 'AuthError';
  }
}
