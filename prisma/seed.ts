import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

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

  // Create ingredients
  const coffee = await prisma.ingredient.upsert({
    where: { id: "ing-coffee" },
    update: {},
    create: {
      id: "ing-coffee",
      name: "Coffee Beans",
      unit: "kg",
      currentStock: 10,
      minThreshold: 2,
    },
  });

  const milk = await prisma.ingredient.upsert({
    where: { id: "ing-milk" },
    update: {},
    create: {
      id: "ing-milk",
      name: "Milk",
      unit: "liters",
      currentStock: 20,
      minThreshold: 5,
    },
  });

  const sugar = await prisma.ingredient.upsert({
    where: { id: "ing-sugar" },
    update: {},
    create: {
      id: "ing-sugar",
      name: "Sugar",
      unit: "kg",
      currentStock: 5,
      minThreshold: 1,
    },
  });

  const bread = await prisma.ingredient.upsert({
    where: { id: "ing-bread" },
    update: {},
    create: {
      id: "ing-bread",
      name: "Bread",
      unit: "loaves",
      currentStock: 15,
      minThreshold: 3,
    },
  });

  const cheese = await prisma.ingredient.upsert({
    where: { id: "ing-cheese" },
    update: {},
    create: {
      id: "ing-cheese",
      name: "Cheese",
      unit: "kg",
      currentStock: 3,
      minThreshold: 1,
    },
  });

  // Low stock ingredient for testing alerts
  const butter = await prisma.ingredient.upsert({
    where: { id: "ing-butter" },
    update: {},
    create: {
      id: "ing-butter",
      name: "Butter",
      unit: "kg",
      currentStock: 0.5,
      minThreshold: 1,
    },
  });
  console.log("✅ Created ingredients");

  // Create menu items
  const espresso = await prisma.menuItem.upsert({
    where: { id: "menu-espresso" },
    update: {},
    create: {
      id: "menu-espresso",
      name: "Espresso",
      price: 3.5,
      category: "Beverages",
      isActive: true,
    },
  });

  const latte = await prisma.menuItem.upsert({
    where: { id: "menu-latte" },
    update: {},
    create: {
      id: "menu-latte",
      name: "Latte",
      price: 4.5,
      category: "Beverages",
      isActive: true,
    },
  });

  const sandwich = await prisma.menuItem.upsert({
    where: { id: "menu-sandwich" },
    update: {},
    create: {
      id: "menu-sandwich",
      name: "Grilled Cheese Sandwich",
      price: 7.0,
      category: "Food",
      isActive: true,
    },
  });

  const croissant = await prisma.menuItem.upsert({
    where: { id: "menu-croissant" },
    update: {},
    create: {
      id: "menu-croissant",
      name: "Butter Croissant",
      price: 3.0,
      category: "Pastries",
      isActive: true,
    },
  });
  console.log("✅ Created menu items");

  // Link ingredients to menu items
  await prisma.menuItemIngredient.upsert({
    where: {
      menuItemId_ingredientId: {
        menuItemId: espresso.id,
        ingredientId: coffee.id,
      },
    },
    update: {},
    create: {
      menuItemId: espresso.id,
      ingredientId: coffee.id,
      quantityPerServing: 0.02,
    },
  });

  await prisma.menuItemIngredient.upsert({
    where: {
      menuItemId_ingredientId: {
        menuItemId: latte.id,
        ingredientId: coffee.id,
      },
    },
    update: {},
    create: {
      menuItemId: latte.id,
      ingredientId: coffee.id,
      quantityPerServing: 0.02,
    },
  });

  await prisma.menuItemIngredient.upsert({
    where: {
      menuItemId_ingredientId: { menuItemId: latte.id, ingredientId: milk.id },
    },
    update: {},
    create: {
      menuItemId: latte.id,
      ingredientId: milk.id,
      quantityPerServing: 0.2,
    },
  });

  await prisma.menuItemIngredient.upsert({
    where: {
      menuItemId_ingredientId: {
        menuItemId: sandwich.id,
        ingredientId: bread.id,
      },
    },
    update: {},
    create: {
      menuItemId: sandwich.id,
      ingredientId: bread.id,
      quantityPerServing: 0.5,
    },
  });

  await prisma.menuItemIngredient.upsert({
    where: {
      menuItemId_ingredientId: {
        menuItemId: sandwich.id,
        ingredientId: cheese.id,
      },
    },
    update: {},
    create: {
      menuItemId: sandwich.id,
      ingredientId: cheese.id,
      quantityPerServing: 0.05,
    },
  });

  await prisma.menuItemIngredient.upsert({
    where: {
      menuItemId_ingredientId: {
        menuItemId: croissant.id,
        ingredientId: butter.id,
      },
    },
    update: {},
    create: {
      menuItemId: croissant.id,
      ingredientId: butter.id,
      quantityPerServing: 0.03,
    },
  });
  console.log("✅ Linked ingredients to menu items");

  // Create a sample order
  const order = await prisma.order.create({
    data: {
      waiterId: waiter1.id,
      status: "PAID",
      paymentType: "CASH",
      total: 12.0,
      paidAt: new Date(),
      items: {
        create: [
          { menuItemId: espresso.id, quantity: 2, unitPrice: 3.5 },
          { menuItemId: latte.id, quantity: 1, unitPrice: 4.5 },
        ],
      },
    },
  });
  console.log("✅ Created sample order:", order.id);

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
