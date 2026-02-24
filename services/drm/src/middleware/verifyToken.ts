import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { publicKey } from "../keys";

declare global {
  namespace Express {
    interface Request {
      auth?: any;
    }
  }
}

export function verifyToken(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "MISSING_TOKEN", message: "Authorization header with Bearer token required" });
  }

  const token = authHeader.slice(7);

  try {
    const claims = jwt.verify(token, publicKey, { algorithms: ["RS256"] });
    req.auth = claims;
    next();
  } catch (err: any) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ error: "TOKEN_EXPIRED", message: "Token has expired" });
    }
    return res.status(401).json({ error: "INVALID_TOKEN", message: "Token verification failed" });
  }
}
