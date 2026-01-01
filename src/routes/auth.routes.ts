import { Router } from "express";
import { login, logout, getWaiters } from "../controllers/auth.controller";
import { authenticate, requireAdmin } from "../middleware/auth";

const router = Router();

/**
 * POST /api/auth/login
 * Admin authentication
 * Requirements: 8.1, 8.2
 */
router.post("/login", login);

/**
 * POST /api/auth/logout
 * Admin session invalidation (requires authentication)
 * Requirements: 8.6
 */
router.post("/logout", authenticate, requireAdmin, logout);

/**
 * GET /api/auth/waiters
 * List active waiters for selection (no auth required)
 * Requirements: 8.3, 8.4
 */
router.get("/waiters", getWaiters);

export default router;
