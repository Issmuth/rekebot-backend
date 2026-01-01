import { Request, Response, NextFunction } from "express";
import { AppError } from "./errorHandler";
import { authService } from "../services/auth.service";
import { ErrorCode } from "../utils/errors";

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: "ADMIN" | "EMPLOYEE";
  };
  token?: string;
}

/**
 * Authentication middleware - validates JWT token
 * Requirements: 8.5, 8.6
 */
export const authenticate = async (
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new AppError(
        401,
        ErrorCode.AUTH_INVALID_CREDENTIALS,
        "No authentication token provided"
      );
    }

    const token = authHeader.substring(7); // Remove "Bearer " prefix
    const payload = await authService.validateToken(token);

    if (!payload) {
      throw new AppError(
        401,
        ErrorCode.AUTH_TOKEN_EXPIRED,
        "Invalid or expired token"
      );
    }

    // Attach user info and token to request
    req.user = {
      id: payload.userId,
      email: payload.email,
      role: payload.role,
    };
    req.token = token;

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Admin-only middleware - requires authenticated admin user
 * Requirements: 8.5
 */
export const requireAdmin = async (
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError(
        401,
        ErrorCode.AUTH_INVALID_CREDENTIALS,
        "Authentication required"
      );
    }

    if (req.user.role !== "ADMIN") {
      throw new AppError(
        403,
        ErrorCode.FORBIDDEN_ADMIN_ONLY,
        "Admin access required"
      );
    }

    next();
  } catch (error) {
    next(error);
  }
};
