import { Response, NextFunction, Request } from "express";
import { orderService } from "../services/order.service";
import { AppError } from "../middleware/errorHandler";
import { ErrorCode } from "../utils/errors";

/**
 * Get all orders
 * GET /api/orders
 * Requirements: 3.1
 */
export const getAllOrders = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { waiterId, status } = req.query;

    const filters: {
      waiterId?: string;
      status?: "PENDING" | "PAID" | "CANCELLED";
    } = {};

    if (waiterId && typeof waiterId === "string") {
      filters.waiterId = waiterId;
    }

    if (
      status &&
      typeof status === "string" &&
      ["PENDING", "PAID", "CANCELLED"].includes(status)
    ) {
      filters.status = status as "PENDING" | "PAID" | "CANCELLED";
    }

    const orders = await orderService.findAll(filters);

    res.json({
      success: true,
      data: orders,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get order by ID
 * GET /api/orders/:id
 */
export const getOrderById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const order = await orderService.findById(id);

    if (!order) {
      throw new AppError(404, ErrorCode.NOT_FOUND_ORDER, "Order not found");
    }

    res.json({
      success: true,
      data: order,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create a new order
 * POST /api/orders
 * Requirements: 3.1, 3.2, 3.3
 */
export const createOrder = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { waiterId, items } = req.body;

    // Basic validation - detailed validation in service
    if (!waiterId || !items || !Array.isArray(items) || items.length === 0) {
      throw new AppError(
        400,
        ErrorCode.VALIDATION_REQUIRED_FIELD,
        "Waiter ID and at least one item are required"
      );
    }

    const order = await orderService.create({ waiterId, items });

    res.status(201).json({
      success: true,
      data: order,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update an order (only if unpaid)
 * PUT /api/orders/:id
 * Requirements: 3.4
 */
export const updateOrder = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const { items } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new AppError(
        400,
        ErrorCode.VALIDATION_REQUIRED_FIELD,
        "At least one item is required"
      );
    }

    const order = await orderService.update(id, { items });

    res.json({
      success: true,
      data: order,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Cancel an order (only if unpaid)
 * DELETE /api/orders/:id
 * Requirements: 3.4
 */
export const cancelOrder = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;

    await orderService.cancel(id);

    res.json({
      success: true,
      message: "Order cancelled successfully",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Confirm payment for an order
 * POST /api/orders/:id/confirm
 * Requirements: 3.5, 3.6, 3.7
 */
export const confirmPayment = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const { paymentType, receiptImage } = req.body;

    if (!paymentType) {
      throw new AppError(
        400,
        ErrorCode.VALIDATION_REQUIRED_FIELD,
        "Payment type is required"
      );
    }

    if (!["CASH", "DIGITAL"].includes(paymentType)) {
      throw new AppError(
        400,
        ErrorCode.VALIDATION_INVALID_FORMAT,
        "Payment type must be CASH or DIGITAL"
      );
    }

    const order = await orderService.confirmPayment(id, {
      paymentType,
      receiptImage,
    });

    res.json({
      success: true,
      data: order,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Upload receipt for an order
 * POST /api/orders/:id/receipt
 * Requirements: 3.7, 3.8
 */
export const uploadReceipt = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const { receiptUrl } = req.body;

    if (!receiptUrl) {
      throw new AppError(
        400,
        ErrorCode.VALIDATION_REQUIRED_FIELD,
        "Receipt URL is required"
      );
    }

    const order = await orderService.uploadReceipt(id, receiptUrl);

    res.json({
      success: true,
      data: order,
    });
  } catch (error) {
    next(error);
  }
};
