// Shared types and DTOs

export type Role = "ADMIN" | "CASHIER" | "EMPLOYEE";
export type OrderStatus =
  | "PENDING"
  | "PENDING_VERIFICATION"
  | "PAID"
  | "CANCELLED";
export type PaymentType = "CASH" | "DIGITAL";

// Employee DTOs
export interface CheckDTO {
  // ...
}

export interface CreateEmployeeDTO {
  email: string;
  password?: string;
  pin?: string;
  name: string;
  nameAm?: string;
  role: Role;
  salary?: number;
  phone?: string;
}

export interface UpdateEmployeeDTO {
  name?: string;
  nameAm?: string;
  salary?: number;
  phone?: string;
  isActive?: boolean;
}

// Menu DTOs
export interface MenuItemStats {
  daily: number;
  weekly: number;
  monthly: number;
}

export type Station = "BAR" | "KITCHEN";

export interface CreateMenuItemDTO {
  name: string;
  nameAm?: string;
  price: number;
  category: string;
  categoryAm?: string;
  station?: Station;
  imageUrl?: string;
  ingredients: { ingredientId: string; quantityPerServing: number }[];
}

export interface UpdateMenuItemDTO {
  name?: string;
  nameAm?: string;
  price?: number;
  category?: string;
  categoryAm?: string;
  station?: Station;
  imageUrl?: string;
  ingredients?: { ingredientId: string; quantityPerServing: number }[];
  isActive?: boolean;
}

// Ingredient DTOs
export interface CreateIngredientDTO {
  name: string;
  nameAm?: string;
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
  tipAmount?: number;
}

// Analytics DTOs
export interface DashboardData {
  todayRevenue: number;
  weeklyRevenue: number;
  monthlyRevenue: number;
  todayTips: number;
  weeklyTips: number;
  monthlyTips: number;
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
    nameAm?: string;
    name: string;
    role: Role;
  };
}

export interface WaiterProfile {
  id: string;
  name: string;
  nameAm?: string | null;
}
