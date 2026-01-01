import { Response, NextFunction, Request } from "express";
import { inventoryService } from "../services/inventory.service";
import { AuthenticatedRequest } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { ErrorCode } from "../utils/errors";

/**
 * Get all ingredients
 * GET /api/ingredients
 * Requirements: 4.4
 */
export const getAllIngredients = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const ingredients = await inventoryService.findAll();

    res.json({
      success: true,
      data: ingredients,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get ingredient by ID with stock adjustments
 * GET /api/ingredients/:id
 */
export const getIngredientById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const ingredient = await inventoryService.findById(id);

    if (!ingredient) {
      throw new AppError(
        404,
        ErrorCode.NOT_FOUND_INGREDIENT,
        "Ingredient not found"
      );
    }

    res.json({
      success: true,
      data: ingredient,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get ingredients below minimum threshold
 * GET /api/ingredients/low-stock
 * Requirements: 4.3
 */
export const getLowStockIngredients = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const ingredients = await inventoryService.getLowStock();

    res.json({
      success: true,
      data: ingredients,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create a new ingredient
 * POST /api/ingredients
 * Requirements: 4.1
 */
export const createIngredient = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { name, unit, currentStock, minThreshold } = req.body;

    // Basic validation - detailed validation in service
    if (
      !name ||
      !unit ||
      currentStock === undefined ||
      minThreshold === undefined
    ) {
      throw new AppError(
        400,
        ErrorCode.VALIDATION_REQUIRED_FIELD,
        "Name, unit, currentStock, and minThreshold are required"
      );
    }

    const ingredient = await inventoryService.createIngredient({
      name,
      unit,
      currentStock,
      minThreshold,
    });

    res.status(201).json({
      success: true,
      data: ingredient,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update an ingredient
 * PUT /api/ingredients/:id
 * Requirements: 4.1
 */
export const updateIngredient = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const { name, unit, minThreshold } = req.body;

    const ingredient = await inventoryService.updateIngredient(id, {
      name,
      unit,
      minThreshold,
    });

    res.json({
      success: true,
      data: ingredient,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update stock level with adjustment tracking
 * POST /api/ingredients/:id/stock
 * Requirements: 4.2
 */
export const updateStock = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const { quantity, reason } = req.body;

    if (quantity === undefined || !reason) {
      throw new AppError(
        400,
        ErrorCode.VALIDATION_REQUIRED_FIELD,
        "Quantity and reason are required"
      );
    }

    const ingredient = await inventoryService.updateStock(id, quantity, reason);

    res.json({
      success: true,
      data: ingredient,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Check availability for a menu item
 * GET /api/ingredients/availability/:menuItemId
 * Requirements: 7.1, 7.3
 */
export const checkAvailability = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { menuItemId } = req.params;
    const quantity = parseInt(req.query.quantity as string) || 1;

    const availability = await inventoryService.checkAvailability(
      menuItemId,
      quantity
    );

    res.json({
      success: true,
      data: availability,
    });
  } catch (error) {
    next(error);
  }
};
