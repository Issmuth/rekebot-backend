import "dotenv/config";
import bcrypt from "bcryptjs";
import fs from "fs/promises";
import path from "path";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  ingredients,
  menuItemIngredients,
  menuItems,
  notificationPreferences,
  users,
} from "../db/schema";
import { db, pool } from "../lib/drizzle";

type IngredientSeed = {
  name: string;
  nameAm?: string;
  unit: string;
  currentStock: string | number;
  minThreshold: string | number;
};

type MenuItemSeed = {
  name: string;
  nameAm?: string;
  station: "BAR" | "KITCHEN";
  category: string;
  categoryAm?: string;
  price: number;
};

type MenuItemIngredientSeed = {
  menuItem: string;
  ingredients: Array<{ name: string; quantity: string }>;
};

async function seedUsers() {
  const adminPassword = await bcrypt.hash("admin123", 10);
  const cashierPassword = await bcrypt.hash("cashier123", 10);
  const waiterPassword = await bcrypt.hash("waiter123", 10);
  const now = new Date();

  const upsertUser = async (data: {
    email: string;
    passwordHash: string;
    name: string;
    role: "ADMIN" | "CASHIER" | "EMPLOYEE";
    salary?: string;
    hireDate: Date;
    isActive: boolean;
    phone?: string;
  }) => {
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, data.email))
      .limit(1);

    if (existing) {
      const [updated] = await db
        .update(users)
        .set({
          passwordHash: data.passwordHash,
          name: data.name,
          role: data.role,
          salary: data.salary ?? null,
          hireDate: data.hireDate,
          isActive: data.isActive,
          phone: data.phone ?? null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, existing.id))
        .returning({ id: users.id, email: users.email, name: users.name });

      return updated;
    }

    const [created] = await db
      .insert(users)
      .values({
        id: randomUUID(),
        email: data.email,
        passwordHash: data.passwordHash,
        name: data.name,
        role: data.role,
        salary: data.salary ?? null,
        hireDate: data.hireDate,
        isActive: data.isActive,
        phone: data.phone ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: users.id, email: users.email, name: users.name });

    return created;
  };

  const admin = await upsertUser({
    email: "admin@cafe.com",
    passwordHash: adminPassword,
    name: "Admin User",
    role: "ADMIN",
    hireDate: new Date("2024-01-01"),
    isActive: true,
  });

  const cashier = await upsertUser({
    email: "cashier@cafe.com",
    passwordHash: cashierPassword,
    name: "Cashier User",
    role: "CASHIER",
    hireDate: new Date("2024-02-01"),
    isActive: true,
  });

  const waiter1 = await upsertUser({
    email: "john@cafe.com",
    passwordHash: waiterPassword,
    name: "John Doe",
    role: "EMPLOYEE",
    salary: "3000",
    hireDate: new Date("2024-06-01"),
    isActive: true,
    phone: "555-0101",
  });

  const waiter2 = await upsertUser({
    email: "jane@cafe.com",
    passwordHash: waiterPassword,
    name: "Jane Smith",
    role: "EMPLOYEE",
    salary: "3200",
    hireDate: new Date("2024-03-15"),
    isActive: true,
    phone: "555-0102",
  });

  const [existingPref] = await db
    .select({ id: notificationPreferences.id })
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, admin.id))
    .limit(1);

  if (existingPref) {
    await db
      .update(notificationPreferences)
      .set({
        lowStock: true,
        largeOrders: true,
        employeeActions: true,
        updatedAt: new Date(),
      })
      .where(eq(notificationPreferences.id, existingPref.id));
  } else {
    await db.insert(notificationPreferences).values({
      id: randomUUID(),
      userId: admin.id,
      lowStock: true,
      largeOrders: true,
      employeeActions: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  console.log("✅ Created admin:", admin.email);
  console.log("✅ Created cashier:", cashier.email);
  console.log("✅ Created waiters:", waiter1.name, waiter2.name);
}

async function seedIngredients(data: IngredientSeed[]) {
  const ingredientIdByName = new Map<string, string>();
  const now = new Date();

  for (const ingredient of data) {
    const currentStock = Number(ingredient.currentStock);
    const minThreshold = Number(ingredient.minThreshold);

    const [existing] = await db
      .select({ id: ingredients.id, name: ingredients.name })
      .from(ingredients)
      .where(eq(ingredients.name, ingredient.name))
      .limit(1);

    if (existing) {
      const [updated] = await db
        .update(ingredients)
        .set({
          nameAm: ingredient.nameAm ?? null,
          unit: ingredient.unit,
          currentStock: String(Number.isNaN(currentStock) ? 0 : currentStock),
          minThreshold: String(Number.isNaN(minThreshold) ? 0 : minThreshold),
          updatedAt: new Date(),
        })
        .where(eq(ingredients.id, existing.id))
        .returning({ id: ingredients.id, name: ingredients.name });

      ingredientIdByName.set(updated.name, updated.id);
      continue;
    }

    const [created] = await db
      .insert(ingredients)
      .values({
        id: randomUUID(),
        name: ingredient.name,
        nameAm: ingredient.nameAm ?? null,
        unit: ingredient.unit,
        currentStock: String(Number.isNaN(currentStock) ? 0 : currentStock),
        minThreshold: String(Number.isNaN(minThreshold) ? 0 : minThreshold),
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: ingredients.id, name: ingredients.name });

    ingredientIdByName.set(created.name, created.id);
  }

  console.log("✅ Seeded ingredients:", ingredientIdByName.size);
  return ingredientIdByName;
}

async function seedMenuItems(data: MenuItemSeed[]) {
  const menuItemIdByName = new Map<string, string>();
  const now = new Date();

  for (const menuItem of data) {
    const [existing] = await db
      .select({ id: menuItems.id, name: menuItems.name })
      .from(menuItems)
      .where(eq(menuItems.name, menuItem.name))
      .limit(1);

    if (existing) {
      const [updated] = await db
        .update(menuItems)
        .set({
          nameAm: menuItem.nameAm ?? null,
          price: String(menuItem.price),
          category: menuItem.category,
          categoryAm: menuItem.categoryAm ?? null,
          station: menuItem.station,
          isActive: true,
          updatedAt: new Date(),
        })
        .where(eq(menuItems.id, existing.id))
        .returning({ id: menuItems.id, name: menuItems.name });

      menuItemIdByName.set(updated.name, updated.id);
      continue;
    }

    const [created] = await db
      .insert(menuItems)
      .values({
        id: randomUUID(),
        name: menuItem.name,
        nameAm: menuItem.nameAm ?? null,
        price: String(menuItem.price),
        category: menuItem.category,
        categoryAm: menuItem.categoryAm ?? null,
        station: menuItem.station,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: menuItems.id, name: menuItems.name });

    menuItemIdByName.set(created.name, created.id);
  }

  console.log("✅ Seeded menu items:", menuItemIdByName.size);
  return menuItemIdByName;
}

async function seedMenuItemIngredients(
  data: MenuItemIngredientSeed[],
  ingredientIdByName: Map<string, string>,
  menuItemIdByName: Map<string, string>
) {
  const ingredientAliases: Record<string, string> = {
    Pepper: "Pepper (Green/Chili)",
  };

  for (const entry of data) {
    const menuItemId = menuItemIdByName.get(entry.menuItem);
    if (!menuItemId) {
      console.warn("⚠️ Menu item missing for junction:", entry.menuItem);
      continue;
    }

    for (const ingredient of entry.ingredients) {
      const normalizedName = ingredientAliases[ingredient.name] ?? ingredient.name;
      const ingredientId = ingredientIdByName.get(normalizedName);

      if (!ingredientId) {
        console.warn(
          "⚠️ Ingredient missing for junction:",
          entry.menuItem,
          "->",
          ingredient.name
        );
        continue;
      }

      const quantityMatch = ingredient.quantity.match(/\d+(?:\.\d+)?/);
      const quantityValue = quantityMatch ? Number(quantityMatch[0]) : 0;

      if (!quantityMatch) {
        console.warn(
          "⚠️ Non-numeric quantity, defaulting to 0:",
          entry.menuItem,
          "->",
          ingredient.name,
          "=",
          ingredient.quantity
        );
      }

      await db
        .update(menuItemIngredients)
        .set({ quantityPerServing: String(quantityValue) })
        .where(
          and(
            eq(menuItemIngredients.menuItemId, menuItemId),
            eq(menuItemIngredients.ingredientId, ingredientId)
          )
        );

      const [existingMapping] = await db
        .select({ id: menuItemIngredients.id })
        .from(menuItemIngredients)
        .where(
          and(
            eq(menuItemIngredients.menuItemId, menuItemId),
            eq(menuItemIngredients.ingredientId, ingredientId)
          )
        )
        .limit(1);

      if (!existingMapping) {
        await db.insert(menuItemIngredients).values({
          id: randomUUID(),
          menuItemId,
          ingredientId,
          quantityPerServing: String(quantityValue),
        });
      }
    }
  }

  console.log("✅ Seeded menu item ingredients");
}

async function main() {
  console.log("🌱 Seeding database with Drizzle...");

  const dataDir = path.join(process.cwd(), "dump");
  const [ingredientsRaw, menuItemsRaw, menuItemIngredientsRaw] = await Promise.all([
    fs.readFile(path.join(dataDir, "ingredients.json"), "utf-8"),
    fs.readFile(path.join(dataDir, "menuItems.json"), "utf-8"),
    fs.readFile(path.join(dataDir, "menuItemIngrediets.json"), "utf-8"),
  ]);

  const ingredientsData = JSON.parse(ingredientsRaw) as IngredientSeed[];
  const menuItemsData = JSON.parse(menuItemsRaw) as MenuItemSeed[];
  const menuItemIngredientsData = JSON.parse(
    menuItemIngredientsRaw
  ) as MenuItemIngredientSeed[];

  await seedUsers();
  const ingredientIdByName = await seedIngredients(ingredientsData);
  const menuItemIdByName = await seedMenuItems(menuItemsData);
  await seedMenuItemIngredients(
    menuItemIngredientsData,
    ingredientIdByName,
    menuItemIdByName
  );

  console.log("🎉 Seeding complete!");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
