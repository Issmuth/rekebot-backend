import { asc, desc, eq, inArray } from "drizzle-orm";
import {
  ingredients,
  menuItemIngredients,
  menuItems,
  stockAdjustments,
} from "../db/schema";
import { db } from "../lib/drizzle";
import { randomUUID } from "crypto";
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
import Decimal from "decimal.js";

export interface Ingredient {
  id: string;
  name: string;
  nameAm?: string | null;
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

export interface StockHistoryEntry extends StockAdjustmentEntry {
  ingredientName: string;
  unit: string;
  ingredientId: string;
}

export interface UpdateIngredientDTO {
  name?: string;
  nameAm?: string;
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
    const ingredient = await db.transaction(async (tx) => {
      const now = new Date();
      const [created] = await tx
        .insert(ingredients)
        .values({
          id: randomUUID(),
          nameAm: data.nameAm,
          name: data.name,
          unit: data.unit,
          currentStock: String(data.currentStock),
          minThreshold: String(data.minThreshold),
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      await tx.insert(stockAdjustments).values({
        id: randomUUID(),
        ingredientId: created.id,
        quantity: String(data.currentStock),
        reason: "Initial stock",
      });

      return created;
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
    const [existing] = await db
      .select({ id: ingredients.id })
      .from(ingredients)
      .where(eq(ingredients.id, id))
      .limit(1);

    if (!existing) {
      throw notFoundError(
        ErrorCode.NOT_FOUND_INGREDIENT,
        "Ingredient not found"
      );
    }

    const [ingredient] = await db
      .update(ingredients)
      .set({
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.nameAm !== undefined ? { nameAm: data.nameAm } : {}),
        ...(data.unit !== undefined ? { unit: data.unit } : {}),
        ...(data.minThreshold !== undefined
          ? { minThreshold: String(data.minThreshold) }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(ingredients.id, id))
      .returning();

    return this.mapToIngredient(ingredient);
  }

  /**
   * Delete an ingredient (admin only)
   */
  async deleteIngredient(id: string): Promise<{ id: string }> {
    const [existing] = await db
      .select({ id: ingredients.id })
      .from(ingredients)
      .where(eq(ingredients.id, id))
      .limit(1);

    if (!existing) {
      throw notFoundError(
        ErrorCode.NOT_FOUND_INGREDIENT,
        "Ingredient not found"
      );
    }

    await db.transaction(async (tx) => {
      await tx
        .delete(menuItemIngredients)
        .where(eq(menuItemIngredients.ingredientId, id));

      await tx
        .delete(stockAdjustments)
        .where(eq(stockAdjustments.ingredientId, id));

      await tx.delete(ingredients).where(eq(ingredients.id, id));
    });

    return { id };
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
    const [existing] = await db
      .select()
      .from(ingredients)
      .where(eq(ingredients.id, id))
      .limit(1);

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
    const ingredient = await db.transaction(async (tx) => {
      // Create stock adjustment record
      await tx.insert(stockAdjustments).values({
        id: randomUUID(),
        ingredientId: id,
        quantity: String(quantity),
        reason,
      });

      // Update current stock
      const [updated] = await tx
        .update(ingredients)
        .set({
          currentStock: String(newStock),
          updatedAt: new Date(),
        })
        .where(eq(ingredients.id, id))
        .returning();

      return updated;
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

    const rows = await db
      .select({
        menuItemId: menuItems.id,
        ingredientId: menuItemIngredients.ingredientId,
        quantityPerServing: menuItemIngredients.quantityPerServing,
        ingredientName: ingredients.name,
      })
      .from(menuItems)
      .leftJoin(
        menuItemIngredients,
        eq(menuItems.id, menuItemIngredients.menuItemId)
      )
      .leftJoin(ingredients, eq(menuItemIngredients.ingredientId, ingredients.id))
      .where(inArray(menuItems.id, menuItemIds));

    const menuItemMap = new Map<
      string,
      Array<{
        ingredientId: string;
        quantityPerServing: Decimal | string | number;
        ingredientName: string;
      }>
    >();

    for (const row of rows) {
      if (!menuItemMap.has(row.menuItemId)) {
        menuItemMap.set(row.menuItemId, []);
      }

      if (row.ingredientId && row.quantityPerServing !== null && row.ingredientName) {
        menuItemMap.get(row.menuItemId)!.push({
          ingredientId: row.ingredientId,
          quantityPerServing: row.quantityPerServing,
          ingredientName: row.ingredientName,
        });
      }
    }

    // Build a map of ingredient deductions
    const deductions = new Map<string, { amount: Decimal; name: string }>();

    for (const orderItem of items) {
      const ingredientMappings = menuItemMap.get(orderItem.menuItemId);
      if (!ingredientMappings) {
        throw notFoundError(
          ErrorCode.NOT_FOUND_MENU_ITEM,
          `Menu item not found: ${orderItem.menuItemId}`
        );
      }

      for (const mapping of ingredientMappings) {
        const deductionAmount = new Decimal(mapping.quantityPerServing).mul(
          orderItem.quantity
        );
        const existing = deductions.get(mapping.ingredientId);

        if (existing) {
          existing.amount = existing.amount.add(deductionAmount);
        } else {
          deductions.set(mapping.ingredientId, {
            amount: deductionAmount,
            name: mapping.ingredientName,
          });
        }
      }
    }

    // Perform deductions in a transaction
    await db.transaction(async (tx) => {
      for (const [ingredientId, { amount, name }] of deductions) {
        const [ingredient] = await tx
          .select({ id: ingredients.id, currentStock: ingredients.currentStock })
          .from(ingredients)
          .where(eq(ingredients.id, ingredientId))
          .limit(1);

        if (!ingredient) {
          throw notFoundError(
            ErrorCode.NOT_FOUND_INGREDIENT,
            `Ingredient not found: ${ingredientId}`
          );
        }

        const currentStock = new Decimal(ingredient.currentStock);
        const newStock = currentStock.sub(amount);

        // Create adjustment record
        await tx.insert(stockAdjustments).values({
          id: randomUUID(),
          ingredientId,
          quantity: String(amount.negated()),
          reason: "Order fulfillment",
        });

        // Update stock
        await tx
          .update(ingredients)
          .set({ currentStock: String(newStock), updatedAt: new Date() })
          .where(eq(ingredients.id, ingredientId));
      }
    });
  }

  /**
   * Restore stock for cancelled order items
   */
  async restoreStock(items: OrderItemDTO[]): Promise<void> {
    const menuItemIds = items.map((item) => item.menuItemId);

    const rows = await db
      .select({
        menuItemId: menuItems.id,
        ingredientId: menuItemIngredients.ingredientId,
        quantityPerServing: menuItemIngredients.quantityPerServing,
        ingredientName: ingredients.name,
      })
      .from(menuItems)
      .leftJoin(
        menuItemIngredients,
        eq(menuItems.id, menuItemIngredients.menuItemId)
      )
      .leftJoin(ingredients, eq(menuItemIngredients.ingredientId, ingredients.id))
      .where(inArray(menuItems.id, menuItemIds));

    const menuItemMap = new Map<
      string,
      Array<{
        ingredientId: string;
        quantityPerServing: Decimal | string | number;
        ingredientName: string;
      }>
    >();

    for (const row of rows) {
      if (!menuItemMap.has(row.menuItemId)) {
        menuItemMap.set(row.menuItemId, []);
      }

      if (row.ingredientId && row.quantityPerServing !== null && row.ingredientName) {
        menuItemMap.get(row.menuItemId)!.push({
          ingredientId: row.ingredientId,
          quantityPerServing: row.quantityPerServing,
          ingredientName: row.ingredientName,
        });
      }
    }

    const restorations = new Map<string, { amount: Decimal; name: string }>();

    for (const orderItem of items) {
      const ingredientMappings = menuItemMap.get(orderItem.menuItemId);
      if (!ingredientMappings) {
        throw notFoundError(
          ErrorCode.NOT_FOUND_MENU_ITEM,
          `Menu item not found: ${orderItem.menuItemId}`
        );
      }

      for (const mapping of ingredientMappings) {
        const restorationAmount = new Decimal(mapping.quantityPerServing).mul(
          orderItem.quantity
        );
        const existing = restorations.get(mapping.ingredientId);

        if (existing) {
          existing.amount = existing.amount.add(restorationAmount);
        } else {
          restorations.set(mapping.ingredientId, {
            amount: restorationAmount,
            name: mapping.ingredientName,
          });
        }
      }
    }

    await db.transaction(async (tx) => {
      for (const [ingredientId, { amount }] of restorations) {
        const [ingredient] = await tx
          .select({ id: ingredients.id, currentStock: ingredients.currentStock })
          .from(ingredients)
          .where(eq(ingredients.id, ingredientId))
          .limit(1);

        if (!ingredient) {
          throw notFoundError(
            ErrorCode.NOT_FOUND_INGREDIENT,
            `Ingredient not found: ${ingredientId}`
          );
        }

        const currentStock = new Decimal(ingredient.currentStock);
        const newStock = currentStock.add(amount);

        await tx.insert(stockAdjustments).values({
          id: randomUUID(),
          ingredientId,
          quantity: String(amount),
          reason: "Order cancellation",
        });

        await tx
          .update(ingredients)
          .set({ currentStock: String(newStock), updatedAt: new Date() })
          .where(eq(ingredients.id, ingredientId));
      }
    });
  }

  /**
   * Get ingredients below minimum threshold
   * Requirements: 4.3
   */
  async getLowStock(): Promise<Ingredient[]> {
    // Filter in application by comparing current stock against threshold
    const allIngredients = await db
      .select()
      .from(ingredients)
      .orderBy(asc(ingredients.name));

    return allIngredients
      .filter((ing) => Number(ing.currentStock) < Number(ing.minThreshold))
      .map(this.mapToIngredient);
  }

  /**
   * Get stock history/adjustments
   * Requirements: 4.4
   */
  async getHistory(limit=50): Promise<StockHistoryEntry[]> {
    const adjustments = await db
      .select({
        id: stockAdjustments.id,
        quantity: stockAdjustments.quantity,
        reason: stockAdjustments.reason,
        createdAt: stockAdjustments.createdAt,
        ingredientId: stockAdjustments.ingredientId,
        ingredientName: ingredients.name,
        unit: ingredients.unit,
      })
      .from(stockAdjustments)
      .innerJoin(ingredients, eq(stockAdjustments.ingredientId, ingredients.id))
      .orderBy(desc(stockAdjustments.createdAt))
      .limit(limit);

    return adjustments.map((adj) => ({
      id: adj.id,
      quantity: Number(adj.quantity),
      reason: adj.reason,
      createdAt: adj.createdAt,
      ingredientName: adj.ingredientName,
      unit: adj.unit,
      ingredientId: adj.ingredientId,
    }));
  }

  /**
   * Check availability for a menu item
   * Requirements: 7.1, 7.3
   */
  async checkAvailability(
    menuItemId: string,
    quantity: number
  ): Promise<AvailabilityResult> {
    const rows = await db
      .select({
        menuItemId: menuItems.id,
        ingredientName: ingredients.name,
        ingredientCurrentStock: ingredients.currentStock,
        quantityPerServing: menuItemIngredients.quantityPerServing,
      })
      .from(menuItems)
      .leftJoin(
        menuItemIngredients,
        eq(menuItems.id, menuItemIngredients.menuItemId)
      )
      .leftJoin(ingredients, eq(menuItemIngredients.ingredientId, ingredients.id))
      .where(eq(menuItems.id, menuItemId));

    if (rows.length === 0) {
      throw notFoundError(ErrorCode.NOT_FOUND_MENU_ITEM, "Menu item not found");
    }

    const ingredientRows = rows.filter(
      (row) =>
        row.ingredientName !== null &&
        row.ingredientCurrentStock !== null &&
        row.quantityPerServing !== null
    );

    if (ingredientRows.length === 0) {
      return {
        available: false,
        availableServings: 0,
        limitingIngredient: "No ingredients defined",
      };
    }

    let minServings = Infinity;
    let limitingIngredient: string | undefined;

    for (const mapping of ingredientRows) {
      const stock = Number(mapping.ingredientCurrentStock);
      const perServing = Number(mapping.quantityPerServing);

      if (perServing <= 0) {
        continue;
      }

      const possibleServings = Math.floor(stock / perServing);

      if (possibleServings < minServings) {
        minServings = possibleServings;
        limitingIngredient = mapping.ingredientName || undefined;
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
    const ingredientRows = await db
      .select()
      .from(ingredients)
      .orderBy(asc(ingredients.name));

    return ingredientRows.map(this.mapToIngredient);
  }

  /**
   * Find ingredient by ID with stock adjustments
   */
  async findById(id: string): Promise<IngredientWithAdjustments | null> {
    const [ingredient] = await db
      .select()
      .from(ingredients)
      .where(eq(ingredients.id, id))
      .limit(1);

    if (!ingredient) {
      return null;
    }

    const adjustments = await db
      .select({
        id: stockAdjustments.id,
        quantity: stockAdjustments.quantity,
        reason: stockAdjustments.reason,
        createdAt: stockAdjustments.createdAt,
      })
      .from(stockAdjustments)
      .where(eq(stockAdjustments.ingredientId, id))
      .orderBy(desc(stockAdjustments.createdAt))
      .limit(50);

    return {
      ...this.mapToIngredient(ingredient),
      stockAdjustments: adjustments.map((adj) => ({
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
   * Map database ingredient row to Ingredient type
   */
  private mapToIngredient(ingredient: {
    id: string;
    nameAm?: string | null;
    name: string;
    unit: string;
    currentStock: Decimal | string | number;
    minThreshold: Decimal | string | number;
    createdAt: Date;
    updatedAt: Date;
  }): Ingredient {
    return {
      id: ingredient.id,
      nameAm: ingredient.nameAm,
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
