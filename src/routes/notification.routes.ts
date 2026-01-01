import { Router } from "express";
import {
  getPreferences,
  updatePreferences,
} from "../controllers/notification.controller";
import { authenticate, requireAdmin } from "../middleware/auth";

const router = Router();

/**
 * GET /api/notifications/preferences
 * Get notification preferences for the authenticated admin
 * Requirements: 5.1
 */
router.get("/preferences", authenticate, requireAdmin, getPreferences);

/**
 * PUT /api/notifications/preferences
 * Update notification preferences for the authenticated admin
 * Requirements: 5.1, 5.3
 */
router.put("/preferences", authenticate, requireAdmin, updatePreferences);

export default router;
