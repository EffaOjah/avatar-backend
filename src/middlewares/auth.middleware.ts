import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "super_secret_jwt_key_here";

export interface AuthRequest extends Request {
  user?: {
    id: string;
    role: string;
  };
}

export const authenticate = (req: AuthRequest, res: Response, next: NextFunction): void => {
  const token = req.cookies?.accessToken || req.headers.authorization?.split(" ")[1];

  if (!token) {
    res.status(401).json({ error: "Unauthorized", message: "No token provided" });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string; role: string };
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: "Unauthorized", message: "Invalid or expired token" });
  }
};

export const authorizeRoles = (...allowedRoles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized", message: "Not authenticated" });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({ error: "Forbidden", message: "Insufficient permissions" });
      return;
    }

    next();
  };
};
