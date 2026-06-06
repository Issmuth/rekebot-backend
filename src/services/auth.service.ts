import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { and, asc, eq } from "drizzle-orm";
import { users } from "../db/schema";
import { db } from "../lib/drizzle";
import { AuthResult, WaiterProfile } from "../types";
import { ErrorCode, authError } from "../utils/errors";

const JWT_SECRET = process.env.JWT_SECRET || "cafe-management-secret-key";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "24h";

// Store for invalidated tokens (in production, use Redis or similar)
const invalidatedTokens = new Set<string>();

export interface TokenPayload {
  userId: string;
  email: string;
  role: "ADMIN" | "CASHIER" | "EMPLOYEE";
}

export class AuthService {
  /**
  * Authenticate admin or cashier user with email and password
   * Requirements: 8.1, 8.2
   */
  async login(email: string, password: string): Promise<AuthResult> {
    // Find user by email
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    // Check if user exists
    if (!user) {
      throw authError(
        ErrorCode.AUTH_INVALID_CREDENTIALS,
        "Invalid email or password"
      );
    }

    // Check if user is active
    if (!user.isActive) {
      throw authError(ErrorCode.AUTH_USER_INACTIVE, "User account is inactive");
    }

    // Check if user can access admin pages
    if (user.role !== "ADMIN" && user.role !== "CASHIER") {
      throw authError(
        ErrorCode.AUTH_INVALID_CREDENTIALS,
        "Invalid email or password"
      );
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw authError(
        ErrorCode.AUTH_INVALID_CREDENTIALS,
        "Invalid email or password"
      );
    }

    const token = this.generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }

  /**
   * Authenticate waiter user with name and password
   */
  async waiterLogin(name: string, password: string): Promise<AuthResult> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.name, name))
      .limit(1);

    if (!user) {
      throw authError(
        ErrorCode.AUTH_INVALID_CREDENTIALS,
        "Invalid email or password"
      );
    }

    if (!user.isActive) {
      throw authError(ErrorCode.AUTH_USER_INACTIVE, "User account is inactive");
    }

    if (user.role !== "EMPLOYEE") {
      throw authError(
        ErrorCode.AUTH_INVALID_CREDENTIALS,
        "Invalid email or password"
      );
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw authError(
        ErrorCode.AUTH_INVALID_CREDENTIALS,
        "Invalid email or password"
      );
    }

    // Generate JWT token
    const token = this.generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }

  /**
   * Invalidate admin session
   * Requirements: 8.6
   */
  async logout(token: string): Promise<void> {
    // Add token to invalidated set
    invalidatedTokens.add(token);
  }

  /**
   * Validate JWT token and return user info
   */
  async validateToken(token: string): Promise<TokenPayload | null> {
    // Check if token has been invalidated
    if (invalidatedTokens.has(token)) {
      return null;
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload;

      // Verify user still exists and is active
      const [user] = await db
        .select({ id: users.id, isActive: users.isActive })
        .from(users)
        .where(eq(users.id, decoded.userId))
        .limit(1);

      if (!user || !user.isActive) {
        return null;
      }

      return decoded;
    } catch {
      return null;
    }
  }

  /**
   * Get list of active waiters for selection (no auth required)
   * Requirements: 8.3, 8.4
   */
  async getActiveWaiters(): Promise<WaiterProfile[]> {
    const waiters = await db
      .select({
        id: users.id,
        name: users.name,
        nameAm: users.nameAm,
      })
      .from(users)
      .where(and(eq(users.role, "EMPLOYEE"), eq(users.isActive, true)))
      .orderBy(asc(users.name));

    return waiters;
  }

  /**
   * Resolve an active waiter by PIN.
   */
  async authorizeWaiterByPin(pin: string): Promise<{
    id: string;
    email: string;
    name: string;
    nameAm?: string | null;
    role: "ADMIN" | "CASHIER" | "EMPLOYEE";
  }> {
    if (!/^\d{4}$/.test(pin.trim())) {
      throw authError(
        ErrorCode.AUTH_INVALID_CREDENTIALS,
        "Invalid waiter PIN"
      );
    }

    const activeWaiters = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        nameAm: users.nameAm,
        role: users.role,
        passwordHash: users.passwordHash,
      })
      .from(users)
      .where(and(eq(users.role, "EMPLOYEE"), eq(users.isActive, true)));

    for (const waiter of activeWaiters) {
      const isPinValid = await bcrypt.compare(pin.trim(), waiter.passwordHash);
      if (isPinValid) {
        return {
          id: waiter.id,
          email: waiter.email,
          name: waiter.name,
          nameAm: waiter.nameAm,
          role: waiter.role,
        };
      }
    }

    throw authError(ErrorCode.AUTH_INVALID_CREDENTIALS, "Invalid waiter PIN");
  }

  /**
   * Generate JWT token
   */
  private generateToken(payload: TokenPayload): string {
    return jwt.sign(payload, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
    } as jwt.SignOptions);
  }

  /**
   * Hash password for storage
   */
  async hashPassword(password: string): Promise<string> {
    const saltRounds = 10;
    return bcrypt.hash(password, saltRounds);
  }

  /**
   * Check if a token is invalidated (for testing purposes)
   */
  isTokenInvalidated(token: string): boolean {
    return invalidatedTokens.has(token);
  }

  /**
   * Clear invalidated tokens (for testing purposes)
   */
  clearInvalidatedTokens(): void {
    invalidatedTokens.clear();
  }
}

// Export singleton instance
export const authService = new AuthService();
