import { Request, Response } from "express";
import { ServiceModel } from "../models/Service";
import mongoose from "mongoose";

// Create Service
export const createService = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { name, description, basePrice, duration, isActive } = req.body;

    // Validation
    if (!name || !basePrice || !duration) {
      res.status(400).json({
        success: false,
        message: "Name, basePrice, and duration are required fields",
      });
      return;
    }

    // Validate numeric fields
    if (typeof basePrice !== "number" || basePrice < 0) {
      res.status(400).json({
        success: false,
        message: "basePrice must be a positive number",
      });
      return;
    }

    if (typeof duration !== "number" || duration <= 0) {
      res.status(400).json({
        success: false,
        message: "duration must be a positive number (in minutes)",
      });
      return;
    }

    // Check if service with same name already exists
    const existingService = await ServiceModel.findOne({
      name: { $regex: new RegExp(`^${name}$`, "i") },
    });

    if (existingService) {
      res.status(409).json({
        success: false,
        message: "Service with this name already exists",
      });
      return;
    }

    // Create service
    const service = new ServiceModel({
      name,
      description,
      basePrice,
      duration,
      isActive: isActive !== undefined ? isActive : true,
    });

    await service.save();

    res.status(201).json({
      success: true,
      message: "Service created successfully",
      service,
    });
  } catch (error: any) {
    console.error("Create service error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// Get All Services (with pagination and filtering)
export const getAllServices = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { page = 1, limit = 10, isActive, search } = req.query;

    const query: any = {};

    // Filter by isActive if provided
    if (isActive !== undefined) {
      query.isActive = isActive === "true";
    }

    // Search by name or description
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const services = await ServiceModel.find(query)
      .skip(skip)
      .limit(limitNum)
      .sort({ createdAt: -1 });

    const total = await ServiceModel.countDocuments(query);

    res.status(200).json({
      success: true,
      services,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalServices: total,
        limit: limitNum,
      },
    });
  } catch (error: any) {
    console.error("Get all services error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// Get Service by ID
export const getServiceById = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    // Validate ObjectId
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({
        success: false,
        message: "Invalid service ID format",
      });
      return;
    }

    const service = await ServiceModel.findById(id);

    if (!service) {
      res.status(404).json({ success: false, message: "Service not found" });
      return;
    }

    res.status(200).json({ success: true, service });
  } catch (error: any) {
    console.error("Get service by ID error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// Update Service
export const updateService = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, description, basePrice, duration, isActive } = req.body;

    // Validate ObjectId
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({
        success: false,
        message: "Invalid service ID format",
      });
      return;
    }

    // Find service
    const service = await ServiceModel.findById(id);
    if (!service) {
      res.status(404).json({ success: false, message: "Service not found" });
      return;
    }

    // Validate numeric fields if provided
    if (basePrice !== undefined) {
      if (typeof basePrice !== "number" || basePrice < 0) {
        res.status(400).json({
          success: false,
          message: "basePrice must be a positive number",
        });
        return;
      }
      service.basePrice = basePrice;
    }

    if (duration !== undefined) {
      if (typeof duration !== "number" || duration <= 0) {
        res.status(400).json({
          success: false,
          message: "duration must be a positive number (in minutes)",
        });
        return;
      }
      service.duration = duration;
    }

    // Check if name is being changed and if it's already taken
    if (name && name !== service.name) {
      const existingService = await ServiceModel.findOne({
        name: { $regex: new RegExp(`^${name}$`, "i") },
        _id: { $ne: id },
      });

      if (existingService) {
        res.status(409).json({
          success: false,
          message: "Service with this name already exists",
        });
        return;
      }
      service.name = name;
    }

    // Update fields
    if (description !== undefined) service.description = description;
    if (isActive !== undefined) service.isActive = isActive;

    await service.save();

    res.status(200).json({
      success: true,
      message: "Service updated successfully",
      service,
    });
  } catch (error: any) {
    console.error("Update service error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// Delete Service
export const deleteService = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    // Validate ObjectId
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({
        success: false,
        message: "Invalid service ID format",
      });
      return;
    }

    const service = await ServiceModel.findByIdAndDelete(id);

    if (!service) {
      res.status(404).json({ success: false, message: "Service not found" });
      return;
    }

    res.status(200).json({
      success: true,
      message: "Service deleted successfully",
      deletedService: {
        id: service._id,
        name: service.name,
      },
    });
  } catch (error: any) {
    console.error("Delete service error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};
