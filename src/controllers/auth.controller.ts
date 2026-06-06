import { Request, Response, NextFunction } from "express";
import { authService } from "../services/auth.service";
import { AuthenticatedRequest } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { ErrorCode } from "../utils/errors";

/**
 * Admin login handler
 * POST /api/auth/login
 * Requirements: 8.1, 8.2
 */
export const login = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { email, password } = req.body;

    // Validate required fields
    if (!email || !password) {
      throw new AppError(
        400,
        ErrorCode.VALIDATION_REQUIRED_FIELD,
        "Email and password are required"
      );
    }

    const result = await authService.login(email, password);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Waiter login handler
 * POST /api/auth/waiter-login
 */
export const waiterLogin = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { name, password } = req.body;

    if (!name || !password) {
      throw new AppError(
        400,
        ErrorCode.VALIDATION_REQUIRED_FIELD,
        "Name and password are required"
      );
    }

    const result = await authService.waiterLogin(name, password);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Admin logout handler
 * POST /api/auth/logout
 * Requirements: 8.6
 */
export const logout = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (req.token) {
      await authService.logout(req.token);
    }

    res.json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get active waiters for selection
 * GET /api/auth/waiters
 * Requirements: 8.3, 8.4
 */
export const getWaiters = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const waiters = await authService.getActiveWaiters();

    res.json({
      success: true,
      data: waiters,
    });
  } catch (error) {
    next(error);
  }
};
