import { and, eq } from "drizzle-orm";
import { notificationPreferences, users } from "../db/schema";
import { db } from "../lib/drizzle";
import { randomUUID } from "crypto";
import { NotificationPreferences } from "../types";
import { ErrorCode, notFoundError } from "../utils/errors";

export type NotificationType = "LOW_STOCK" | "LARGE_ORDER" | "EMPLOYEE_ACTION";

export interface NotificationPayload {
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, unknown>;
}

export class NotificationService {
  /**
   * Get notification preferences for an admin
   * Requirements: 5.1
   */
  async getPreferences(adminId: string): Promise<NotificationPreferences> {
    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, adminId))
      .limit(1);

    if (!user) {
      throw notFoundError(ErrorCode.NOT_FOUND_USER, "User not found");
    }

    const [preference] = await db
      .select({
        lowStock: notificationPreferences.lowStock,
        largeOrders: notificationPreferences.largeOrders,
        employeeActions: notificationPreferences.employeeActions,
      })
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, adminId))
      .limit(1);

    // Return existing preferences or defaults
    if (preference) {
      return {
        lowStock: preference.lowStock,
        largeOrders: preference.largeOrders,
        employeeActions: preference.employeeActions,
      };
    }

    // Return default preferences if none exist
    return {
      lowStock: true,
      largeOrders: true,
      employeeActions: true,
    };
  }

  /**
   * Update notification preferences for an admin
   * Requirements: 5.1, 5.3
   */
  async updatePreferences(
    adminId: string,
    prefs: NotificationPreferences
  ): Promise<NotificationPreferences> {
    // Verify user exists
    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, adminId))
      .limit(1);

    if (!user) {
      throw notFoundError(ErrorCode.NOT_FOUND_USER, "User not found");
    }

    const [existing] = await db
      .select({ id: notificationPreferences.id })
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, adminId))
      .limit(1);

    let updated:
      | {
          lowStock: boolean;
          largeOrders: boolean;
          employeeActions: boolean;
        }
      | undefined;

    if (existing) {
      [updated] = await db
        .update(notificationPreferences)
        .set({
          lowStock: prefs.lowStock,
          largeOrders: prefs.largeOrders,
          employeeActions: prefs.employeeActions,
          updatedAt: new Date(),
        })
        .where(eq(notificationPreferences.id, existing.id))
        .returning({
          lowStock: notificationPreferences.lowStock,
          largeOrders: notificationPreferences.largeOrders,
          employeeActions: notificationPreferences.employeeActions,
        });
    } else {
      const now = new Date();
      [updated] = await db
        .insert(notificationPreferences)
        .values({
          id: randomUUID(),
          userId: adminId,
          lowStock: prefs.lowStock,
          largeOrders: prefs.largeOrders,
          employeeActions: prefs.employeeActions,
          createdAt: now,
          updatedAt: now,
        })
        .returning({
          lowStock: notificationPreferences.lowStock,
          largeOrders: notificationPreferences.largeOrders,
          employeeActions: notificationPreferences.employeeActions,
        });
    }

    if (!updated) {
      return {
        lowStock: prefs.lowStock,
        largeOrders: prefs.largeOrders,
        employeeActions: prefs.employeeActions,
      };
    }

    return {
      lowStock: updated.lowStock,
      largeOrders: updated.largeOrders,
      employeeActions: updated.employeeActions,
    };
  }

  /**
   * Send notification to a user if they have the preference enabled
   * Requirements: 5.2, 5.4
   */
  async sendNotification(
    userId: string,
    type: NotificationType,
    data: Record<string, unknown>
  ): Promise<boolean> {
    // Get user preferences
    const prefs = await this.getPreferences(userId);

    // Check if notification type is enabled
    const shouldSend = this.shouldSendNotification(type, prefs);

    if (!shouldSend) {
      return false;
    }

    // Build notification payload
    const payload = this.buildNotificationPayload(type, data);

    // In a real implementation, this would send to a push notification service
    // For now, we'll just log it and return success
    console.log(`[NOTIFICATION] Sending to user ${userId}:`, payload);

    // Here you would integrate with:
    // - Firebase Cloud Messaging (FCM)
    // - Apple Push Notification Service (APNS)
    // - Expo Push Notifications
    // etc.

    return true;
  }

  /**
   * Trigger low stock notification for all admins
   * Requirements: 5.4
   */
  async triggerLowStockAlert(
    ingredientName: string,
    currentStock: number,
    threshold: number
  ): Promise<void> {
    // Get all admins
    const admins = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.role, "ADMIN"), eq(users.isActive, true)));

    // Send notification to each admin
    for (const admin of admins) {
      await this.sendNotification(admin.id, "LOW_STOCK", {
        ingredientName,
        currentStock,
        threshold,
      });
    }
  }

  /**
   * Trigger large order notification for all admins
   * Requirements: 5.2
   */
  async triggerLargeOrderAlert(
    orderId: string,
    total: number,
    waiterName: string
  ): Promise<void> {
    // Get all admins
    const admins = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.role, "ADMIN"), eq(users.isActive, true)));

    // Send notification to each admin
    for (const admin of admins) {
      await this.sendNotification(admin.id, "LARGE_ORDER", {
        orderId,
        total,
        waiterName,
      });
    }
  }

  /**
   * Trigger employee action notification for all admins
   * Requirements: 5.2
   */
  async triggerEmployeeActionAlert(
    action: "CREATED" | "UPDATED" | "RELEASED",
    employeeName: string
  ): Promise<void> {
    // Get all admins
    const admins = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.role, "ADMIN"), eq(users.isActive, true)));

    // Send notification to each admin
    for (const admin of admins) {
      await this.sendNotification(admin.id, "EMPLOYEE_ACTION", {
        action,
        employeeName,
      });
    }
  }

  /**
   * Check if notification should be sent based on preferences
   */
  private shouldSendNotification(
    type: NotificationType,
    prefs: NotificationPreferences
  ): boolean {
    switch (type) {
      case "LOW_STOCK":
        return prefs.lowStock;
      case "LARGE_ORDER":
        return prefs.largeOrders;
      case "EMPLOYEE_ACTION":
        return prefs.employeeActions;
      default:
        return false;
    }
  }

  /**
   * Build notification payload based on type
   */
  private buildNotificationPayload(
    type: NotificationType,
    data: Record<string, unknown>
  ): NotificationPayload {
    switch (type) {
      case "LOW_STOCK":
        return {
          type,
          title: "Low Stock Alert",
          message: `${data.ingredientName} is running low (${data.currentStock} remaining, threshold: ${data.threshold})`,
          data,
        };
      case "LARGE_ORDER":
        return {
          type,
          title: "Large Order Placed",
          message: `Order #${data.orderId} for $${data.total} placed by ${data.waiterName}`,
          data,
        };
      case "EMPLOYEE_ACTION":
        return {
          type,
          title: "Employee Update",
          message: `Employee ${data.employeeName} has been ${(
            data.action as string
          ).toLowerCase()}`,
          data,
        };
      default:
        return {
          type,
          title: "Notification",
          message: "You have a new notification",
          data,
        };
    }
  }
}

// Export singleton instance
export const notificationService = new NotificationService();
