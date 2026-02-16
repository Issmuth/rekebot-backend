import { Response, NextFunction } from "express";
import { employeeService } from "../services/employee.service";
import { AuthenticatedRequest } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { ErrorCode } from "../utils/errors";

/**
 * Get all employees
 * GET /api/employees
 * Requirements: 1.4
 */
export const getAllEmployees = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const includeInactive = req.query.includeInactive !== "false";
    const employees = await employeeService.findAll(includeInactive);

    res.json({
      success: true,
      data: employees,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get employee by ID with salary history
 * GET /api/employees/:id
 * Requirements: 1.5
 */
export const getEmployeeById = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const employee = await employeeService.findById(id);

    if (!employee) {
      throw new AppError(404, ErrorCode.NOT_FOUND_USER, "Employee not found");
    }

    res.json({
      success: true,
      data: employee,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create a new employee
 * POST /api/employees
 * Requirements: 1.1
 */
export const createEmployee = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { email, password, name, nameAm, role, salary, phone } = req.body;

    // Validate required fields
    if (!email || !password || !name || !role) {
      throw new AppError(
        400,
        ErrorCode.VALIDATION_REQUIRED_FIELD,
        "Email, password, name, and role are required"
      );
    }

    // Validate role
    if (role !== "ADMIN" && role !== "EMPLOYEE") {
      throw new AppError(
        400,
        ErrorCode.VALIDATION_INVALID_FORMAT,
        "Role must be ADMIN or EMPLOYEE"
      );
    }

    const employee = await employeeService.create({
      email,
      password,
      name,
      nameAm,
      role,
      salary,
      phone,
    });

    res.status(201).json({
      success: true,
      data: employee,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update an employee
 * PUT /api/employees/:id
 * Requirements: 1.2
 */
export const updateEmployee = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const { name, nameAm, salary, phone, isActive } = req.body;

    const employee = await employeeService.update(id, {
      name,
      nameAm,
      salary,
      phone,
      isActive,
    });

    res.json({
      success: true,
      data: employee,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Release (soft delete) an employee
 * DELETE /api/employees/:id
 * Requirements: 1.3
 */
export const releaseEmployee = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const releaseDate = req.body.releaseDate
      ? new Date(req.body.releaseDate)
      : new Date();

    const employee = await employeeService.release(id, releaseDate);

    res.json({
      success: true,
      data: employee,
      message: "Employee released successfully",
    });
  } catch (error) {
    next(error);
  }
};
