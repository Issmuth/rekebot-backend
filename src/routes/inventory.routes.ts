import { Router } from "express";
import {
  getAllIngredients,
  getIngredientById,
  getLowStockIngredients,
  createIngredient,
  updateIngredient,
  deleteIngredient,
  updateStock,
  checkAvailability,
  getInventoryHistory,
} from "../controllers/inventory.controller";
import { authenticate, requireAdmin, requireAdminAccess } from "../middleware/auth";

const router = Router();

/**
 * GET /api/ingredients/history
 * Get inventory history/transactions
 * Requirements: 4.4
 * Note: This route must be defined before /:id to avoid conflicts
 */
router.get("/history", authenticate, requireAdminAccess, getInventoryHistory);

/**
 * GET /api/ingredients/low-stock
 * Get ingredients below minimum threshold
 * Requirements: 4.3
 * Note: This route must be defined before /:id to avoid conflicts
 */
router.get("/low-stock", authenticate, requireAdminAccess, getLowStockIngredients);

/**
 * GET /api/ingredients/availability/:menuItemId
 * Check availability for a menu item
 * Requirements: 7.1, 7.3
 */
router.get("/availability/:menuItemId", checkAvailability);

/**
 * GET /api/ingredients
 * List all ingredients
 * Requirements: 4.4
 */
router.get("/", authenticate, requireAdminAccess, getAllIngredients);

/**
 * GET /api/ingredients/:id
 * Get a specific ingredient by ID with stock adjustments
 */
router.get("/:id", authenticate, requireAdminAccess, getIngredientById);

/**
 * POST /api/ingredients
 * Create a new ingredient (admin only)
 * Requirements: 4.1
 */
router.post("/", authenticate, requireAdmin, createIngredient);

/**
 * PUT /api/ingredients/:id
 * Update an ingredient (admin only)
 * Requirements: 4.1
 */
router.put("/:id", authenticate, requireAdmin, updateIngredient);

/**
 * DELETE /api/ingredients/:id
 * Delete an ingredient (admin only)
 */
router.delete("/:id", authenticate, requireAdmin, deleteIngredient);

/**
 * POST /api/ingredients/:id/stock
 * Update stock level with adjustment tracking (admin only)
 * Requirements: 4.2
 */
router.post("/:id/stock", authenticate, requireAdmin, updateStock);

export default router;
