import {
  boolean,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("Role", ["ADMIN", "CASHIER", "EMPLOYEE"]);
export const stationEnum = pgEnum("Station", ["BAR", "KITCHEN"]);
export const orderStatusEnum = pgEnum("OrderStatus", [
  "PENDING",
  "PENDING_VERIFICATION",
  "PAID",
  "CANCELLED",
]);
export const paymentTypeEnum = pgEnum("PaymentType", ["CASH", "DIGITAL"]);

export const users = pgTable("User", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("passwordHash").notNull(),
  name: text("name").notNull(),
  nameAm: text("nameAm"),
  role: roleEnum("role").notNull(),
  salary: numeric("salary", { precision: 65, scale: 30 }),
  hireDate: timestamp("hireDate", { mode: "date", withTimezone: false }).notNull(),
  releaseDate: timestamp("releaseDate", { mode: "date", withTimezone: false }),
  isActive: boolean("isActive").notNull().default(true),
  phone: text("phone"),
  createdAt: timestamp("createdAt", { mode: "date", withTimezone: false })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: false })
    .notNull()
    .defaultNow(),
});

export const salaryHistory = pgTable("SalaryHistory", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  salary: numeric("salary", { precision: 65, scale: 30 }).notNull(),
  createdAt: timestamp("createdAt", { mode: "date", withTimezone: false })
    .notNull()
    .defaultNow(),
});

export const menuItems = pgTable("MenuItem", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  nameAm: text("nameAm"),
  price: numeric("price", { precision: 65, scale: 30 }).notNull(),
  category: text("category").notNull(),
  categoryAm: text("categoryAm"),
  station: stationEnum("station").notNull().default("BAR"),
  imageUrl: text("imageUrl"),
  isActive: boolean("isActive").notNull().default(true),
  createdAt: timestamp("createdAt", { mode: "date", withTimezone: false })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: false })
    .notNull()
    .defaultNow(),
});

export const ingredients = pgTable("Ingredient", {
  id: varchar("id", { length: 191 }).primaryKey(),
  nameAm: text("nameAm"),
  name: text("name").notNull(),
  unit: text("unit").notNull(),
  currentStock: numeric("currentStock", { precision: 65, scale: 30 }).notNull(),
  minThreshold: numeric("minThreshold", { precision: 65, scale: 30 }).notNull(),
  createdAt: timestamp("createdAt", { mode: "date", withTimezone: false })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: false })
    .notNull()
    .defaultNow(),
});

export const menuItemIngredients = pgTable(
  "MenuItemIngredient",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    menuItemId: uuid("menuItemId")
      .notNull()
      .references(() => menuItems.id),
    ingredientId: varchar("ingredientId", { length: 191 })
      .notNull()
      .references(() => ingredients.id),
    quantityPerServing: numeric("quantityPerServing", {
      precision: 65,
      scale: 30,
    }).notNull(),
  },
  (table) => ({
    menuIngredientUnique: unique().on(table.menuItemId, table.ingredientId),
  })
);

export const stockAdjustments = pgTable("StockAdjustment", {
  id: uuid("id").defaultRandom().primaryKey(),
  ingredientId: varchar("ingredientId", { length: 191 })
    .notNull()
    .references(() => ingredients.id),
  quantity: numeric("quantity", { precision: 65, scale: 30 }).notNull(),
  reason: text("reason").notNull(),
  createdAt: timestamp("createdAt", { mode: "date", withTimezone: false })
    .notNull()
    .defaultNow(),
});

export const orders = pgTable("Order", {
  id: uuid("id").defaultRandom().primaryKey(),
  waiterId: uuid("waiterId")
    .notNull()
    .references(() => users.id),
  tableNumber: text("tableNumber"),
  dailyOrderNumber: integer("dailyOrderNumber").notNull().default(0),
  status: orderStatusEnum("status").notNull().default("PENDING"),
  paymentType: paymentTypeEnum("paymentType"),
  receiptUrl: text("receiptUrl"),
  total: numeric("total", { precision: 65, scale: 30 }).notNull(),
  tipAmount: numeric("tipAmount", { precision: 65, scale: 30 }),
  createdAt: timestamp("createdAt", { mode: "date", withTimezone: false })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: false })
    .notNull()
    .defaultNow(),
  paidAt: timestamp("paidAt", { mode: "date", withTimezone: false }),
});

export const orderItems = pgTable("OrderItem", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("orderId")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  menuItemId: uuid("menuItemId")
    .notNull()
    .references(() => menuItems.id),
  quantity: integer("quantity").notNull(),
  unitPrice: numeric("unitPrice", { precision: 65, scale: 30 }).notNull(),
});

export const notificationPreferences = pgTable("NotificationPreference", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("userId")
    .notNull()
    .unique()
    .references(() => users.id),
  lowStock: boolean("lowStock").notNull().default(true),
  largeOrders: boolean("largeOrders").notNull().default(true),
  employeeActions: boolean("employeeActions").notNull().default(true),
  createdAt: timestamp("createdAt", { mode: "date", withTimezone: false })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: false })
    .notNull()
    .defaultNow(),
});
