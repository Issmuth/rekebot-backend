CREATE TYPE "public"."OrderStatus" AS ENUM('PENDING', 'PENDING_VERIFICATION', 'PAID', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."PaymentType" AS ENUM('CASH', 'DIGITAL');--> statement-breakpoint
CREATE TYPE "public"."Role" AS ENUM('ADMIN', 'EMPLOYEE');--> statement-breakpoint
CREATE TYPE "public"."Station" AS ENUM('BAR', 'KITCHEN');--> statement-breakpoint
CREATE TABLE "Ingredient" (
	"id" varchar(191) PRIMARY KEY NOT NULL,
	"nameAm" text,
	"name" text NOT NULL,
	"unit" text NOT NULL,
	"currentStock" numeric(65, 30) NOT NULL,
	"minThreshold" numeric(65, 30) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "MenuItemIngredient" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"menuItemId" uuid NOT NULL,
	"ingredientId" varchar(191) NOT NULL,
	"quantityPerServing" numeric(65, 30) NOT NULL,
	CONSTRAINT "MenuItemIngredient_menuItemId_ingredientId_unique" UNIQUE("menuItemId","ingredientId")
);
--> statement-breakpoint
CREATE TABLE "MenuItem" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"nameAm" text,
	"price" numeric(65, 30) NOT NULL,
	"category" text NOT NULL,
	"categoryAm" text,
	"station" "Station" DEFAULT 'BAR' NOT NULL,
	"imageUrl" text,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "NotificationPreference" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"lowStock" boolean DEFAULT true NOT NULL,
	"largeOrders" boolean DEFAULT true NOT NULL,
	"employeeActions" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "NotificationPreference_userId_unique" UNIQUE("userId")
);
--> statement-breakpoint
CREATE TABLE "OrderItem" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"orderId" uuid NOT NULL,
	"menuItemId" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"unitPrice" numeric(65, 30) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Order" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"waiterId" uuid NOT NULL,
	"tableNumber" text,
	"dailyOrderNumber" integer DEFAULT 0 NOT NULL,
	"status" "OrderStatus" DEFAULT 'PENDING' NOT NULL,
	"paymentType" "PaymentType",
	"receiptUrl" text,
	"total" numeric(65, 30) NOT NULL,
	"tipAmount" numeric(65, 30),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"paidAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "SalaryHistory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"salary" numeric(65, 30) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "StockAdjustment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ingredientId" varchar(191) NOT NULL,
	"quantity" numeric(65, 30) NOT NULL,
	"reason" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "User" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"passwordHash" text NOT NULL,
	"name" text NOT NULL,
	"nameAm" text,
	"role" "Role" NOT NULL,
	"salary" numeric(65, 30),
	"hireDate" timestamp NOT NULL,
	"releaseDate" timestamp,
	"isActive" boolean DEFAULT true NOT NULL,
	"phone" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "User_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "MenuItemIngredient" ADD CONSTRAINT "MenuItemIngredient_menuItemId_MenuItem_id_fk" FOREIGN KEY ("menuItemId") REFERENCES "public"."MenuItem"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "MenuItemIngredient" ADD CONSTRAINT "MenuItemIngredient_ingredientId_Ingredient_id_fk" FOREIGN KEY ("ingredientId") REFERENCES "public"."Ingredient"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_Order_id_fk" FOREIGN KEY ("orderId") REFERENCES "public"."Order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_menuItemId_MenuItem_id_fk" FOREIGN KEY ("menuItemId") REFERENCES "public"."MenuItem"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Order" ADD CONSTRAINT "Order_waiterId_User_id_fk" FOREIGN KEY ("waiterId") REFERENCES "public"."User"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "SalaryHistory" ADD CONSTRAINT "SalaryHistory_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "StockAdjustment" ADD CONSTRAINT "StockAdjustment_ingredientId_Ingredient_id_fk" FOREIGN KEY ("ingredientId") REFERENCES "public"."Ingredient"("id") ON DELETE no action ON UPDATE no action;