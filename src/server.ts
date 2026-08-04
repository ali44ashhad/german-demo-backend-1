import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import connectDB from "./config/db";
import { verifyEmailConfig } from "./utils/emailService";
import userRoutes from "./routes/user.routes";
import serviceRoutes from "./routes/service.routes";
import zoomSessionRoutes from "./routes/zoomSession.routes";
import bookingRoutes from "./routes/booking.routes";
import webhookRoutes from "./routes/webhook.routes";
import dashboardRoutes from "./routes/dashboard.routes";
import noteRoutes from "./routes/note.routes";
import cookieParser from "cookie-parser";

dotenv.config();

// Verify email configuration (non-blocking)
verifyEmailConfig().catch(() => {
  console.warn(
    "⚠️  Email service not configured. Email functionality will be disabled."
  );
});

const defaultOrigins = ["http://localhost:5173", "http://localhost:5177"];
const corsOrigin = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((o) => o.trim())
  : defaultOrigins;

const corsOptions = {
  origin: corsOrigin.length === 1 ? corsOrigin[0] : corsOrigin,
  credentials: true,
  optionsSuccessStatus: 200,
};

const app = express();

app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());

// Ensure MongoDB is ready before handling requests (serverless-safe)
app.use(async (_req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    console.error("Database connection failed:", error);
    res.status(503).json({
      success: false,
      message: "Database unavailable. Please try again shortly.",
    });
  }
});

// Webhook routes (must be before other routes to handle raw body if needed)
app.use("/api", webhookRoutes);

app.use("/api/users", userRoutes);
app.use("/api/services", serviceRoutes);
app.use("/api/zoom-sessions", zoomSessionRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api", noteRoutes);

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "OK", timestamp: new Date().toISOString() });
});

if (process.env.NODE_ENV !== "production") {
  const PORT = process.env.PORT || 5005;
  app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
}

export default app;
