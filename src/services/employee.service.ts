import bcrypt from "bcryptjs";
import prisma from "../lib/prisma";
import { CreateEmployeeDTO, UpdateEmployeeDTO, Role } from "../types";
import { ErrorCode, notFoundError, validationError } from "../utils/errors";
import { Decimal } from "@prisma/client/runtime/library";

export interface Employee {
  id: string;
  email: string;
  name: string;
  nameAm?: string | null;
  role: Role;
  salary: number | null;
  hireDate: Date;
  releaseDate: Date | null;
  isActive: boolean;
  phone: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface EmployeeWithHistory extends Employee {
  salaryHistory: SalaryHistoryEntry[];
}

export interface SalaryHistoryEntry {
  id: string;
  salary: number;
  createdAt: Date;
}

export class EmployeeService {
  /**
   * Create a new employee
   * Requirements: 1.1
   */
  async create(data: CreateEmployeeDTO): Promise<Employee> {
    // Validate required fields
    if (!data.email || !data.password || !data.name || !data.role) {
      throw validationError("Email, password, name, and role are required");
    }

    // Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(data.password, saltRounds);

    // Create employee with initial salary history if salary provided
    const employee = await prisma.user.create({
      data: {
        email: data.email,
        passwordHash,
        name: data.name,
        nameAm: data.nameAm,
        role: data.role,
        salary: data.salary,
        hireDate: new Date(),
        phone: data.phone,
        // Create initial salary history entry if salary is provided
        ...(data.salary !== undefined && {
          salaryHistory: {
            create: {
              salary: data.salary,
            },
          },
        }),
      },
    });

    return this.mapToEmployee(employee);
  }

  /**
   * Update an employee's information
   * Requirements: 1.2
   */
  async update(id: string, data: UpdateEmployeeDTO): Promise<Employee> {
    // Check if employee exists
    const existing = await prisma.user.findUnique({
      where: { id },
    });

    if (!existing) {
      throw notFoundError(ErrorCode.NOT_FOUND_USER, "Employee not found");
    }

    // If salary is being updated, create a salary history entry
    const salaryChanged =
      data.salary !== undefined &&
      (existing.salary === null || Number(existing.salary) !== data.salary);

    const employee = await prisma.user.update({
      where: { id },
      data: {
        ...(data.nameAm !== undefined && { nameAm: data.nameAm }),
        ...(data.name !== undefined && { name: data.name }),
        ...(data.salary !== undefined && { salary: data.salary }),
        ...(data.phone !== undefined && { phone: data.phone }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        // Create salary history entry if salary changed
        ...(salaryChanged && {
          salaryHistory: {
            create: {
              salary: data.salary!,
            },
          },
        }),
      },
    });

    return this.mapToEmployee(employee);
  }

  /**
   * Release an employee (soft delete with release date)
   * Requirements: 1.3
   */
  async release(id: string, releaseDate: Date = new Date()): Promise<Employee> {
    // Check if employee exists
    const existing = await prisma.user.findUnique({
      where: { id },
    });

    if (!existing) {
      throw notFoundError(ErrorCode.NOT_FOUND_USER, "Employee not found");
    }

    const employee = await prisma.user.update({
      where: { id },
      data: {
        isActive: false,
        releaseDate,
      },
    });

    return this.mapToEmployee(employee);
  }

  /**
   * Find all employees
   * Requirements: 1.4
   */
  async findAll(includeInactive: boolean = true): Promise<Employee[]> {
    const employees = await prisma.user.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { name: "asc" },
    });

    return employees.map(this.mapToEmployee);
  }

  /**
   * Find employee by ID with salary history
   * Requirements: 1.5
   */
  async findById(id: string): Promise<EmployeeWithHistory | null> {
    const employee = await prisma.user.findUnique({
      where: { id },
      include: {
        salaryHistory: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!employee) {
      return null;
    }

    return {
      ...this.mapToEmployee(employee),
      salaryHistory: employee.salaryHistory.map((sh) => ({
        id: sh.id,
        salary: Number(sh.salary),
        createdAt: sh.createdAt,
      })),
    };
  }

  /**
   * Map Prisma User to Employee type
   */
  private mapToEmployee(user: {
    id: string;
    email: string;
    name: string;
    role: Role;
    salary: Decimal | null;
    hireDate: Date;
    releaseDate: Date | null;
    isActive: boolean;
    phone: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): Employee {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      salary: user.salary ? Number(user.salary) : null,
      hireDate: user.hireDate,
      releaseDate: user.releaseDate,
      isActive: user.isActive,
      phone: user.phone,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}

// Export singleton instance
export const employeeService = new EmployeeService();
