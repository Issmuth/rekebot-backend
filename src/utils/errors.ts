import { AppError } from "../middleware/errorHandler";

// Error codes as defined in the design document
export enum ErrorCode {
  // Validation
  VALIDATION_REQUIRED_FIELD = "VALIDATION_REQUIRED_FIELD",
  VALIDATION_INVALID_FORMAT = "VALIDATION_INVALID_FORMAT",

  // Authentication
  AUTH_INVALID_CREDENTIALS = "AUTH_INVALID_CREDENTIALS",
  AUTH_TOKEN_EXPIRED = "AUTH_TOKEN_EXPIRED",
  AUTH_USER_INACTIVE = "AUTH_USER_INACTIVE",

  // Authorization
  FORBIDDEN_ADMIN_ONLY = "FORBIDDEN_ADMIN_ONLY",
  FORBIDDEN_OWN_ORDER_ONLY = "FORBIDDEN_OWN_ORDER_ONLY",

  // Business Logic
  BUSINESS_INSUFFICIENT_STOCK = "BUSINESS_INSUFFICIENT_STOCK",
  BUSINESS_ORDER_ALREADY_PAID = "BUSINESS_ORDER_ALREADY_PAID",
  BUSINESS_RECEIPT_REQUIRED = "BUSINESS_RECEIPT_REQUIRED",
  BUSINESS_INGREDIENT_IN_USE = "BUSINESS_INGREDIENT_IN_USE",

  // Not Found
  NOT_FOUND_USER = "NOT_FOUND_USER",
  NOT_FOUND_ORDER = "NOT_FOUND_ORDER",
  NOT_FOUND_MENU_ITEM = "NOT_FOUND_MENU_ITEM",
  NOT_FOUND_INGREDIENT = "NOT_FOUND_INGREDIENT",
}

// Helper functions to create common errors
export const validationError = (
  message: string,
  details?: Record<string, unknown>
) => new AppError(400, ErrorCode.VALIDATION_REQUIRED_FIELD, message, details);

export const authError = (code: ErrorCode, message: string) =>
  new AppError(401, code, message);

export const forbiddenError = (code: ErrorCode, message: string) =>
  new AppError(403, code, message);

export const notFoundError = (code: ErrorCode, message: string) =>
  new AppError(404, code, message);

export const businessError = (
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>
) => new AppError(422, code, message, details);
