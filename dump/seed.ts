import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");
  const seedDir = path.dirname(fileURLToPath(import.meta.url));
  const dataDir = path.join(seedDir, "..", "dump");
  const [ingredientsRaw, menuItemsRaw, menuItemIngredientsRaw] =
    await Promise.all([
      fs.readFile(path.join(dataDir, "ingredients.json"), "utf-8"),
      fs.readFile(path.join(dataDir, "menuItems.json"), "utf-8"),
      fs.readFile(path.join(dataDir, "menuItemIngrediets.json"), "utf-8"),
    ]);

  const ingredientsData = JSON.parse(ingredientsRaw) as Array<{
    name: string;
    nameAm?: string;
    unit: string;
    currentStock: string | number;
    minThreshold: string | number;
  }>;

  const menuItemsData = JSON.parse(menuItemsRaw) as Array<{
    name: string;
    nameAm?: string;
    station: "BAR" | "KITCHEN";
    category: string;
    categoryAm?: string;
    price: number;
  }>;

  const menuItemIngredientsData = JSON.parse(menuItemIngredientsRaw) as Array<{
    menuItem: string;
    ingredients: Array<{ name: string; quantity: string }>;
  }>;

  // Create admin user
  const adminPassword = await bcrypt.hash("admin123", 10);
  const admin = await prisma.user.upsert({
    where: { email: "admin@cafe.com" },
    update: {},
    create: {
      email: "admin@cafe.com",
      passwordHash: adminPassword,
      name: "Admin User",
      role: "ADMIN",
      hireDate: new Date("2024-01-01"),
      isActive: true,
    },
  });
  console.log("✅ Created admin:", admin.email);

  // Create waiter employees
  const waiterPassword = await bcrypt.hash("waiter123", 10);
  const waiter1 = await prisma.user.upsert({
    where: { email: "john@cafe.com" },
    update: {},
    create: {
      email: "john@cafe.com",
      passwordHash: waiterPassword,
      name: "John Doe",
      role: "EMPLOYEE",
      salary: 3000,
      hireDate: new Date("2024-06-01"),
      isActive: true,
      phone: "555-0101",
    },
  });

  const waiter2 = await prisma.user.upsert({
    where: { email: "jane@cafe.com" },
    update: {},
    create: {
      email: "jane@cafe.com",
      passwordHash: waiterPassword,
      name: "Jane Smith",
      role: "EMPLOYEE",
      salary: 3200,
      hireDate: new Date("2024-03-15"),
      isActive: true,
      phone: "555-0102",
    },
  });
  console.log("✅ Created waiters:", waiter1.name, waiter2.name);

  const ingredientIdByName = new Map<string, string>();
  for (const ingredient of ingredientsData) {
    const currentStock = Number(ingredient.currentStock);
    const minThreshold = Number(ingredient.minThreshold);
    const existing = await prisma.ingredient.findFirst({
      where: { name: ingredient.name },
    });
    const record = existing
      ? await prisma.ingredient.update({
          where: { id: existing.id },
          data: {
            nameAm: ingredient.nameAm ?? undefined,
            unit: ingredient.unit,
            currentStock: Number.isNaN(currentStock) ? 0 : currentStock,
            minThreshold: Number.isNaN(minThreshold) ? 0 : minThreshold,
          },
        })
      : await prisma.ingredient.create({
          data: {
            name: ingredient.name,
            nameAm: ingredient.nameAm ?? undefined,
            unit: ingredient.unit,
            currentStock: Number.isNaN(currentStock) ? 0 : currentStock,
            minThreshold: Number.isNaN(minThreshold) ? 0 : minThreshold,
          },
        });
    ingredientIdByName.set(record.name, record.id);
  }
  console.log("✅ Seeded ingredients:", ingredientIdByName.size);

  const menuItemIdByName = new Map<string, string>();
  for (const menuItem of menuItemsData) {
    const existing = await prisma.menuItem.findFirst({
      where: { name: menuItem.name },
    });
    const record = existing
      ? await prisma.menuItem.update({
          where: { id: existing.id },
          data: {
            nameAm: menuItem.nameAm ?? undefined,
            price: menuItem.price,
            category: menuItem.category,
            categoryAm: menuItem.categoryAm ?? undefined,
            station: menuItem.station,
            isActive: true,
          },
        })
      : await prisma.menuItem.create({
          data: {
            name: menuItem.name,
            nameAm: menuItem.nameAm ?? undefined,
            price: menuItem.price,
            category: menuItem.category,
            categoryAm: menuItem.categoryAm ?? undefined,
            station: menuItem.station,
            isActive: true,
          },
        });
    menuItemIdByName.set(record.name, record.id);
  }
  console.log("✅ Seeded menu items:", menuItemIdByName.size);

  const ingredientAliases: Record<string, string> = {
    Pepper: "Pepper (Green/Chili)",
  };

  for (const entry of menuItemIngredientsData) {
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

      await prisma.menuItemIngredient.upsert({
        where: {
          menuItemId_ingredientId: { menuItemId, ingredientId },
        },
        update: {
          quantityPerServing: quantityValue,
        },
        create: {
          menuItemId,
          ingredientId,
          quantityPerServing: quantityValue,
        },
      });
    }
  }
  console.log("✅ Seeded menu item ingredients");

  // Create notification preferences for admin
  await prisma.notificationPreference.upsert({
    where: { userId: admin.id },
    update: {},
    create: {
      userId: admin.id,
      lowStock: true,
      largeOrders: true,
      employeeActions: true,
    },
  });
  console.log("✅ Created notification preferences");

  console.log("🎉 Seeding complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
