import { Response, NextFunction } from "express";
import { notificationService } from "../services/notification.service";
import { AuthenticatedRequest } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { ErrorCode } from "../utils/errors";

/**
 * Get notification preferences for the authenticated admin
 * GET /api/notifications/preferences
 * Requirements: 5.1
 */
export const getPreferences = async (
  req: AuthenticatedRequest,
  res: Response,
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

    const preferences = await notificationService.getPreferences(req.user.id);

    res.json({
      success: true,
      data: preferences,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update notification preferences for the authenticated admin
 * PUT /api/notifications/preferences
 * Requirements: 5.1, 5.3
 */
export const updatePreferences = async (
  req: AuthenticatedRequest,
  res: Response,
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

    const { lowStock, largeOrders, employeeActions } = req.body;

    // Validate that at least one preference is provided
    if (
      lowStock === undefined &&
      largeOrders === undefined &&
      employeeActions === undefined
    ) {
      throw new AppError(
        400,
        ErrorCode.VALIDATION_REQUIRED_FIELD,
        "At least one preference must be provided"
      );
    }

    // Get current preferences to merge with updates
    const currentPrefs = await notificationService.getPreferences(req.user.id);

    const updatedPreferences = await notificationService.updatePreferences(
      req.user.id,
      {
        lowStock: lowStock !== undefined ? lowStock : currentPrefs.lowStock,
        largeOrders:
          largeOrders !== undefined ? largeOrders : currentPrefs.largeOrders,
        employeeActions:
          employeeActions !== undefined
            ? employeeActions
            : currentPrefs.employeeActions,
      }
    );

    res.json({
      success: true,
      data: updatedPreferences,
    });
  } catch (error) {
    next(error);
  }
};
