import { Router } from "express";
import {
  getAllMenuItems,
  getMenuItemById,
  getMenuAvailability,
  getMenuItemStats,
  getMenuItemStatsForDate,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
} from "../controllers/menu.controller";
import { authenticate, requireAdmin } from "../middleware/auth";
import { uploadMenuImage } from "../middleware/upload";

const router = Router();

/**
 * GET /api/menu/availability
 * Get menu items with availability status based on stock
 * Requirements: 7.1, 7.3, 7.4
 * Note: This route must be defined before /:id to avoid conflicts
 */
router.get("/availability", getMenuAvailability);

/**
 * GET /api/menu
 * List all menu items organized by category
 * Requirements: 2.4
 */
router.get("/", getAllMenuItems);

/**
 * GET /api/menu/:id/stats
 * Get sales statistics for a menu item
 */
router.get("/:id/stats", authenticate, requireAdmin, getMenuItemStats);

/**
 * GET /api/menu/:id/stats/date
 * Get sales statistics for a specific date
 */
router.get(
  "/:id/stats/date",
  authenticate,
  requireAdmin,
  getMenuItemStatsForDate
);

/**
 * GET /api/menu/:id
 * Get a specific menu item by ID
 */
router.get("/:id", getMenuItemById);

/**
 * POST /api/menu
 * Create a new menu item (admin only)
 * Requirements: 2.1, 2.5
 */
router.post(
  "/",
  authenticate,
  requireAdmin,
  uploadMenuImage.single("image"),
  createMenuItem
);

/**
 * PUT /api/menu/:id
 * Update a menu item (admin only)
 * Requirements: 2.2, 2.5
 */
router.put(
  "/:id",
  authenticate,
  requireAdmin,
  uploadMenuImage.single("image"),
  updateMenuItem
);

/**
 * DELETE /api/menu/:id
 * Soft delete a menu item (admin only)
 * Requirements: 2.3
 */
router.delete("/:id", authenticate, requireAdmin, deleteMenuItem);

export default router;
