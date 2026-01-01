// Shared types and DTOs

export type Role = "ADMIN" | "EMPLOYEE";
export type OrderStatus = "PENDING" | "PAID" | "CANCELLED";
export type PaymentType = "CASH" | "DIGITAL";

// Employee DTOs
export interface CreateEmployeeDTO {
  email: string;
  password: string;
  name: string;
  role: Role;
  salary?: number;
  phone?: string;
}

export interface UpdateEmployeeDTO {
  name?: string;
  salary?: number;
  phone?: string;
  isActive?: boolean;
}

// Menu DTOs
export interface CreateMenuItemDTO {
  name: string;
  price: number;
  category: string;
  ingredients: { ingredientId: string; quantityPerServing: number }[];
}

export interface UpdateMenuItemDTO {
  name?: string;
  price?: number;
  category?: string;
  ingredients?: { ingredientId: string; quantityPerServing: number }[];
  isActive?: boolean;
}

// Ingredient DTOs
export interface CreateIngredientDTO {
  name: string;
  unit: string;
  currentStock: number;
  minThreshold: number;
}

// Order DTOs
export interface OrderItemDTO {
  menuItemId: string;
  quantity: number;
}

export interface ConfirmPaymentDTO {
  paymentType: PaymentType;
  receiptImage?: string;
}

// Analytics DTOs
export interface DashboardData {
  todayRevenue: number;
  weeklyRevenue: number;
  monthlyRevenue: number;
  topItems: { name: string; count: number }[];
  lowStockCount: number;
  pendingOrders: number;
}

export interface ConsumptionData {
  ingredientId: string;
  ingredientName: string;
  weeklyAverage: number;
  unit: string;
}

export interface DateRange {
  start: Date;
  end: Date;
}

// Availability types
export interface AvailabilityResult {
  available: boolean;
  availableServings: number;
  limitingIngredient?: string;
}

export interface MenuItemAvailability {
  menuItemId: string;
  name: string;
  availableServings: number;
  status: "available" | "limited" | "unavailable";
}

// Notification types
export interface NotificationPreferences {
  lowStock: boolean;
  largeOrders: boolean;
  employeeActions: boolean;
}

// Auth types
export interface AuthResult {
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: Role;
  };
}

export interface WaiterProfile {
  id: string;
  name: string;
}
