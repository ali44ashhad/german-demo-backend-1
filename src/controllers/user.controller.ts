import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { UserModel } from "../models/User";
import { UserRole } from "../models/enums";
import mongoose from "mongoose";

// Get All Users (with pagination and filtering)
export const getAllUsers = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { page = 1, limit = 10, role, search } = req.query;

    const query: any = {};

    // Filter by role if provided
    if (role && Object.values(UserRole).includes(role as UserRole)) {
      query.role = role;
    }

    // Search by name or email
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const users = await UserModel.find(query)
      .select("-password")
      .populate("serviceId")
      .skip(skip)
      .limit(limitNum)
      .sort({ createdAt: -1 });

    const total = await UserModel.countDocuments(query);

    res.status(200).json({
      success: true,
      users,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalUsers: total,
        limit: limitNum,
      },
    });
  } catch (error: any) {
    console.error("Get all users error:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
};

// Get User by ID
export const getUserById = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    // Validate ObjectId
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      res
        .status(400)
        .json({ success: false, message: "Invalid user ID format" });
      return;
    }

    const user = await UserModel.findById(id)
      .select("-password")
      .populate("serviceId");

    if (!user) {
      res.status(404).json({ success: false, message: "User not found" });
      return;
    }

    res.status(200).json({ success: true, user });
  } catch (error: any) {
    console.error("Get user by ID error:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
};

// Update User
export const updateUser = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const {
      name,
      email,
      contactNumber,
      profileImage,
      serviceId,
      role,
      password,
    } = req.body;

    // Validate ObjectId

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      res
        .status(400)
        .json({ success: false, message: "Invalid user ID format" });
      return;
    }

    // Find user
    const user = await UserModel.findById(id);
    if (!user) {
      res.status(404).json({ success: false, message: "User not found" });
      return;
    }

    // Check if email is being changed and if it's already taken
    if (email && email !== user.email) {
      const existingUser = await UserModel.findOne({ email });
      if (existingUser) {
        res
          .status(409)
          .json({ success: false, message: "Email already in use" });
        return;
      }
      user.email = email;
    }

    // Update fields
    if (name) user.name = name;
    if (contactNumber !== undefined) user.contactNumber = contactNumber;
    if (profileImage !== undefined) user.profileImage = profileImage;

    // Handle role change
    if (role && Object.values(UserRole).includes(role)) {
      user.role = role;

      // Handle serviceId based on role
      if (role === UserRole.SUBADMIN) {
        if (!serviceId) {
          res.status(400).json({
            success: false,
            message: "ServiceId is required for sub-admins",
          });
          return;
        }
        user.serviceId = serviceId;
      }
      //  else {
      //   user.serviceId = undefined;
      // }
    } else if (serviceId && user.role === UserRole.SUBADMIN) {
      user.serviceId = serviceId;
    }

    // Update password if provided
    if (password) {
      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(password, salt);
    }

    await user.save();

    const updatedUser = await UserModel.findById(id)
      .select("-password")
      .populate("serviceId");

    res.status(200).json({
      success: true,
      message: "User updated successfully",
      user: updatedUser,
    });
  } catch (error: any) {
    console.error("Update user error:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
};

// Delete User
export const deleteUser = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    // Validate ObjectId
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      res
        .status(400)
        .json({ success: false, message: "Invalid user ID format" });
      return;
    }

    // Prevent users from deleting themselves
    const currentUserId = (req as any).userId;
    if (id === currentUserId) {
      res.status(403).json({
        success: false,
        message: "You cannot delete your own account",
      });
      return;
    }

    const user = await UserModel.findByIdAndDelete(id);

    if (!user) {
      res.status(404).json({ success: false, message: "User not found" });
      return;
    }

    res.status(200).json({
      success: true,
      message: "User deleted successfully",
      deletedUser: {
        id: user._id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error: any) {
    console.error("Delete user error:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
};
