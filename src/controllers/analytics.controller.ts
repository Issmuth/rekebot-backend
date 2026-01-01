import { Response, NextFunction } from "express";
import { analyticsService } from "../services/analytics.service";
import { AuthenticatedRequest } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { ErrorCode } from "../utils/errors";

/**
 * Get dashboard aggregated data
 * GET /api/analytics/dashboard
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
 */
export const getDashboard = async (
  _req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const dashboard = await analyticsService.getDashboard();

    res.json({
      success: true,
      data: dashboard,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get weekly consumption per ingredient
 * GET /api/analytics/consumption
 * Requirements: 6.1
 */
export const getConsumption = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { ingredientId } = req.query;

    const consumption = await analyticsService.getWeeklyConsumption(
      ingredientId as string | undefined
    );

    res.json({
      success: true,
      data: consumption,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get top ordered menu items
 * GET /api/analytics/top-items
 * Requirements: 6.2
 */
export const getTopItems = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const startDate = req.query.startDate
      ? new Date(req.query.startDate as string)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Default: last 30 days
    const endDate = req.query.endDate
      ? new Date(req.query.endDate as string)
      : new Date();

    // Validate dates
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      throw new AppError(
        400,
        ErrorCode.VALIDATION_INVALID_FORMAT,
        "Invalid date format"
      );
    }

    const topItems = await analyticsService.getTopItems(limit, {
      start: startDate,
      end: endDate,
    });

    res.json({
      success: true,
      data: topItems,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get revenue for a time period
 * GET /api/analytics/revenue
 * Requirements: 6.3, 6.4
 */
export const getRevenue = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const period = (req.query.period as string) || "monthly";

    let startDate: Date;
    const endDate = new Date();

    switch (period) {
      case "daily":
        startDate = new Date(
          endDate.getFullYear(),
          endDate.getMonth(),
          endDate.getDate()
        );
        break;
      case "weekly":
        startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - 7);
        break;
      case "monthly":
      default:
        startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - 30);
        break;
    }

    // Allow custom date range override
    if (req.query.startDate) {
      startDate = new Date(req.query.startDate as string);
    }
    if (req.query.endDate) {
      const customEndDate = new Date(req.query.endDate as string);
      if (!isNaN(customEndDate.getTime())) {
        endDate.setTime(customEndDate.getTime());
      }
    }

    // Validate dates
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      throw new AppError(
        400,
        ErrorCode.VALIDATION_INVALID_FORMAT,
        "Invalid date format"
      );
    }

    const revenue = await analyticsService.getRevenue({
      start: startDate,
      end: endDate,
    });

    res.json({
      success: true,
      data: {
        ...revenue,
        period,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get peak ordering hours
 * GET /api/analytics/peak-hours
 * Requirements: 6.5
 */
export const getPeakHours = async (
  _req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const peakHours = await analyticsService.getPeakHours();

    res.json({
      success: true,
      data: peakHours,
    });
  } catch (error) {
    next(error);
  }
};
