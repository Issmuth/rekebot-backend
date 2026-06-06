import { Response, NextFunction, Request } from "express";
import { orderService } from "../services/order.service";
import { authService } from "../services/auth.service";
import { AppError } from "../middleware/errorHandler";
import { ErrorCode } from "../utils/errors";
import fs from "fs";
import path from "path";

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
    const { waiterId, status, paymentType, startDate, endDate, tipped } = req.query;

    const filters: {
      waiterId?: string;
      status?: "PENDING" | "PENDING_VERIFICATION" | "PAID" | "CANCELLED";
      paymentType?: "CASH" | "DIGITAL";
      startDate?: Date;
      endDate?: Date;
      tipped?: boolean;
    } = {};

    if (waiterId && typeof waiterId === "string") {
      filters.waiterId = waiterId;
    }

    if (
      status &&
      typeof status === "string" &&
      ["PENDING", "Pending Verification", "PENDING_VERIFICATION", "PAID", "CANCELLED"].includes(status)
    ) {
      filters.status = status as "PENDING" | "PENDING_VERIFICATION" | "PAID" | "CANCELLED";
    }

    if (
      paymentType &&
      typeof paymentType === "string" &&
      ["CASH", "DIGITAL"].includes(paymentType)
    ) {
      filters.paymentType = paymentType as "CASH" | "DIGITAL";
    }

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

    if (tipped && typeof tipped === "string") {
      if (!["true", "false"].includes(tipped)) {
        throw new AppError(
          400,
          ErrorCode.VALIDATION_INVALID_FORMAT,
          "Invalid tipped filter format"
        );
      }
      filters.tipped = tipped === "true";
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
 * Get receipt image for an order (authenticated)
 * GET /api/orders/:id/receipt-image
 */
export const getReceiptImage = async (
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

    if (!order.receiptImage) {
      throw new AppError(404, ErrorCode.NOT_FOUND_ORDER, "Receipt image not found");
    }

    const originalValue = order.receiptImage.replace(/\\/g, "/").trim();

    let receiptPath = originalValue;
    if (originalValue.startsWith("http://") || originalValue.startsWith("https://")) {
      try {
        receiptPath = new URL(originalValue).pathname;
      } catch {
        receiptPath = originalValue;
      }
    }

    let relativePath = receiptPath.startsWith("/") ? receiptPath : `/${receiptPath}`;
    relativePath = relativePath.replace(/^\/api\//, "/");

    if (relativePath.startsWith("/cdn/")) {
      relativePath = relativePath.replace(/^\/cdn\//, "/");
    } else if (relativePath.startsWith("/uploads/")) {
      relativePath = relativePath.replace(/^\/uploads\//, "/");
    }

    const normalizedRelative = relativePath.replace(/^\/+/, "");
    const uploadsRoot = path.resolve(process.cwd(), "uploads");
    const absolutePath = path.resolve(uploadsRoot, normalizedRelative);

    if (!absolutePath.startsWith(uploadsRoot + path.sep) && absolutePath !== uploadsRoot) {
      throw new AppError(400, ErrorCode.VALIDATION_INVALID_FORMAT, "Invalid receipt path");
    }

    if (!fs.existsSync(absolutePath)) {
      throw new AppError(404, ErrorCode.NOT_FOUND_ORDER, "Receipt image file not found");
    }

    res.sendFile(absolutePath);
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
    const { waiterPin, items, tableNumber } = req.body;

    // Basic validation - detailed validation in service
    if (!waiterPin || !items || !Array.isArray(items) || items.length === 0) {
      throw new AppError(
        400,
        ErrorCode.VALIDATION_REQUIRED_FIELD,
        "Waiter PIN and at least one item are required"
      );
    }

    const waiter = await authService.authorizeWaiterByPin(waiterPin);

    const order = await orderService.create({
      waiterId: waiter.id,
      items,
      tableNumber,
    });

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
    const { items, tableNumber } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new AppError(
        400,
        ErrorCode.VALIDATION_REQUIRED_FIELD,
        "At least one item is required"
      );
    }

    const order = await orderService.update(id, { items, tableNumber });

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
    const { paymentType, tipAmount } = req.body;
    const file = req.file;

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

    let receiptUrl: string | undefined;
    if (file) {
      // Construct URL path (relative to server root)
      // We serve 'uploads' directory at /cdn
      // file.path is absolute path, we need relative path
      // file.filename is the filename
      receiptUrl = `/cdn/receipts/${file.filename}`;
    }

    const order = await orderService.confirmPayment(id, {
      paymentType,
      receiptImage: receiptUrl,
      tipAmount: tipAmount && !isNaN(Number(tipAmount)) ? Number(tipAmount) : undefined,
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
    const file = req.file;

    if (!file) {
      throw new AppError(
        400,
        ErrorCode.VALIDATION_REQUIRED_FIELD,
        "Receipt image file is required"
      );
    }

    const receiptUrl = `/cdn/receipts/${file.filename}`;
    const order = await orderService.uploadReceipt(id, receiptUrl);

    res.json({
      success: true,
      data: order,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Verify order (Admin)
 * POST /api/orders/:id/verify
 */
export const verifyOrder = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const order = await orderService.verifyOrder(id);

    res.json({
      success: true,
      data: order,
    });
  } catch (error) {
    next(error);
  }
};
