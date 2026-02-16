import express from "express";
import cors from "cors";
import morgan from "morgan";
import { errorHandler } from "./middleware/errorHandler";
import {
  authRoutes,
  employeeRoutes,
  menuRoutes,
  ingredientRoutes,
  orderRoutes,
  analyticsRoutes,
  notificationRoutes,
} from "./routes";

import path from "path";

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Serve static files
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));
// CDN Endpoint with caching
app.use(
  "/cdn",
  express.static(path.join(process.cwd(), "uploads"), {
    maxAge: "1d", // Cache for 1 day
    setHeaders: (res, path) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
    },
  })
);

// Request logging (morgan)
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

// Debug request details when DEBUG=true
app.use((req, _res, next) => {
  if (process.env.DEBUG === "true") {
    try {
      console.debug(
        `[request] ${req.method} ${req.originalUrl} - body: ${JSON.stringify(
          req.body
        )} - query: ${JSON.stringify(req.query)}`
      );
    } catch (err) {
      console.debug(`[request] ${req.method} ${req.originalUrl}`);
    }
  }
  next();
});

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/employees", employeeRoutes);
app.use("/api/menu", menuRoutes);
app.use("/api/ingredients", ingredientRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/notifications", notificationRoutes);

// Error handling middleware
app.use(errorHandler);

// Only start server if not in test environment
if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

export default app;
