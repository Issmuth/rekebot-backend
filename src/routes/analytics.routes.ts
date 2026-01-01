import { Router } from "express";
import {
  getDashboard,
  getConsumption,
  getTopItems,
  getRevenue,
  getPeakHours,
} from "../controllers/analytics.controller";
import { authenticate, requireAdmin } from "../middleware/auth";

const router = Router();

/**
 * GET /api/analytics/dashboard
 * Get dashboard aggregated data (admin only)
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
 */
router.get("/dashboard", authenticate, requireAdmin, getDashboard);

/**
 * GET /api/analytics/consumption
 * Get weekly consumption per ingredient (admin only)
 * Query params: ingredientId (optional)
 * Requirements: 6.1
 */
router.get("/consumption", authenticate, requireAdmin, getConsumption);

/**
 * GET /api/analytics/top-items
 * Get top ordered menu items (admin only)
 * Query params: limit (default: 10), startDate, endDate
 * Requirements: 6.2
 */
router.get("/top-items", authenticate, requireAdmin, getTopItems);

/**
 * GET /api/analytics/revenue
 * Get revenue for a time period (admin only)
 * Query params: period (daily|weekly|monthly), startDate, endDate
 * Requirements: 6.3, 6.4
 */
router.get("/revenue", authenticate, requireAdmin, getRevenue);

/**
 * GET /api/analytics/peak-hours
 * Get peak ordering hours (admin only)
 * Requirements: 6.5
 */
router.get("/peak-hours", authenticate, requireAdmin, getPeakHours);

export default router;
