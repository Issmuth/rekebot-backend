import prisma from "../lib/prisma";
import {
  CreateIngredientDTO,
  AvailabilityResult,
  OrderItemDTO,
} from "../types";
import {
  ErrorCode,
  notFoundError,
  validationError,
  businessError,
} from "../utils/errors";
import { Decimal } from "@prisma/client/runtime/library";

export interface Ingredient {
  id: string;
  name: string;
  unit: string;
  currentStock: number;
  minThreshold: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IngredientWithAdjustments extends Ingredient {
  stockAdjustments: StockAdjustmentEntry[];
}

export interface StockAdjustmentEntry {
  id: string;
  quantity: number;
  reason: string;
  createdAt: Date;
}

export interface UpdateIngredientDTO {
  name?: string;
  unit?: string;
  minThreshold?: number;
}

export interface StockUpdateDTO {
  quantity: number;
  reason: string;
}

export class InventoryService {
  /**
   * Create a new ingredient
   * Requirements: 4.1
   */
  async createIngredient(data: CreateIngredientDTO): Promise<Ingredient> {
    // Validate required fields
    this.validateIngredientData(data);

    // Create ingredient with initial stock adjustment
    const ingredient = await prisma.ingredient.create({
      data: {
        name: data.name,
        unit: data.unit,
        currentStock: data.currentStock,
        minThreshold: data.minThreshold,
        stockAdjustments: {
          create: {
            quantity: data.currentStock,
            reason: "Initial stock",
          },
        },
      },
    });

    return this.mapToIngredient(ingredient);
  }

  /**
   * Update an ingredient's basic info (not stock)
   */
  async updateIngredient(
    id: string,
    data: UpdateIngredientDTO
  ): Promise<Ingredient> {
    // Check if ingredient exists
    const existing = await prisma.ingredient.findUnique({
      where: { id },
    });

    if (!existing) {
      throw notFoundError(
        ErrorCode.NOT_FOUND_INGREDIENT,
        "Ingredient not found"
      );
    }

    const ingredient = await prisma.ingredient.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.unit !== undefined && { unit: data.unit }),
        ...(data.minThreshold !== undefined && {
          minThreshold: data.minThreshold,
        }),
      },
    });

    return this.mapToIngredient(ingredient);
  }

  /**
   * Update stock level with adjustment tracking
   * Requirements: 4.2
   */
  async updateStock(
    id: string,
    quantity: number,
    reason: string
  ): Promise<Ingredient> {
    // Validate inputs
    if (!reason || reason.trim() === "") {
      throw validationError("Reason is required for stock adjustment");
    }

    // Check if ingredient exists
    const existing = await prisma.ingredient.findUnique({
      where: { id },
    });

    if (!existing) {
      throw notFoundError(
        ErrorCode.NOT_FOUND_INGREDIENT,
        "Ingredient not found"
      );
    }

    // Calculate new stock level
    const newStock = Number(existing.currentStock) + quantity;

    if (newStock < 0) {
      throw businessError(
        ErrorCode.BUSINESS_INSUFFICIENT_STOCK,
        "Stock cannot be negative",
        { currentStock: Number(existing.currentStock), adjustment: quantity }
      );
    }

    // Update stock and create adjustment record
    const ingredient = await prisma.$transaction(async (tx) => {
      // Create stock adjustment record
      await tx.stockAdjustment.create({
        data: {
          ingredientId: id,
          quantity,
          reason,
        },
      });

      // Update current stock
      return tx.ingredient.update({
        where: { id },
        data: { currentStock: newStock },
      });
    });

    return this.mapToIngredient(ingredient);
  }

  /**
   * Deduct stock for order items
   * Requirements: 4.5
   */
  async deductStock(items: OrderItemDTO[]): Promise<void> {
    // Get all menu items with their ingredient mappings
    const menuItemIds = items.map((item) => item.menuItemId);

    const menuItems = await prisma.menuItem.findMany({
      where: { id: { in: menuItemIds } },
      include: {
        ingredients: {
          include: {
            ingredient: true,
          },
        },
      },
    });

    // Build a map of ingredient deductions
    const deductions = new Map<string, { amount: number; name: string }>();

    for (const orderItem of items) {
      const menuItem = menuItems.find((mi) => mi.id === orderItem.menuItemId);
      if (!menuItem) {
        throw notFoundError(
          ErrorCode.NOT_FOUND_MENU_ITEM,
          `Menu item not found: ${orderItem.menuItemId}`
        );
      }

      for (const mapping of menuItem.ingredients) {
        const deductionAmount =
          Number(mapping.quantityPerServing) * orderItem.quantity;
        const existing = deductions.get(mapping.ingredientId);

        if (existing) {
          existing.amount += deductionAmount;
        } else {
          deductions.set(mapping.ingredientId, {
            amount: deductionAmount,
            name: mapping.ingredient.name,
          });
        }
      }
    }

    // Perform deductions in a transaction
    await prisma.$transaction(async (tx) => {
      for (const [ingredientId, { amount, name }] of deductions) {
        const ingredient = await tx.ingredient.findUnique({
          where: { id: ingredientId },
        });

        if (!ingredient) {
          throw notFoundError(
            ErrorCode.NOT_FOUND_INGREDIENT,
            `Ingredient not found: ${ingredientId}`
          );
        }

        const newStock = Number(ingredient.currentStock) - amount;

        if (newStock < 0) {
          throw businessError(
            ErrorCode.BUSINESS_INSUFFICIENT_STOCK,
            `Insufficient stock for ${name}`,
            {
              ingredientId,
              currentStock: Number(ingredient.currentStock),
              required: amount,
            }
          );
        }

        // Create adjustment record
        await tx.stockAdjustment.create({
          data: {
            ingredientId,
            quantity: -amount,
            reason: "Order fulfillment",
          },
        });

        // Update stock
        await tx.ingredient.update({
          where: { id: ingredientId },
          data: { currentStock: newStock },
        });
      }
    });
  }

  /**
   * Get ingredients below minimum threshold
   * Requirements: 4.3
   */
  async getLowStock(): Promise<Ingredient[]> {
    // Filter in application since Prisma doesn't support comparing two columns directly
    const allIngredients = await prisma.ingredient.findMany({
      orderBy: { name: "asc" },
    });

    return allIngredients
      .filter((ing) => Number(ing.currentStock) < Number(ing.minThreshold))
      .map(this.mapToIngredient);
  }

  /**
   * Check availability for a menu item
   * Requirements: 7.1, 7.3
   */
  async checkAvailability(
    menuItemId: string,
    quantity: number
  ): Promise<AvailabilityResult> {
    const menuItem = await prisma.menuItem.findUnique({
      where: { id: menuItemId },
      include: {
        ingredients: {
          include: {
            ingredient: true,
          },
        },
      },
    });

    if (!menuItem) {
      throw notFoundError(ErrorCode.NOT_FOUND_MENU_ITEM, "Menu item not found");
    }

    if (menuItem.ingredients.length === 0) {
      return {
        available: false,
        availableServings: 0,
        limitingIngredient: "No ingredients defined",
      };
    }

    let minServings = Infinity;
    let limitingIngredient: string | undefined;

    for (const mapping of menuItem.ingredients) {
      const stock = Number(mapping.ingredient.currentStock);
      const perServing = Number(mapping.quantityPerServing);

      if (perServing <= 0) {
        continue;
      }

      const possibleServings = Math.floor(stock / perServing);

      if (possibleServings < minServings) {
        minServings = possibleServings;
        limitingIngredient = mapping.ingredient.name;
      }
    }

    const availableServings = minServings === Infinity ? 0 : minServings;

    return {
      available: availableServings >= quantity,
      availableServings,
      limitingIngredient:
        availableServings < quantity ? limitingIngredient : undefined,
    };
  }

  /**
   * Find all ingredients
   * Requirements: 4.4
   */
  async findAll(): Promise<Ingredient[]> {
    const ingredients = await prisma.ingredient.findMany({
      orderBy: { name: "asc" },
    });

    return ingredients.map(this.mapToIngredient);
  }

  /**
   * Find ingredient by ID with stock adjustments
   */
  async findById(id: string): Promise<IngredientWithAdjustments | null> {
    const ingredient = await prisma.ingredient.findUnique({
      where: { id },
      include: {
        stockAdjustments: {
          orderBy: { createdAt: "desc" },
          take: 50, // Limit to recent adjustments
        },
      },
    });

    if (!ingredient) {
      return null;
    }

    return {
      ...this.mapToIngredient(ingredient),
      stockAdjustments: ingredient.stockAdjustments.map((adj) => ({
        id: adj.id,
        quantity: Number(adj.quantity),
        reason: adj.reason,
        createdAt: adj.createdAt,
      })),
    };
  }

  /**
   * Validate ingredient data for creation
   */
  private validateIngredientData(data: CreateIngredientDTO): void {
    const errors: string[] = [];

    if (!data.name || data.name.trim() === "") {
      errors.push("Name is required");
    }

    if (!data.unit || data.unit.trim() === "") {
      errors.push("Unit is required");
    }

    if (data.currentStock === undefined || data.currentStock === null) {
      errors.push("Current stock is required");
    } else if (data.currentStock < 0) {
      errors.push("Current stock must be non-negative");
    }

    if (data.minThreshold === undefined || data.minThreshold === null) {
      errors.push("Minimum threshold is required");
    } else if (data.minThreshold < 0) {
      errors.push("Minimum threshold must be non-negative");
    }

    if (errors.length > 0) {
      throw validationError(errors.join(", "), { errors });
    }
  }

  /**
   * Map Prisma Ingredient to Ingredient type
   */
  private mapToIngredient(ingredient: {
    id: string;
    name: string;
    unit: string;
    currentStock: Decimal;
    minThreshold: Decimal;
    createdAt: Date;
    updatedAt: Date;
  }): Ingredient {
    return {
      id: ingredient.id,
      name: ingredient.name,
      unit: ingredient.unit,
      currentStock: Number(ingredient.currentStock),
      minThreshold: Number(ingredient.minThreshold),
      createdAt: ingredient.createdAt,
      updatedAt: ingredient.updatedAt,
    };
  }
}

// Export singleton instance
export const inventoryService = new InventoryService();
