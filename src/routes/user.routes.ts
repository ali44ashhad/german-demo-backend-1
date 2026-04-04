import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  register,
  login,
  verifyEmail,
  resendVerificationEmail,
  logout,
  getCurrentUser,
  updateCurrentUserProfile,
  getCurrentUserResume,
  serveCurrentUserResume,
  uploadProfileImage,
} from "../controllers/user.auth.controller";
import { authenticate, authorize } from "../middlewares/userAuth";
import { UserRole } from "../models/enums";
import {
  createUser,
  deleteUser,
  getAllUsers,
  getUserById,
  updateUser,
} from "../controllers/user.controller";
import { uploadProfileImage as uploadMiddleware } from "../middlewares/upload";

const router = Router();

// Rate limiter for resending verification emails
const resendVerificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 3 requests per 15 minutes
  message: {
    success: false,
    message: "Too many resend requests from this IP, please try again after 15 minutes.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Public routes
router.post("/auth/register", register);
router.post("/auth/login", login);
router.post("/auth/verify-email", verifyEmail);
router.post("/auth/resend-verification", resendVerificationLimiter, resendVerificationEmail);

// Protected routes
router.post("/auth/logout", authenticate, logout);
router.get("/auth/me", authenticate, getCurrentUser);
router.put("/auth/profile", authenticate, updateCurrentUserProfile);
router.post(
  "/auth/profile-image",
  authenticate,
  uploadMiddleware,
  uploadProfileImage
);
router.get("/auth/resume", authenticate, getCurrentUserResume);
router.get("/auth/resume/file", authenticate, serveCurrentUserResume);

router.get("/users", authenticate, authorize(UserRole.SUPERADMIN), getAllUsers);

// Create user (Admin only - for creating subadmins)
router.post(
  "/users",
  authenticate,
  authorize(UserRole.SUPERADMIN),
  createUser
);

// Get user by ID (Admin only)
router.get(
  "/users/:id",
  authenticate,
  authorize(UserRole.SUPERADMIN, UserRole.SUBADMIN),
  getUserById
);

// Update user (Admin only)
router.put(
  "/users/:id",
  authenticate,
  authorize(UserRole.SUPERADMIN),
  updateUser
);

// Delete user (Admin only)
router.delete(
  "/users/:id",
  authenticate,
  authorize(UserRole.SUPERADMIN),
  deleteUser
);

export default router;
