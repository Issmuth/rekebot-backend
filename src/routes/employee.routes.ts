import { Router } from "express";
import {
  getAllEmployees,
  getEmployeeById,
  createEmployee,
  updateEmployee,
  releaseEmployee,
} from "../controllers/employee.controller";
import { authenticate, requireAdmin } from "../middleware/auth";

const router = Router();

// All employee routes require admin authentication
router.use(authenticate, requireAdmin);

/**
 * GET /api/employees
 * List all employees with their current status
 * Requirements: 1.4
 */
router.get("/", getAllEmployees);

/**
 * GET /api/employees/:id
 * Get employee details with salary history
 * Requirements: 1.5
 */
router.get("/:id", getEmployeeById);

/**
 * POST /api/employees
 * Create a new employee
 * Requirements: 1.1
 */
router.post("/", createEmployee);

/**
 * PUT /api/employees/:id
 * Update employee information
 * Requirements: 1.2
 */
router.put("/:id", updateEmployee);

/**
 * DELETE /api/employees/:id
 * Release (soft delete) an employee
 * Requirements: 1.3
 */
router.delete("/:id", releaseEmployee);

export default router;
