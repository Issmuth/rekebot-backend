import { Router } from "express";
import {
  getAllEmployees,
  getEmployeeById,
  getEmployeeTipsSummary,
  createEmployee,
  updateEmployee,
  changeEmployeePin,
  releaseEmployee,
} from "../controllers/employee.controller";
import { authenticate, requireAdmin, requireAdminAccess } from "../middleware/auth";

const router = Router();

/**
 * GET /api/employees
 * List all employees with their current status
 * Requirements: 1.4
 */
router.get("/", authenticate, requireAdminAccess, getAllEmployees);

/**
 * GET /api/employees/:id/tips
 * Get waiter tips summary with optional date filtering
 */
router.get("/:id/tips", authenticate, requireAdminAccess, getEmployeeTipsSummary);

/**
 * GET /api/employees/:id
 * Get employee details with salary history
 * Requirements: 1.5
 */
router.get("/:id", authenticate, requireAdminAccess, getEmployeeById);

/**
 * POST /api/employees
 * Create a new employee
 * Requirements: 1.1
 */
router.post("/", authenticate, requireAdmin, createEmployee);

/**
 * PUT /api/employees/:id
 * Update employee information
 * Requirements: 1.2
 */
router.put("/:id", authenticate, requireAdmin, updateEmployee);

/**
 * PUT /api/employees/:id/pin
 * Change employee PIN
 */
router.put("/:id/pin", authenticate, requireAdmin, changeEmployeePin);

/**
 * PUT /api/employees/:id/password
 * Legacy alias for PIN updates (backward compatibility)
 */
router.put("/:id/password", authenticate, requireAdmin, changeEmployeePin);

/**
 * DELETE /api/employees/:id
 * Release (soft delete) an employee
 * Requirements: 1.3
 */
router.delete("/:id", authenticate, requireAdmin, releaseEmployee);

export default router;
