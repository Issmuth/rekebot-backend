import { Request, Response, NextFunction } from "express";

export interface ApiError {
  status: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export class AppError extends Error implements ApiError {
  status: number;
  code: string;
  details?: Record<string, unknown>;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export const errorHandler = (
  err: Error | AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  if (err instanceof AppError) {
    return res.status(err.status).json({
      status: err.status,
      code: err.code,
      message: err.message,
      details: err.details,
    });
  }

  // Default error response for unexpected errors
  console.error("Unexpected error:", err);
  return res.status(500).json({
    status: 500,
    code: "SERVER_ERROR",
    message: "An unexpected error occurred",
  });
};
