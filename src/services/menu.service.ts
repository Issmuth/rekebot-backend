import prisma from "../lib/prisma";
import {
  CreateMenuItemDTO,
  UpdateMenuItemDTO,
  MenuItemAvailability,
} from "../types";
import { ErrorCode, notFoundError, validationError } from "../utils/errors";
import { Decimal } from "@prisma/client/runtime/library";

export interface MenuItem {
  id: string;
  name: string;
  price: number;
  category: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface MenuItemWithIngredients extends MenuItem {
  ingredients: IngredientMapping[];
}

export interface IngredientMapping {
  ingredientId: string;
  ingredientName: string;
  unit: string;
  quantityPerServing: number;
}

export class MenuService {
  /**
   * Create a new menu item with ingredient mappings
   * Requirements: 2.1, 2.5
   */
  async create(data: CreateMenuItemDTO): Promise<MenuItemWithIngredients> {
    // Validate required fields
    this.validateMenuItemData(data);

    // Verify all ingredients exist
    await this.verifyIngredientsExist(
      data.ingredients.map((i) => i.ingredientId)
    );

    // Create menu item with ingredient mappings
    const menuItem = await prisma.menuItem.create({
      data: {
        name: data.name,
        price: data.price,
        category: data.category,
        ingredients: {
          create: data.ingredients.map((ing) => ({
            ingredientId: ing.ingredientId,
            quantityPerServing: ing.quantityPerServing,
          })),
        },
      },
      include: {
        ingredients: {
          include: {
            ingredient: true,
          },
        },
      },
    });

    return this.mapToMenuItemWithIngredients(menuItem);
  }

  /**
   * Update a menu item
   * Requirements: 2.2, 2.5
   */
  async update(
    id: string,
    data: UpdateMenuItemDTO
  ): Promise<MenuItemWithIngredients> {
    // Check if menu item exists
    const existing = await prisma.menuItem.findUnique({
      where: { id },
    });

    if (!existing) {
      throw notFoundError(ErrorCode.NOT_FOUND_MENU_ITEM, "Menu item not found");
    }

    // Validate data if updating required fields
    if (
      data.name !== undefined ||
      data.price !== undefined ||
      data.category !== undefined
    ) {
      this.validatePartialMenuItemData(data, existing);
    }

    // If updating ingredients, verify they exist
    if (data.ingredients) {
      await this.verifyIngredientsExist(
        data.ingredients.map((i) => i.ingredientId)
      );
    }

    // Update menu item
    const menuItem = await prisma.$transaction(async (tx) => {
      // If ingredients are being updated, delete existing and create new
      if (data.ingredients) {
        await tx.menuItemIngredient.deleteMany({
          where: { menuItemId: id },
        });
      }

      return tx.menuItem.update({
        where: { id },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.price !== undefined && { price: data.price }),
          ...(data.category !== undefined && { category: data.category }),
          ...(data.isActive !== undefined && { isActive: data.isActive }),
          ...(data.ingredients && {
            ingredients: {
              create: data.ingredients.map((ing) => ({
                ingredientId: ing.ingredientId,
                quantityPerServing: ing.quantityPerServing,
              })),
            },
          }),
        },
        include: {
          ingredients: {
            include: {
              ingredient: true,
            },
          },
        },
      });
    });

    return this.mapToMenuItemWithIngredients(menuItem);
  }

  /**
   * Soft delete a menu item (mark as inactive)
   * Requirements: 2.3
   */
  async delete(id: string): Promise<void> {
    // Check if menu item exists
    const existing = await prisma.menuItem.findUnique({
      where: { id },
    });

    if (!existing) {
      throw notFoundError(ErrorCode.NOT_FOUND_MENU_ITEM, "Menu item not found");
    }

    // Soft delete by marking as inactive
    await prisma.menuItem.update({
      where: { id },
      data: { isActive: false },
    });
  }

  /**
   * Find all menu items, optionally including inactive ones
   * Requirements: 2.4
   */
  async findAll(
    includeInactive: boolean = false
  ): Promise<MenuItemWithIngredients[]> {
    const menuItems = await prisma.menuItem.findMany({
      where: includeInactive ? {} : { isActive: true },
      include: {
        ingredients: {
          include: {
            ingredient: true,
          },
        },
      },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    });

    return menuItems.map(this.mapToMenuItemWithIngredients);
  }

  /**
   * Find menu item by ID
   */
  async findById(id: string): Promise<MenuItemWithIngredients | null> {
    const menuItem = await prisma.menuItem.findUnique({
      where: { id },
      include: {
        ingredients: {
          include: {
            ingredient: true,
          },
        },
      },
    });

    if (!menuItem) {
      return null;
    }

    return this.mapToMenuItemWithIngredients(menuItem);
  }

  /**
   * Get menu items with availability status based on current stock
   * Requirements: 7.1, 7.3, 7.4
   */
  async getAvailability(): Promise<MenuItemAvailability[]> {
    const menuItems = await prisma.menuItem.findMany({
      where: { isActive: true },
      include: {
        ingredients: {
          include: {
            ingredient: true,
          },
        },
      },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    });

    return menuItems.map((item) => {
      const availableServings = this.calculateAvailableServings(
        item.ingredients
      );

      let status: "available" | "limited" | "unavailable";
      if (availableServings === 0) {
        status = "unavailable";
      } else if (availableServings <= 5) {
        status = "limited";
      } else {
        status = "available";
      }

      return {
        menuItemId: item.id,
        name: item.name,
        availableServings,
        status,
      };
    });
  }

  /**
   * Calculate available servings based on ingredient stock
   * Returns the minimum servings possible across all ingredients
   */
  private calculateAvailableServings(
    ingredients: Array<{
      quantityPerServing: Decimal;
      ingredient: { currentStock: Decimal };
    }>
  ): number {
    if (ingredients.length === 0) {
      return 0;
    }

    let minServings = Infinity;

    for (const mapping of ingredients) {
      const stock = Number(mapping.ingredient.currentStock);
      const perServing = Number(mapping.quantityPerServing);

      if (perServing <= 0) {
        continue;
      }

      const possibleServings = Math.floor(stock / perServing);
      minServings = Math.min(minServings, possibleServings);
    }

    return minServings === Infinity ? 0 : minServings;
  }

  /**
   * Validate menu item data for creation
   */
  private validateMenuItemData(data: CreateMenuItemDTO): void {
    const errors: string[] = [];

    if (!data.name || data.name.trim() === "") {
      errors.push("Name is required");
    }

    if (data.price === undefined || data.price === null) {
      errors.push("Price is required");
    } else if (data.price < 0) {
      errors.push("Price must be non-negative");
    }

    if (!data.category || data.category.trim() === "") {
      errors.push("Category is required");
    }

    if (!data.ingredients || data.ingredients.length === 0) {
      errors.push("At least one ingredient mapping is required");
    } else {
      for (const ing of data.ingredients) {
        if (!ing.ingredientId) {
          errors.push("Ingredient ID is required for each mapping");
        }
        if (
          ing.quantityPerServing === undefined ||
          ing.quantityPerServing <= 0
        ) {
          errors.push("Quantity per serving must be positive");
        }
      }
    }

    if (errors.length > 0) {
      throw validationError(errors.join(", "), { errors });
    }
  }

  /**
   * Validate partial menu item data for updates
   */
  private validatePartialMenuItemData(
    data: UpdateMenuItemDTO,
    existing: { name: string; price: Decimal; category: string }
  ): void {
    const errors: string[] = [];

    const name = data.name !== undefined ? data.name : existing.name;
    const price =
      data.price !== undefined ? data.price : Number(existing.price);
    const category =
      data.category !== undefined ? data.category : existing.category;

    if (!name || name.trim() === "") {
      errors.push("Name cannot be empty");
    }

    if (price < 0) {
      errors.push("Price must be non-negative");
    }

    if (!category || category.trim() === "") {
      errors.push("Category cannot be empty");
    }

    if (data.ingredients !== undefined) {
      if (data.ingredients.length === 0) {
        errors.push("At least one ingredient mapping is required");
      } else {
        for (const ing of data.ingredients) {
          if (!ing.ingredientId) {
            errors.push("Ingredient ID is required for each mapping");
          }
          if (
            ing.quantityPerServing === undefined ||
            ing.quantityPerServing <= 0
          ) {
            errors.push("Quantity per serving must be positive");
          }
        }
      }
    }

    if (errors.length > 0) {
      throw validationError(errors.join(", "), { errors });
    }
  }

  /**
   * Verify that all ingredient IDs exist in the database
   */
  private async verifyIngredientsExist(ingredientIds: string[]): Promise<void> {
    const ingredients = await prisma.ingredient.findMany({
      where: { id: { in: ingredientIds } },
      select: { id: true },
    });

    const foundIds = new Set(ingredients.map((i) => i.id));
    const missingIds = ingredientIds.filter((id) => !foundIds.has(id));

    if (missingIds.length > 0) {
      throw notFoundError(
        ErrorCode.NOT_FOUND_INGREDIENT,
        `Ingredients not found: ${missingIds.join(", ")}`
      );
    }
  }

  /**
   * Map Prisma MenuItem to MenuItemWithIngredients type
   */
  private mapToMenuItemWithIngredients(item: {
    id: string;
    name: string;
    price: Decimal;
    category: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    ingredients: Array<{
      ingredientId: string;
      quantityPerServing: Decimal;
      ingredient: {
        name: string;
        unit: string;
      };
    }>;
  }): MenuItemWithIngredients {
    return {
      id: item.id,
      name: item.name,
      price: Number(item.price),
      category: item.category,
      isActive: item.isActive,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      ingredients: item.ingredients.map((ing) => ({
        ingredientId: ing.ingredientId,
        ingredientName: ing.ingredient.name,
        unit: ing.ingredient.unit,
        quantityPerServing: Number(ing.quantityPerServing),
      })),
    };
  }
}

// Export singleton instance
export const menuService = new MenuService();
