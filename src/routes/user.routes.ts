import { Router } from "express";
import {
  register,
  login,
  logout,
  getCurrentUser,
} from "../controllers/user.auth.controller";
import { authenticate, authorize } from "../middlewares/userAuth";
import { UserRole } from "../models/enums";
import {
  deleteUser,
  getAllUsers,
  getUserById,
  updateUser,
} from "../controllers/user.controller";

const router = Router();

// Public routes
router.post("/auth/register", register);
router.post("/auth/login", login);

// Protected routes
router.post("/auth/logout", authenticate, logout);
router.get("/auth/me", authenticate, getCurrentUser);

router.get("/users", authenticate, authorize(UserRole.SUPERADMIN), getAllUsers);

// Get user by ID (Admin only)
router.get(
  "/users/:id",
  authenticate,
  authorize(UserRole.SUPERADMIN),
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
