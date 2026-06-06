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
 * Get employee tips summary
 * GET /api/employees/:id/tips
 */
export const getEmployeeTipsSummary = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const { startDate, endDate } = req.query;

    const filters: { startDate?: Date; endDate?: Date } = {};

    if (startDate && typeof startDate === "string") {
      const parsedStartDate = new Date(startDate);
      if (isNaN(parsedStartDate.getTime())) {
        throw new AppError(
          400,
          ErrorCode.VALIDATION_INVALID_FORMAT,
          "Invalid startDate format"
        );
      }
      filters.startDate = parsedStartDate;
    }

    if (endDate && typeof endDate === "string") {
      const parsedEndDate = new Date(endDate);
      if (isNaN(parsedEndDate.getTime())) {
        throw new AppError(
          400,
          ErrorCode.VALIDATION_INVALID_FORMAT,
          "Invalid endDate format"
        );
      }
      filters.endDate = parsedEndDate;
    }

    const summary = await employeeService.getTipsSummary(id, filters);

    res.json({
      success: true,
      data: summary,
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
    const { email, password, pin, name, nameAm, role, salary, phone } = req.body;

    // Validate required fields
    if (!email || !name || !role) {
      throw new AppError(
        400,
        ErrorCode.VALIDATION_REQUIRED_FIELD,
        "Email, name, and role are required"
      );
    }

    // Validate role
    if (role !== "ADMIN" && role !== "CASHIER" && role !== "EMPLOYEE") {
      throw new AppError(
        400,
        ErrorCode.VALIDATION_INVALID_FORMAT,
        "Role must be ADMIN, CASHIER, or EMPLOYEE"
      );
    }

    if ((role === "ADMIN" || role === "CASHIER") && !password) {
      throw new AppError(
        400,
        ErrorCode.VALIDATION_REQUIRED_FIELD,
        "Password is required for admin and cashier accounts"
      );
    }

    if (role === "EMPLOYEE" && !pin) {
      throw new AppError(
        400,
        ErrorCode.VALIDATION_REQUIRED_FIELD,
        "PIN is required for employee accounts"
      );
    }

    const employee = await employeeService.create({
      email,
      password,
      pin,
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
 * Change an employee PIN
 * PUT /api/employees/:id/pin
 */
export const changeEmployeePin = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const { pin, password } = req.body;
    const resolvedPin = typeof pin === "string" ? pin : password;

    if (!resolvedPin) {
      throw new AppError(
        400,
        ErrorCode.VALIDATION_REQUIRED_FIELD,
        "PIN is required"
      );
    }

    await employeeService.changePin(id, resolvedPin);

    res.json({
      success: true,
      message: "PIN updated successfully",
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
