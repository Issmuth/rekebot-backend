import { Response, NextFunction, Request } from "express";
import { menuService } from "../services/menu.service";
import { AuthenticatedRequest } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { ErrorCode } from "../utils/errors";

/**
 * Get all menu items
 * GET /api/menu
 * Requirements: 2.4
 */
export const getAllMenuItems = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const includeInactive = req.query.includeInactive === "true";
    const menuItems = await menuService.findAll(includeInactive);

    res.json({
      success: true,
      data: menuItems,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get menu item by ID
 * GET /api/menu/:id
 */
export const getMenuItemById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const menuItem = await menuService.findById(id);

    if (!menuItem) {
      throw new AppError(
        404,
        ErrorCode.NOT_FOUND_MENU_ITEM,
        "Menu item not found"
      );
    }

    res.json({
      success: true,
      data: menuItem,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get menu item stats
 * GET /api/menu/:id/stats
 */
export const getMenuItemStats = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const stats = await menuService.getStats(id);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get menu item stats for specific date
 * GET /api/menu/:id/stats/date
 */
export const getMenuItemStatsForDate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const { date } = req.query;

    if (!date || typeof date !== "string") {
      throw new AppError(
        400,
        ErrorCode.VALIDATION_REQUIRED_FIELD,
        "Date is required"
      );
    }

    const stats = await menuService.getStatsForDate(id, new Date(date));

    res.json({
      success: true,
      data: { count: stats },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get menu items with availability status
 * GET /api/menu/availability
 * Requirements: 7.1, 7.3, 7.4
 */
export const getMenuAvailability = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const availability = await menuService.getAvailability();

    res.json({
      success: true,
      data: availability,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create a new menu item
 * POST /api/menu
 * Requirements: 2.1, 2.5
 */
export const createMenuItem = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { name, nameAm, price, category, categoryAm, ingredients } = req.body;
    const file = req.file;

    // Basic validation - detailed validation in service
    if (!name || price === undefined || !category || !ingredients) {
      throw new AppError(
        400,
        ErrorCode.VALIDATION_REQUIRED_FIELD,
        "Name, price, category, and ingredients are required"
      );
    }

    let imageUrl: string | undefined;
    if (file) {
      imageUrl = `/cdn/menu/${file.filename}`;
    }

    // Parse ingredients if it came as string (multipart/form-data)
    let parsedIngredients = ingredients;
    if (typeof ingredients === "string") {
      try {
        parsedIngredients = JSON.parse(ingredients);
      } catch (e) {
        throw new AppError(
          400,
          ErrorCode.VALIDATION_INVALID_FORMAT,
          "Invalid ingredients format"
        );
      }
    }

    const menuItem = await menuService.create({
      name,
      nameAm,
      price: Number(price),
      category,
      categoryAm,
      ingredients: parsedIngredients,
      imageUrl,
    });

    res.status(201).json({
      success: true,
      data: menuItem,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update a menu item
 * PUT /api/menu/:id
 * Requirements: 2.2, 2.5
 */
export const updateMenuItem = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const {
      name,
      nameAm,
      price,
      category,
      categoryAm,
      ingredients,
      isActive,
    } = req.body;
    const file = req.file;

    let imageUrl: string | undefined;
    if (file) {
      imageUrl = `/cdn/menu/${file.filename}`;
    }

    // Parse ingredients if it came as string (multipart/form-data)
    let parsedIngredients = ingredients;
    if (typeof ingredients === "string") {
      try {
        parsedIngredients = JSON.parse(ingredients);
      } catch (e) {
        throw new AppError(
          400,
          ErrorCode.VALIDATION_INVALID_FORMAT,
          "Invalid ingredients format"
        );
      }
    }

    const menuItem = await menuService.update(id, {
      name,
      nameAm,
      price: price ? Number(price) : undefined,
      category,
      categoryAm,
      ingredients: parsedIngredients,
      isActive: isActive === undefined ? undefined : isActive === "true",
      imageUrl,
    });

    res.json({
      success: true,
      data: menuItem,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Soft delete a menu item
 * DELETE /api/menu/:id
 * Requirements: 2.3
 */
export const deleteMenuItem = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;

    await menuService.delete(id);

    res.json({
      success: true,
      message: "Menu item deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};
