import prisma from "../lib/prisma";
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
  async getDashboard(): Promise<DashboardData> {
    const now = new Date();

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
      topItems,
      lowStockCount,
      pendingOrders,
    ] = await Promise.all([
      this.getRevenueForPeriod({ start: todayStart, end: now }),
      this.getRevenueForPeriod({ start: weekStart, end: now }),
      this.getRevenueForPeriod({ start: monthStart, end: now }),
      this.getTopItemsInternal(5, { start: monthStart, end: now }),
      this.getLowStockCount(),
      this.getPendingOrdersCount(),
    ]);

    return {
      todayRevenue,
      weeklyRevenue,
      monthlyRevenue,
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

    const adjustments = await prisma.stockAdjustment.findMany({
      where: whereClause,
      include: {
        ingredient: {
          select: {
            id: true,
            name: true,
            unit: true,
          },
        },
      },
    });

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
          ingredientId: adj.ingredient.id,
          ingredientName: adj.ingredient.name,
          unit: adj.ingredient.unit,
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
  async getTopItems(limit: number, period: DateRange): Promise<TopItemData[]> {
    return this.getTopItemsInternal(limit, period);
  }

  /**
   * Get revenue for a time period
   * Requirements: 6.3
   */
  async getRevenue(period: DateRange): Promise<RevenueData> {
    const orders = await prisma.order.findMany({
      where: {
        status: "PAID",
        paidAt: {
          gte: period.start,
          lte: period.end,
        },
      },
      include: {
        waiter: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // Calculate total revenue
    const total = orders.reduce((sum, order) => sum + Number(order.total), 0);

    // Calculate revenue by waiter
    const waiterRevenueMap = new Map<
      string,
      { waiterId: string; waiterName: string; revenue: number }
    >();

    for (const order of orders) {
      const existing = waiterRevenueMap.get(order.waiterId);
      const orderTotal = Number(order.total);

      if (existing) {
        existing.revenue += orderTotal;
      } else {
        waiterRevenueMap.set(order.waiterId, {
          waiterId: order.waiter.id,
          waiterName: order.waiter.name,
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
      orderCount: orders.length,
    };
  }

  /**
   * Get peak ordering hours based on historical data
   * Requirements: 6.5
   */
  async getPeakHours(): Promise<PeakHourData[]> {
    // Get all paid orders
    const orders = await prisma.order.findMany({
      where: {
        status: "PAID",
      },
      select: {
        createdAt: true,
        total: true,
      },
    });

    // Aggregate by hour
    const hourlyData = new Map<
      number,
      { orderCount: number; totalValue: number }
    >();

    // Initialize all hours
    for (let hour = 0; hour < 24; hour++) {
      hourlyData.set(hour, { orderCount: 0, totalValue: 0 });
    }

    for (const order of orders) {
      const hour = order.createdAt.getHours();
      const existing = hourlyData.get(hour)!;
      existing.orderCount += 1;
      existing.totalValue += Number(order.total);
    }

    // Convert to array and calculate averages
    const result: PeakHourData[] = [];

    for (let hour = 0; hour < 24; hour++) {
      const data = hourlyData.get(hour)!;
      result.push({
        hour,
        orderCount: data.orderCount,
        averageRevenue:
          data.orderCount > 0
            ? Math.round((data.totalValue / data.orderCount) * 100) / 100
            : 0,
      });
    }

    // Sort by order count descending
    return result.sort((a, b) => b.orderCount - a.orderCount);
  }

  /**
   * Internal helper to get top items
   */
  private async getTopItemsInternal(
    limit: number,
    period: DateRange
  ): Promise<TopItemData[]> {
    // Get all paid orders in the period with their items
    const orders = await prisma.order.findMany({
      where: {
        status: "PAID",
        paidAt: {
          gte: period.start,
          lte: period.end,
        },
      },
      include: {
        items: {
          include: {
            menuItem: {
              select: {
                id: true,
                name: true,
                category: true,
              },
            },
          },
        },
      },
    });

    // Aggregate by menu item
    const itemMap = new Map<string, TopItemData>();

    for (const order of orders) {
      for (const item of order.items) {
        const existing = itemMap.get(item.menuItemId);
        const itemRevenue = Number(item.unitPrice) * item.quantity;

        if (existing) {
          existing.count += item.quantity;
          existing.revenue += itemRevenue;
        } else {
          itemMap.set(item.menuItemId, {
            menuItemId: item.menuItem.id,
            name: item.menuItem.name,
            category: item.menuItem.category,
            count: item.quantity,
            revenue: itemRevenue,
          });
        }
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
    const result = await prisma.order.aggregate({
      where: {
        status: "PAID",
        paidAt: {
          gte: period.start,
          lte: period.end,
        },
      },
      _sum: {
        total: true,
      },
    });

    return Number(result._sum.total || 0);
  }

  /**
   * Helper to get low stock count
   */
  private async getLowStockCount(): Promise<number> {
    const ingredients = await prisma.ingredient.findMany();
    return ingredients.filter(
      (ing) => Number(ing.currentStock) < Number(ing.minThreshold)
    ).length;
  }

  /**
   * Helper to get pending orders count
   */
  private async getPendingOrdersCount(): Promise<number> {
    return prisma.order.count({
      where: { status: "PENDING" },
    });
  }
}

// Export singleton instance
export const analyticsService = new AnalyticsService();
