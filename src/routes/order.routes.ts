import { Router } from "express";
import { uploadReceipt as uploadMiddleware } from "../middleware/upload";
import {
  getAllOrders,
  getOrderById,
  createOrder,
  updateOrder,
  cancelOrder,
  confirmPayment,
  uploadReceipt,
  verifyOrder,
} from "../controllers/order.controller";

const router = Router();

/**
 * GET /api/orders
 * List all orders (admin can see all, employees see their own)
 * Requirements: 3.1
 */
router.get("/", getAllOrders);

/**
 * GET /api/orders/:id
 * Get a specific order by ID
 */
router.get("/:id", getOrderById);

/**
 * POST /api/orders
 * Create a new order (employee)
 * Requirements: 3.1, 3.2, 3.3
 */
router.post("/", createOrder);

/**
 * PUT /api/orders/:id
 * Update an order (employee, if unpaid)
 * Requirements: 3.4
 */
router.put("/:id", updateOrder);

/**
 * DELETE /api/orders/:id
 * Cancel an order (employee, if unpaid)
 * Requirements: 3.4
 */
router.delete("/:id", cancelOrder);

/**
 * POST /api/orders/:id/confirm
 * Confirm payment for an order (employee)
 * Requirements: 3.5, 3.6, 3.7
 */
router.post(
  "/:id/confirm",
  uploadMiddleware.single("receiptImage"),
  confirmPayment
);

/**
 * POST /api/orders/:id/receipt
 * Upload receipt for an order
 * Requirements: 3.7, 3.8
 */
router.post(
  "/:id/receipt",
  uploadMiddleware.single("receiptImage"),
  uploadReceipt
);

/**
 * POST /api/orders/:id/verify
 * Verify order (admin)
 */
router.post("/:id/verify", verifyOrder);

export default router;
