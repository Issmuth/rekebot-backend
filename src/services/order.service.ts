import { and, desc, eq, gt, gte, inArray, lt, lte } from "drizzle-orm";
import { menuItems, orderItems, orders, users } from "../db/schema";
import { db } from "../lib/drizzle";
import { randomUUID } from "crypto";
import { OrderItemDTO, PaymentType, ConfirmPaymentDTO } from "../types";
import {
  ErrorCode,
  notFoundError,
  validationError,
  businessError,
} from "../utils/errors";
import { inventoryService } from "./inventory.service";

export interface Order {
  id: string;
  waiterId: string;
  waiter: { name: string; nameAm?: string | null };
  tableNumber: string | null;
  dailyOrderNumber: number;
  status: "PENDING" | "PENDING_VERIFICATION" | "PAID" | "CANCELLED";
  paymentType: PaymentType | null;
  receiptImage: string | null;
  total: number;
  tipAmount: number | null;
  items: OrderItemDetail[];
  createdAt: Date;
  updatedAt: Date;
  paidAt: Date | null;
}

export interface OrderItemDetail {
  id: string;
  menuItemId: string;
  quantity: number;
  unitPrice: number;
  menuItemName: string;
  menuItemNameAm?: string | null;
  menuItem: {
    name: string;
    nameAm?: string | null;
    category: string;
    station: string;
  };
}

export interface CreateOrderDTO {
  waiterId: string;
  items: OrderItemDTO[];
  tableNumber?: string;
}

export interface UpdateOrderDTO {
  items: OrderItemDTO[];
  tableNumber?: string | null;
}

export class OrderService {
  /**
   * Create a new order with waiter association
   * Requirements: 3.1, 3.2, 3.3
   */
  async create(data: CreateOrderDTO): Promise<Order> {
    // Validate input
    this.validateOrderData(data);

    // Verify waiter exists and is active
    const [waiter] = await db
      .select({ id: users.id, isActive: users.isActive })
      .from(users)
      .where(eq(users.id, data.waiterId))
      .limit(1);

    if (!waiter) {
      throw notFoundError(ErrorCode.NOT_FOUND_USER, "Waiter not found");
    }

    if (!waiter.isActive) {
      throw validationError("Waiter is not active");
    }

    // Validate stock availability for all items
    await this.validateStockAvailability(data.items);

    // Get menu items to calculate prices
    const menuItemIds = data.items.map((item) => item.menuItemId);
    const menuItemsRows = await db
      .select({ id: menuItems.id, price: menuItems.price })
      .from(menuItems)
      .where(and(inArray(menuItems.id, menuItemIds), eq(menuItems.isActive, true)));

    // Verify all menu items exist and are active
    const menuItemMap = new Map(menuItemsRows.map((mi) => [mi.id, mi]));
    for (const item of data.items) {
      if (!menuItemMap.has(item.menuItemId)) {
        throw notFoundError(
          ErrorCode.NOT_FOUND_MENU_ITEM,
          `Menu item not found or inactive: ${item.menuItemId}`
        );
      }
    }

    // Calculate total
    const total = this.calculateTotal(data.items, menuItemMap);

    // Calculate daily order number
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endOfToday = new Date(today);
    endOfToday.setDate(endOfToday.getDate() + 1);

    const [lastOrder] = await db
      .select({ dailyOrderNumber: orders.dailyOrderNumber })
      .from(orders)
      .where(and(gte(orders.createdAt, today), lt(orders.createdAt, endOfToday)))
      .orderBy(desc(orders.dailyOrderNumber))
      .limit(1);

    const dailyOrderNumber = (lastOrder?.dailyOrderNumber || 0) + 1;

    const [createdOrder] = await db.transaction(async (tx) => {
      const now = new Date();
      const inserted = await tx
        .insert(orders)
        .values({
          id: randomUUID(),
          dailyOrderNumber,
          waiterId: data.waiterId,
          tableNumber: data.tableNumber,
          status: "PENDING",
          total: String(total),
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: orders.id });

      await tx.insert(orderItems).values(
        data.items.map((item) => ({
          id: randomUUID(),
          orderId: inserted[0].id,
          menuItemId: item.menuItemId,
          quantity: item.quantity,
          unitPrice: String(menuItemMap.get(item.menuItemId)!.price),
        }))
      );

      return inserted;
    });

    const order = await this.findById(createdOrder.id);
    if (!order) {
      throw notFoundError(ErrorCode.NOT_FOUND_ORDER, "Order not found");
    }

    return order;
  }

  /**
   * Update an order (only if unpaid)
   * Requirements: 3.4
   */
  async update(id: string, data: UpdateOrderDTO): Promise<Order> {
    // Check if order exists
    const [existing] = await db
      .select({ id: orders.id, status: orders.status })
      .from(orders)
      .where(eq(orders.id, id))
      .limit(1);

    if (!existing) {
      throw notFoundError(ErrorCode.NOT_FOUND_ORDER, "Order not found");
    }

    // Check if order can be modified
    if (existing.status !== "PENDING") {
      throw businessError(
        ErrorCode.BUSINESS_ORDER_ALREADY_PAID,
        "Cannot modify order that is not pending"
      );
    }

    // Validate items
    if (!data.items || data.items.length === 0) {
      throw validationError("At least one item is required");
    }

    // Get menu items to calculate prices
    const menuItemIds = data.items.map((item) => item.menuItemId);
    const menuItemsRows = await db
      .select({ id: menuItems.id, price: menuItems.price })
      .from(menuItems)
      .where(and(inArray(menuItems.id, menuItemIds), eq(menuItems.isActive, true)));

    // Verify all menu items exist and are active
    const menuItemMap = new Map(menuItemsRows.map((mi) => [mi.id, mi]));
    for (const item of data.items) {
      if (!menuItemMap.has(item.menuItemId)) {
        throw notFoundError(
          ErrorCode.NOT_FOUND_MENU_ITEM,
          `Menu item not found or inactive: ${item.menuItemId}`
        );
      }
    }

    // Calculate new total
    const total = this.calculateTotal(data.items, menuItemMap);

    await db.transaction(async (tx) => {
      await tx.delete(orderItems).where(eq(orderItems.orderId, id));

      await tx
        .update(orders)
        .set({
          total: String(total),
          ...(data.tableNumber !== undefined ? { tableNumber: data.tableNumber } : {}),
          updatedAt: new Date(),
        })
        .where(eq(orders.id, id));

      await tx.insert(orderItems).values(
        data.items.map((item) => ({
          id: randomUUID(),
          orderId: id,
          menuItemId: item.menuItemId,
          quantity: item.quantity,
          unitPrice: String(menuItemMap.get(item.menuItemId)!.price),
        }))
      );
    });

    const order = await this.findById(id);
    if (!order) {
      throw notFoundError(ErrorCode.NOT_FOUND_ORDER, "Order not found");
    }

    return order;
  }

  /**
   * Cancel an order (only if unpaid)
   * Requirements: 3.4
   */
  async cancel(id: string): Promise<void> {
    // Check if order exists
    const existing = await this.findById(id);

    if (!existing) {
      throw notFoundError(ErrorCode.NOT_FOUND_ORDER, "Order not found");
    }

    // Check if order can be cancelled
    if (existing.status === "PAID" || existing.status === "CANCELLED") {
      throw businessError(
        ErrorCode.BUSINESS_ORDER_ALREADY_PAID,
        "Cannot cancel order that is already paid or cancelled"
      );
    }

    if (existing.status === "PENDING_VERIFICATION") {
      const items: OrderItemDTO[] = existing.items.map((item) => ({
        menuItemId: item.menuItemId,
        quantity: item.quantity,
      }));

      await inventoryService.restoreStock(items);
    }

    // Update order status to cancelled
    await db
      .update(orders)
      .set({ status: "CANCELLED", updatedAt: new Date() })
      .where(eq(orders.id, id));
  }

  /**
   * Confirm payment and deduct stock
   * Requirements: 3.5, 3.6, 3.7
   */
  async confirmPayment(id: string, data: ConfirmPaymentDTO): Promise<Order> {
    // Check if order exists
    const existing = await this.findById(id);

    if (!existing) {
      throw notFoundError(ErrorCode.NOT_FOUND_ORDER, "Order not found");
    }

    // Check if order can be paid
    if (existing.status !== "PENDING") {
      throw businessError(
        ErrorCode.BUSINESS_ORDER_ALREADY_PAID,
        "Order is not pending payment"
      );
    }

    // Validate payment type
    if (!data.paymentType) {
      throw validationError("Payment type is required");
    }

    // For digital payments, receipt is required
    if (data.paymentType === "DIGITAL" && !data.receiptImage) {
      throw businessError(
        ErrorCode.BUSINESS_RECEIPT_REQUIRED,
        "Receipt image is required for digital payments"
      );
    }

    // Prepare order items for stock deduction
    const currentItems: OrderItemDTO[] = existing.items.map((item) => ({
      menuItemId: item.menuItemId,
      quantity: item.quantity,
    }));

    // Deduct stock (this validates availability too)
    await inventoryService.deductStock(currentItems);

    const newStatus =
      data.paymentType === "DIGITAL" ? "PENDING_VERIFICATION" : "PAID";
    const paidAt = data.paymentType === "DIGITAL" ? null : new Date();

    // Update order status
    await db
      .update(orders)
      .set({
        status: newStatus,
        paymentType: data.paymentType,
        receiptUrl: data.receiptImage || null,
        tipAmount: data.tipAmount ? data.tipAmount.toString() : null,
        updatedAt: new Date(),
        paidAt,
      })
      .where(eq(orders.id, id));

    const order = await this.findById(id);
    if (!order) {
      throw notFoundError(ErrorCode.NOT_FOUND_ORDER, "Order not found");
    }

    return order;
  }

  /**
   * Upload receipt for digital payment
   * Requirements: 3.7, 3.8
   */
  async uploadReceipt(orderId: string, receiptUrl: string): Promise<Order> {
    // Check if order exists
    const [existing] = await db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);

    if (!existing) {
      throw notFoundError(ErrorCode.NOT_FOUND_ORDER, "Order not found");
    }

    // Update receipt URL
    await db
      .update(orders)
      .set({ receiptUrl, updatedAt: new Date() })
      .where(eq(orders.id, orderId));

    const order = await this.findById(orderId);
    if (!order) {
      throw notFoundError(ErrorCode.NOT_FOUND_ORDER, "Order not found");
    }

    return order;
  }

  /**
   * Find all orders with optional filters
   * Requirements: 3.1
   */
  async findAll(filters?: {
    waiterId?: string;
    status?: "PENDING" | "PENDING_VERIFICATION" | "PAID" | "CANCELLED";
    paymentType?: "CASH" | "DIGITAL";
    startDate?: Date;
    endDate?: Date;
    tipped?: boolean;
  }): Promise<Order[]> {
    const conditions = [];

    if (filters?.waiterId) {
      conditions.push(eq(orders.waiterId, filters.waiterId));
    }

    if (filters?.status) {
      conditions.push(eq(orders.status, filters.status));
    }

    if (filters?.paymentType) {
      conditions.push(eq(orders.paymentType, filters.paymentType));
    }

    if (filters?.startDate) {
      conditions.push(gte(orders.createdAt, filters.startDate));
    }

    if (filters?.endDate) {
      conditions.push(lte(orders.createdAt, filters.endDate));
    }

    if (filters?.tipped) {
      conditions.push(gt(orders.tipAmount, "0"));
    }

    const whereClause =
      conditions.length === 0
        ? undefined
        : conditions.length === 1
        ? conditions[0]
        : and(...conditions);

    const rows = whereClause
      ? await db
          .select({
            order: orders,
            waiter: users,
            item: orderItems,
            menuItem: menuItems,
          })
          .from(orders)
          .innerJoin(users, eq(orders.waiterId, users.id))
          .leftJoin(orderItems, eq(orders.id, orderItems.orderId))
          .leftJoin(menuItems, eq(orderItems.menuItemId, menuItems.id))
          .where(whereClause)
          .orderBy(desc(orders.createdAt))
      : await db
          .select({
            order: orders,
            waiter: users,
            item: orderItems,
            menuItem: menuItems,
          })
          .from(orders)
          .innerJoin(users, eq(orders.waiterId, users.id))
          .leftJoin(orderItems, eq(orders.id, orderItems.orderId))
          .leftJoin(menuItems, eq(orderItems.menuItemId, menuItems.id))
          .orderBy(desc(orders.createdAt));

    return this.mapDrizzleRowsToOrders(rows);
  }

  /**
   * Find order by ID
   */
  async findById(id: string): Promise<Order | null> {
    const rows = await db
      .select({
        order: orders,
        waiter: users,
        item: orderItems,
        menuItem: menuItems,
      })
      .from(orders)
      .innerJoin(users, eq(orders.waiterId, users.id))
      .leftJoin(orderItems, eq(orders.id, orderItems.orderId))
      .leftJoin(menuItems, eq(orderItems.menuItemId, menuItems.id))
      .where(eq(orders.id, id));

    if (rows.length === 0) {
      return null;
    }

    const mapped = this.mapDrizzleRowsToOrders(rows);
    return mapped[0] || null;
  }

  /**
   * Validate stock availability for all items
   * Requirements: 3.3
   */
  private async validateStockAvailability(
    items: OrderItemDTO[]
  ): Promise<void> {
    for (const item of items) {
      const availability = await inventoryService.checkAvailability(
        item.menuItemId,
        item.quantity
      );

      if (!availability.available) {
        throw businessError(
          ErrorCode.BUSINESS_INSUFFICIENT_STOCK,
          `Insufficient stock for menu item. Only ${availability.availableServings} servings available`,
          {
            menuItemId: item.menuItemId,
            requested: item.quantity,
            available: availability.availableServings,
            limitingIngredient: availability.limitingIngredient,
          }
        );
      }
    }
  }

  /**
   * Calculate order total
   * Requirements: 3.2
   */
  private calculateTotal(
    items: OrderItemDTO[],
    menuItemMap: Map<string, { price: string | number }>
  ): number {
    return items.reduce((sum, item) => {
      const menuItem = menuItemMap.get(item.menuItemId);
      if (!menuItem) return sum;
      return sum + Number(menuItem.price) * item.quantity;
    }, 0);
  }

  /**
   * Validate order data
   */
  private validateOrderData(data: CreateOrderDTO): void {
    const errors: string[] = [];

    if (!data.waiterId) {
      errors.push("Waiter ID is required");
    }

    if (!data.items || data.items.length === 0) {
      errors.push("At least one item is required");
    } else {
      for (const item of data.items) {
        if (!item.menuItemId) {
          errors.push("Menu item ID is required for each item");
        }
        if (!item.quantity || item.quantity <= 0) {
          errors.push("Quantity must be positive for each item");
        }
      }
    }

    if (errors.length > 0) {
      throw validationError(errors.join(", "), { errors });
    }
  }

  /**
   * Verify a pending order (Admin updates status to PAID)
   */
  async verifyOrder(id: string): Promise<Order> {
    const [existing] = await db
      .select({ id: orders.id, status: orders.status })
      .from(orders)
      .where(eq(orders.id, id))
      .limit(1);

    if (!existing) {
      throw notFoundError(ErrorCode.NOT_FOUND_ORDER, "Order not found");
    }

    if (existing.status !== "PENDING_VERIFICATION") {
      throw businessError(
        ErrorCode.BUSINESS_ORDER_ALREADY_PAID,
        "Order is not pending verification"
      );
    }

    await db
      .update(orders)
      .set({
        status: "PAID",
        paidAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(orders.id, id));

    const order = await this.findById(id);
    if (!order) {
      throw notFoundError(ErrorCode.NOT_FOUND_ORDER, "Order not found");
    }

    return order;
  }

  /**
   * Map database order row to Order type
   */
  private mapToOrder(order: any): Order {
    return {
      id: order.id,
      waiterId: order.waiterId,
      waiter: { name: order.waiter.name, nameAm: order.waiter.nameAm },
      dailyOrderNumber: order.dailyOrderNumber,
      tableNumber: order.tableNumber,
      status: order.status,
      paymentType: order.paymentType,
      receiptImage: order.receiptUrl,
      total: Number(order.total),
        tipAmount: order.tipAmount ? Number(order.tipAmount) : null,
      items: order.items.map((item: any) => ({
        id: item.id,
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        menuItemName: item.menuItem.name,
        menuItemNameAm: item.menuItem.nameAm,
        menuItem: {
          name: item.menuItem.name,
          nameAm: item.menuItem.nameAm,
          category: item.menuItem.category,
          station: item.menuItem.station,
        },
      })),
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      paidAt: order.paidAt,
    };
  }

  private mapDrizzleRowsToOrders(
    rows: Array<{
      order: typeof orders.$inferSelect;
      waiter: typeof users.$inferSelect;
      item: typeof orderItems.$inferSelect | null;
      menuItem: typeof menuItems.$inferSelect | null;
    }>
  ): Order[] {
    const grouped = new Map<string, Order>();

    for (const row of rows) {
      if (!grouped.has(row.order.id)) {
        grouped.set(row.order.id, {
          id: row.order.id,
          waiterId: row.order.waiterId,
          waiter: {
            name: row.waiter.name,
            nameAm: row.waiter.nameAm,
          },
          tableNumber: row.order.tableNumber,
          dailyOrderNumber: row.order.dailyOrderNumber,
          status: row.order.status,
          paymentType: row.order.paymentType,
          receiptImage: row.order.receiptUrl,
          total: Number(row.order.total),
          tipAmount: row.order.tipAmount ? Number(row.order.tipAmount) : null,
          items: [],
          createdAt: row.order.createdAt,
          updatedAt: row.order.updatedAt,
          paidAt: row.order.paidAt,
        });
      }

      if (row.item && row.menuItem) {
        grouped.get(row.order.id)!.items.push({
          id: row.item.id,
          menuItemId: row.item.menuItemId,
          quantity: row.item.quantity,
          unitPrice: Number(row.item.unitPrice),
          menuItemName: row.menuItem.name,
          menuItemNameAm: row.menuItem.nameAm,
          menuItem: {
            name: row.menuItem.name,
            nameAm: row.menuItem.nameAm,
            category: row.menuItem.category,
            station: row.menuItem.station,
          },
        });
      }
    }

    return Array.from(grouped.values());
  }
}

// Export singleton instance
export const orderService = new OrderService();
