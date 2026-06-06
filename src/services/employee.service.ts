import bcrypt from "bcryptjs";
import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { orders, salaryHistory, users } from "../db/schema";
import { db } from "../lib/drizzle";
import { randomUUID } from "crypto";
import { CreateEmployeeDTO, UpdateEmployeeDTO, Role } from "../types";
import { ErrorCode, notFoundError, validationError } from "../utils/errors";

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

export interface EmployeeTipsSummary {
  totalTips: number;
  tippedOrders: number;
}

export class EmployeeService {
  /**
   * Create a new employee
   * Requirements: 1.1
   */
  async create(data: CreateEmployeeDTO): Promise<Employee> {
    // Validate required fields
    if (!data.email || !data.name || !data.role) {
      throw validationError("Email, name, and role are required");
    }

    if (data.role === "ADMIN" || data.role === "CASHIER") {
      if (!data.password || data.password.trim().length < 6) {
        throw validationError(
          "Admin and cashier passwords must be at least 6 characters"
        );
      }
    }

    if (data.role === "EMPLOYEE") {
      if (!data.pin || !/^\d{4}$/.test(data.pin.trim())) {
        throw validationError("Employee PIN must be exactly 4 digits");
      }
    }

    const credential =
      data.role === "EMPLOYEE" ? data.pin! : data.password!;

    // Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(credential, saltRounds);

    // Create employee with initial salary history if salary provided
    const employee = await db.transaction(async (tx) => {
      const now = new Date();
      const [created] = await tx
        .insert(users)
        .values({
          id: randomUUID(),
          email: data.email,
          passwordHash,
          name: data.name,
          nameAm: data.nameAm,
          role: data.role,
          salary:
            data.salary !== undefined && data.salary !== null
              ? String(data.salary)
              : null,
          hireDate: now,
          phone: data.phone,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      if (data.salary !== undefined) {
        await tx.insert(salaryHistory).values({
          id: randomUUID(),
          userId: created.id,
          salary: String(data.salary),
          createdAt: now,
        });
      }

      return created;
    });

    return this.mapToEmployee(employee);
  }

  /**
   * Update an employee's information
   * Requirements: 1.2
   */
  async update(id: string, data: UpdateEmployeeDTO): Promise<Employee> {
    // Check if employee exists
    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (!existing) {
      throw notFoundError(ErrorCode.NOT_FOUND_USER, "Employee not found");
    }

    // If salary is being updated, create a salary history entry
    const salaryChanged =
      data.salary !== undefined &&
      (existing.salary === null || Number(existing.salary) !== data.salary);

    const employee = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(users)
        .set({
          ...(data.nameAm !== undefined ? { nameAm: data.nameAm } : {}),
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.salary !== undefined ? { salary: String(data.salary) } : {}),
          ...(data.phone !== undefined ? { phone: data.phone } : {}),
          ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
          updatedAt: new Date(),
        })
        .where(eq(users.id, id))
        .returning();

      if (salaryChanged && data.salary !== undefined) {
        await tx.insert(salaryHistory).values({
          id: randomUUID(),
          userId: id,
          salary: String(data.salary),
          createdAt: new Date(),
        });
      }

      return updated;
    });

    return this.mapToEmployee(employee);
  }

  /**
   * Release an employee (soft delete with release date)
   * Requirements: 1.3
   */
  async release(id: string, releaseDate: Date = new Date()): Promise<Employee> {
    // Check if employee exists
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (!existing) {
      throw notFoundError(ErrorCode.NOT_FOUND_USER, "Employee not found");
    }

    const [employee] = await db
      .update(users)
      .set({
        isActive: false,
        releaseDate,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();

    return this.mapToEmployee(employee);
  }

  /**
   * Change employee password
   */
  async changePin(id: string, pin: string): Promise<void> {
    if (!pin || !/^\d{4}$/.test(pin.trim())) {
      throw validationError("PIN must be exactly 4 digits");
    }

    const [existing] = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (!existing) {
      throw notFoundError(ErrorCode.NOT_FOUND_USER, "Employee not found");
    }

    if (existing.role !== "EMPLOYEE") {
      throw validationError("PIN can only be updated for employee accounts");
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(pin.trim(), saltRounds);

    await db
      .update(users)
      .set({
        passwordHash,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id));
  }

  /**
   * Find all employees
   * Requirements: 1.4
   */
  async findAll(includeInactive: boolean = true): Promise<Employee[]> {
    const employees = includeInactive
      ? await db
          .select()
          .from(users)
          .orderBy(asc(users.name))
      : await db
          .select()
          .from(users)
          .where(eq(users.isActive, true))
          .orderBy(asc(users.name));

    return employees.map(this.mapToEmployee);
  }

  /**
   * Find employee by ID with salary history
   * Requirements: 1.5
   */
  async findById(id: string): Promise<EmployeeWithHistory | null> {
    const [employee] = await db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (!employee) {
      return null;
    }

    const employeeSalaryHistory = await db
      .select({
        id: salaryHistory.id,
        salary: salaryHistory.salary,
        createdAt: salaryHistory.createdAt,
      })
      .from(salaryHistory)
      .where(eq(salaryHistory.userId, id))
      .orderBy(desc(salaryHistory.createdAt));

    return {
      ...this.mapToEmployee(employee),
      salaryHistory: employeeSalaryHistory.map((sh) => ({
        id: sh.id,
        salary: Number(sh.salary),
        createdAt: sh.createdAt,
      })),
    };
  }

  async getTipsSummary(
    id: string,
    filters?: { startDate?: Date; endDate?: Date }
  ): Promise<EmployeeTipsSummary> {
    const [employee] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (!employee) {
      throw notFoundError(ErrorCode.NOT_FOUND_USER, "Employee not found");
    }

    const conditions = [
      eq(orders.waiterId, id),
      eq(orders.status, "PAID"),
    ];

    if (filters?.startDate) {
      conditions.push(gte(orders.paidAt, filters.startDate));
    }

    if (filters?.endDate) {
      conditions.push(lte(orders.paidAt, filters.endDate));
    }

    const [result] = await db
      .select({
        totalTips: sql<string>`coalesce(sum(${orders.tipAmount}), 0)`,
        tippedOrders: sql<number>`count(case when ${orders.tipAmount} > 0 then 1 end)`,
      })
      .from(orders)
      .where(and(...conditions));

    return {
      totalTips: Number(result?.totalTips || 0),
      tippedOrders: Number(result?.tippedOrders || 0),
    };
  }

  /**
   * Map database user row to Employee type
   */
  private mapToEmployee(user: {
    id: string;
    email: string;
    name: string;
    nameAm?: string | null;
    role: Role;
    salary: string | number | null;
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
