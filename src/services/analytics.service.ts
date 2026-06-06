import { and, eq, gte, lt, lte, sql } from "drizzle-orm";
import {
  ingredients,
  menuItems,
  orderItems,
  orders,
  stockAdjustments,
  users,
} from "../db/schema";
import { db } from "../lib/drizzle";
import { DashboardData, ConsumptionData, DateRange } from "../types";

export interface TopItemData {
  menuItemId: string;
  name: string;
  category: string;
  count: number;
  revenue: number;
}

export interface RevenueData {
  total: number;
  byWaiter: { waiterId: string; waiterName: string; revenue: number }[];
  orderCount: number;
}

export interface PeakHourData {
  hour: number;
  orderCount: number;
  averageRevenue: number;
}

export class AnalyticsService {
  /**
   * Get dashboard aggregated data
   * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
   */
  async getDashboard(targetDate?: Date): Promise<DashboardData> {
    const now = targetDate ? new Date(targetDate) : new Date();
    // Use the end of the target date if a date is provided, otherwise current time
    if (targetDate) {
      now.setHours(23, 59, 59, 999);
    }

    // Calculate date ranges
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - 7);
    const monthStart = new Date(todayStart);
    monthStart.setDate(monthStart.getDate() - 30);

    // Get revenue data in parallel
    const [
      todayRevenue,
      weeklyRevenue,
      monthlyRevenue,
      todayTips,
      weeklyTips,
      monthlyTips,
      topItems,
      lowStockCount,
      pendingOrders,
    ] = await Promise.all([
      this.getRevenueForPeriod({ start: todayStart, end: now }),
      this.getRevenueForPeriod({ start: weekStart, end: now }),
      this.getRevenueForPeriod({ start: monthStart, end: now }),
      this.getTipsForPeriod({ start: todayStart, end: now }),
      this.getTipsForPeriod({ start: weekStart, end: now }),
      this.getTipsForPeriod({ start: monthStart, end: now }),
      this.getTopItemsInternal(5, { start: monthStart, end: now }),
      this.getLowStockCount(),
      this.getPendingOrdersCount(),
    ]);

    return {
      todayRevenue,
      weeklyRevenue,
      monthlyRevenue,
      todayTips,
      weeklyTips,
      monthlyTips,
      topItems: topItems.map((item) => ({
        name: item.name,
        count: item.count,
      })),
      lowStockCount,
      pendingOrders,
    };
  }

  /**
   * Get weekly consumption per ingredient
   * Requirements: 6.1
   */
  async getWeeklyConsumption(
    ingredientId?: string
  ): Promise<ConsumptionData[]> {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    // Get all stock adjustments for order fulfillment in the past week
    const whereClause: Record<string, unknown> = {
      createdAt: { gte: weekAgo },
      reason: "Order fulfillment",
      quantity: { lt: 0 }, // Only deductions
    };

    if (ingredientId) {
      whereClause.ingredientId = ingredientId;
    }

    const adjustments = ingredientId
      ? await db
          .select({
            ingredientId: stockAdjustments.ingredientId,
            quantity: stockAdjustments.quantity,
            ingredientName: ingredients.name,
            unit: ingredients.unit,
          })
          .from(stockAdjustments)
          .innerJoin(ingredients, eq(stockAdjustments.ingredientId, ingredients.id))
          .where(
            and(
              gte(stockAdjustments.createdAt, weekAgo),
              eq(stockAdjustments.reason, "Order fulfillment"),
              lt(stockAdjustments.quantity, "0"),
              eq(stockAdjustments.ingredientId, ingredientId)
            )
          )
      : await db
          .select({
            ingredientId: stockAdjustments.ingredientId,
            quantity: stockAdjustments.quantity,
            ingredientName: ingredients.name,
            unit: ingredients.unit,
          })
          .from(stockAdjustments)
          .innerJoin(ingredients, eq(stockAdjustments.ingredientId, ingredients.id))
          .where(
            and(
              gte(stockAdjustments.createdAt, weekAgo),
              eq(stockAdjustments.reason, "Order fulfillment"),
              lt(stockAdjustments.quantity, "0")
            )
          );

    // Aggregate by ingredient
    const consumptionMap = new Map<
      string,
      {
        ingredientId: string;
        ingredientName: string;
        unit: string;
        totalConsumed: number;
      }
    >();

    for (const adj of adjustments) {
      const existing = consumptionMap.get(adj.ingredientId);
      const consumed = Math.abs(Number(adj.quantity));

      if (existing) {
        existing.totalConsumed += consumed;
      } else {
        consumptionMap.set(adj.ingredientId, {
          ingredientId: adj.ingredientId,
          ingredientName: adj.ingredientName,
          unit: adj.unit,
          totalConsumed: consumed,
        });
      }
    }

    // Convert to array and calculate weekly average
    return Array.from(consumptionMap.values()).map((item) => ({
      ingredientId: item.ingredientId,
      ingredientName: item.ingredientName,
      weeklyAverage: item.totalConsumed, // This is the weekly total (average over 1 week)
      unit: item.unit,
    }));
  }

  /**
   * Get top ordered menu items ranked by quantity
   * Requirements: 6.2
   */
  async getTopItems(
    limit: number,
    period: DateRange,
    category?: string
  ): Promise<TopItemData[]> {
    return this.getTopItemsInternal(limit, period, category);
  }

  /**
   * Get revenue for a time period
   * Requirements: 6.3
   */
  async getRevenue(period: DateRange): Promise<RevenueData> {
    const orderRows = await db
      .select({
        waiterId: orders.waiterId,
        total: orders.total,
        waiterName: users.name,
      })
      .from(orders)
      .innerJoin(users, eq(orders.waiterId, users.id))
      .where(
        and(
          eq(orders.status, "PAID"),
          gte(orders.paidAt, period.start),
          lte(orders.paidAt, period.end)
        )
      );

    // Calculate total revenue
    const total = orderRows.reduce((sum, order) => sum + Number(order.total), 0);

    // Calculate revenue by waiter
    const waiterRevenueMap = new Map<
      string,
      { waiterId: string; waiterName: string; revenue: number }
    >();

    for (const order of orderRows) {
      const existing = waiterRevenueMap.get(order.waiterId);
      const orderTotal = Number(order.total);

      if (existing) {
        existing.revenue += orderTotal;
      } else {
        waiterRevenueMap.set(order.waiterId, {
          waiterId: order.waiterId,
          waiterName: order.waiterName,
          revenue: orderTotal,
        });
      }
    }

    // Sort by revenue descending
    const byWaiter = Array.from(waiterRevenueMap.values()).sort(
      (a, b) => b.revenue - a.revenue
    );

    return {
      total,
      byWaiter,
      orderCount: orderRows.length,
    };
  }

  /**
   * Get peak ordering hours based on historical data
   * Requirements: 6.5
   */
  async getPeakHours(): Promise<PeakHourData[]> {
    // Get all paid orders
    const orderRows = await db
      .select({
        createdAt: orders.createdAt,
        total: orders.total,
      })
      .from(orders)
      .where(eq(orders.status, "PAID"));

    // Aggregate by hour
    const hourlyData = new Map<
      number,
      { orderCount: number; totalValue: number }
    >();

    // Initialize all hours
    for (let hour = 0; hour < 24; hour++) {
      hourlyData.set(hour, { orderCount: 0, totalValue: 0 });
    }

    for (const order of orderRows) {
      const hour = order.createdAt.getHours();
      const existing = hourlyData.get(hour)!;
      existing.orderCount += 1;
      existing.totalValue += Number(order.total);
    }

    // Convert to array and calculate averages
    const result: PeakHourData[] = [];

    for (let hour = 0; hour < 24; hour++) {
      const data = hourlyData.get(hour)!;
      if (data.orderCount > 0) {
        result.push({
          hour,
          orderCount: data.orderCount,
          averageRevenue:
            data.orderCount > 0
              ? Math.round((data.totalValue / data.orderCount) * 100) / 100
              : 0,
        });
      }
    }

    // Sort by order count descending
    return result.sort((a, b) => b.orderCount - a.orderCount);
  }

  /**
   * Internal helper to get top items
   */
  private async getTopItemsInternal(
    limit: number,
    period: DateRange,
    category?: string
  ): Promise<TopItemData[]> {
    const conditions = [
      eq(orders.status, "PAID"),
      gte(orders.paidAt, period.start),
      lte(orders.paidAt, period.end),
    ];

    if (category) {
      conditions.push(eq(menuItems.category, category));
    }

    const rows = await db
      .select({
        menuItemId: orderItems.menuItemId,
        quantity: orderItems.quantity,
        unitPrice: orderItems.unitPrice,
        menuName: menuItems.name,
        menuCategory: menuItems.category,
      })
      .from(orders)
      .innerJoin(orderItems, eq(orders.id, orderItems.orderId))
      .innerJoin(menuItems, eq(orderItems.menuItemId, menuItems.id))
      .where(and(...conditions));

    // Aggregate by menu item
    const itemMap = new Map<string, TopItemData>();

    for (const item of rows) {
      const existing = itemMap.get(item.menuItemId);
      const itemRevenue = Number(item.unitPrice) * item.quantity;

      if (existing) {
        existing.count += item.quantity;
        existing.revenue += itemRevenue;
      } else {
        itemMap.set(item.menuItemId, {
          menuItemId: item.menuItemId,
          name: item.menuName,
          category: item.menuCategory,
          count: item.quantity,
          revenue: itemRevenue,
        });
      }
    }

    // Sort by quantity descending and take top N
    return Array.from(itemMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  /**
   * Helper to get revenue for a period
   */
  private async getRevenueForPeriod(period: DateRange): Promise<number> {
    const [result] = await db
      .select({
        total: sql<number>`coalesce(sum(${orders.total}), 0)`,
      })
      .from(orders)
      .where(
        and(
          eq(orders.status, "PAID"),
          gte(orders.paidAt, period.start),
          lte(orders.paidAt, period.end)
        )
      );

    return Number(result?.total || 0);
  }

  /**
   * Helper to get tips total for a period
   */
  private async getTipsForPeriod(period: DateRange): Promise<number> {
    const [result] = await db
      .select({
        total: sql<number>`coalesce(sum(${orders.tipAmount}), 0)`,
      })
      .from(orders)
      .where(
        and(
          eq(orders.status, "PAID"),
          gte(orders.paidAt, period.start),
          lte(orders.paidAt, period.end)
        )
      );

    return Number(result?.total || 0);
  }

  /**
   * Helper to get low stock count
   */
  private async getLowStockCount(): Promise<number> {
    const ingredientRows = await db.select().from(ingredients);
    return ingredientRows.filter(
      (ing) => Number(ing.currentStock) < Number(ing.minThreshold)
    ).length;
  }

  /**
   * Helper to get pending orders count
   */
  private async getPendingOrdersCount(): Promise<number> {
    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(orders)
      .where(eq(orders.status, "PENDING"));

    return Number(result?.count || 0);
  }
}

// Export singleton instance
export const analyticsService = new AnalyticsService();
