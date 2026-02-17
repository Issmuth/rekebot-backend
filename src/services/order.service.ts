import prisma from "../lib/prisma";
import { OrderItemDTO, PaymentType, ConfirmPaymentDTO } from "../types";
import {
  ErrorCode,
  notFoundError,
  validationError,
  businessError,
} from "../utils/errors";
import { inventoryService } from "./inventory.service";
import { Decimal } from "@prisma/client/runtime/library";

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
    const waiter = await prisma.user.findUnique({
      where: { id: data.waiterId },
    });

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
    const menuItems = await prisma.menuItem.findMany({
      where: { id: { in: menuItemIds }, isActive: true },
    });

    // Verify all menu items exist and are active
    const menuItemMap = new Map(menuItems.map((mi) => [mi.id, mi]));
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

    const lastOrder = await prisma.order.findFirst({
      where: {
        createdAt: {
          gte: today,
          lt: endOfToday,
        },
      },
      orderBy: {
        dailyOrderNumber: "desc",
      },
    });

    const dailyOrderNumber = (lastOrder?.dailyOrderNumber || 0) + 1;

    // Create order with items
    const order = await prisma.order.create({
      data: {
        dailyOrderNumber,
        waiterId: data.waiterId,
        tableNumber: data.tableNumber,
        total,
        items: {
          create: data.items.map((item) => ({
            menuItemId: item.menuItemId,
            quantity: item.quantity,
            unitPrice: menuItemMap.get(item.menuItemId)!.price,
          })),
        },
      },
      include: {
        waiter: { select: { name: true, nameAm: true } },
        items: {
          include: {
            menuItem: { select: { name: true, nameAm: true, category: true, station: true } },
          },
        },
      },
    });

    return this.mapToOrder(order);
  }

  /**
   * Update an order (only if unpaid)
   * Requirements: 3.4
   */
  async update(id: string, data: UpdateOrderDTO): Promise<Order> {
    // Check if order exists
    const existing = await prisma.order.findUnique({
      where: { id },
    });

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
    const menuItems = await prisma.menuItem.findMany({
      where: { id: { in: menuItemIds }, isActive: true },
    });

    // Verify all menu items exist and are active
    const menuItemMap = new Map(menuItems.map((mi) => [mi.id, mi]));
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

    // Update order with new items
    const order = await prisma.$transaction(async (tx) => {
      // Delete existing items
      await tx.orderItem.deleteMany({
        where: { orderId: id },
      });

      // Update order with new items
      return tx.order.update({
        where: { id },
        data: {
          total,
          ...(data.tableNumber !== undefined ? { tableNumber: data.tableNumber } : {}),
          items: {
            create: data.items.map((item) => ({
              menuItemId: item.menuItemId,
              quantity: item.quantity,
              unitPrice: menuItemMap.get(item.menuItemId)!.price,
            })),
          },
        },
        include: {
          waiter: { select: { name: true, nameAm: true } },
          items: {
            include: {
              menuItem: { select: { name: true, nameAm: true, category: true, station: true } },
            },
          },
        },
      });
    });

    return this.mapToOrder(order);
  }

  /**
   * Cancel an order (only if unpaid)
   * Requirements: 3.4
   */
  async cancel(id: string): Promise<void> {
    // Check if order exists
    const existing = await prisma.order.findUnique({
      where: { id },
    });

    if (!existing) {
      throw notFoundError(ErrorCode.NOT_FOUND_ORDER, "Order not found");
    }

    // Check if order can be cancelled
    if (existing.status !== "PENDING") {
      throw businessError(
        ErrorCode.BUSINESS_ORDER_ALREADY_PAID,
        "Cannot cancel order that is not pending"
      );
    }

    // Update order status to cancelled
    await prisma.order.update({
      where: { id },
      data: { status: "CANCELLED" },
    });
  }

  /**
   * Confirm payment and deduct stock
   * Requirements: 3.5, 3.6, 3.7
   */
  async confirmPayment(id: string, data: ConfirmPaymentDTO): Promise<Order> {
    // Check if order exists
    const existing = await prisma.order.findUnique({
      where: { id },
      include: {
        items: true,
      },
    });

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
    const orderItems: OrderItemDTO[] = existing.items.map((item) => ({
      menuItemId: item.menuItemId,
      quantity: item.quantity,
    }));

    // Deduct stock (this validates availability too)
    await inventoryService.deductStock(orderItems);

    const newStatus =
      data.paymentType === "DIGITAL" ? "PENDING_VERIFICATION" : "PAID";
    const paidAt = data.paymentType === "DIGITAL" ? null : new Date();

    // Update order status
    const order = await prisma.order.update({
      where: { id },
      data: {
        status: newStatus,
        paymentType: data.paymentType,
        receiptUrl: data.receiptImage || null,
        paidAt: paidAt,
      },
      include: {
        waiter: { select: { name: true, nameAm: true } },
        items: {
          include: {
            menuItem: { select: { name: true, nameAm: true, category: true, station: true } },
          },
        },
      },
    });

    return this.mapToOrder(order);
  }

  /**
   * Upload receipt for digital payment
   * Requirements: 3.7, 3.8
   */
  async uploadReceipt(orderId: string, receiptUrl: string): Promise<Order> {
    // Check if order exists
    const existing = await prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!existing) {
      throw notFoundError(ErrorCode.NOT_FOUND_ORDER, "Order not found");
    }

    // Update receipt URL
    const order = await prisma.order.update({
      where: { id: orderId },
      data: { receiptUrl },
      include: {
        waiter: { select: { name: true, nameAm: true } },
        items: {
          include: {
            menuItem: { select: { name: true, nameAm: true, category: true, station: true } },
          },
        },
      },
    });

    return this.mapToOrder(order);
  }

  /**
   * Find all orders with optional filters
   * Requirements: 3.1
   */
  async findAll(filters?: {
    waiterId?: string;
    status?: "PENDING" | "PENDING_VERIFICATION" | "PAID" | "CANCELLED";
  }): Promise<Order[]> {
    const where: Record<string, unknown> = {};

    if (filters?.waiterId) {
      where.waiterId = filters.waiterId;
    }

    if (filters?.status) {
      where.status = filters.status;
    }

    const orders = await prisma.order.findMany({
      where,
      include: {
        waiter: { select: { name: true, nameAm: true } },
        items: {
          include: {
            menuItem: { select: { name: true, nameAm: true, category: true, station: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return orders.map(this.mapToOrder);
  }

  /**
   * Find order by ID
   */
  async findById(id: string): Promise<Order | null> {
    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        waiter: { select: { name: true, nameAm: true } },
        items: {
          include: {
            menuItem: { select: { name: true, nameAm: true, category: true, station: true } },
          },
        },
      },
    });

    if (!order) {
      return null;
    }

    return this.mapToOrder(order);
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
    menuItemMap: Map<string, { price: Decimal }>
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
    const existing = await prisma.order.findUnique({
      where: { id },
    });

    if (!existing) {
      throw notFoundError(ErrorCode.NOT_FOUND_ORDER, "Order not found");
    }

    if (existing.status !== "PENDING_VERIFICATION") {
      throw businessError(
        ErrorCode.BUSINESS_ORDER_ALREADY_PAID,
        "Order is not pending verification"
      );
    }

    const order = await prisma.order.update({
      where: { id },
      data: {
        status: "PAID",
        paidAt: new Date(),
      },
      include: {
        waiter: { select: { name: true, nameAm: true } },
        items: {
          include: {
            menuItem: { select: { name: true, nameAm: true, category: true, station: true } },
          },
        },
      },
    });

    return this.mapToOrder(order);
  }

  /**
   * Map Prisma Order to Order type
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
}

// Export singleton instance
export const orderService = new OrderService();
