import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import axios from "axios";
import { UserModel } from "../models/User";
import { UserRole } from "../models/enums";
import { generateResumePDF } from "../utils/pdfGenerator";
import { uploadBufferToCloudinary } from "../utils/cloudinary";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";
const JWT_EXPIRES_IN = "7d";
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

// Register User
export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      name,
      email,
      password,
      role,
      contactNumber,
      profileImage,
      serviceId,
    } = req.body;

    // Validation
    if (!name || !email || !password || !role) {
      res.status(400).json({
        success: false,
        message: "All required fields must be provided",
      });
      return;
    }

    // Check if user exists
    const existingUser = await UserModel.findOne({ email });
    if (existingUser) {
      res.status(409).json({
        success: false,
        message: "User already exists with this email",
      });
      return;
    }

    // Validate role
    if (!Object.values(UserRole).includes(role)) {
      res
        .status(400)
        .json({ success: false, message: "Invalid role provided" });
      return;
    }

    // Check serviceId for subadmin
    if (role === UserRole.SUBADMIN && !serviceId) {
      res.status(400).json({
        success: false,
        message: "ServiceId is required for sub-admins",
      });
      return;
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    let verificationToken = undefined;
    let verificationTokenExpiresAt = undefined;
    
    // For normal users, setup verification requirements
    if (role === UserRole.USER) {
      const crypto = require("crypto");
      verificationToken = crypto.randomBytes(32).toString("hex");
      verificationTokenExpiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    }

    // Create user
    const user = await UserModel.create({
      name,
      email,
      password: hashedPassword,
      role,
      contactNumber,
      profileImage,
      ...(role === UserRole.SUBADMIN && { serviceId }),
      ...(role === UserRole.USER && { verificationToken, verificationTokenExpiresAt }),
      isVerified: role === UserRole.USER ? false : true,
    });
    
    if (role === UserRole.USER) {
      const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
      const { sendHtmlEmail } = require("../utils/emailService");
      
      const verificationLink = `${FRONTEND_URL}/verify?token=${verificationToken}`;
      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-radius: 8px; overflow: hidden;">
          <div style="background-color: #4CAF50; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0; font-size: 24px;">Welcome!</h1>
          </div>
          <div style="padding: 30px;">
            <p style="font-size: 16px; color: #333;">Hi ${name},</p>
            <p style="font-size: 16px; color: #333;">Thank you for registering. Please verify your email address to complete your profile and log in.</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${verificationLink}" style="background-color: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; font-size: 16px; display: inline-block;">Verify Email Address</a>
            </div>
            <p style="font-size: 14px; color: #666;">If the button doesn't work, you can copy and paste the following link into your browser:</p>
            <p style="font-size: 14px; word-break: break-all; color: #0066cc;">${verificationLink}</p>
            <p style="font-size: 14px; margin-top: 30px; color: #999;">If you didn't create an account, you can safely ignore this email.</p>
          </div>
        </div>
      `;
      
      // AWAIT is required here for Serverless environments (like Vercel)!
      // Otherwise, Vercel will kill the function the millisecond the response is sent,
      // terminating the email sending attempt abruptly with no logs.
      try {
        await sendHtmlEmail(email, "Welcome! Please verify your email", emailHtml);
      } catch (emailError) {
        console.error("Failed to send verification email:", emailError);
        // We can still proceed with 201 so the user gets created,
        // or we could return a 500. Let's just log it and proceed for now.
      }
      
      res.status(201).json({
        success: true,
        message: "User registered successfully. Please check your email to verify your account.",
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      });
      return;
    }

    // Generate token for verified accounts (subadmin, superadmin)
    const token = jwt.sign({ userId: user._id, role: user.role }, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
    });

    // Set cookie
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
      maxAge: COOKIE_MAX_AGE,
    });

    res.status(201).json({
      success: true,
      message: "User registered successfully",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        contactNumber: user.contactNumber,
        profileImage: user.profileImage,
        serviceId: user.serviceId,
      },
    });
  } catch (error: any) {
    console.error("Register error:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
};

// Login User
export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      res
        .status(400)
        .json({ success: false, message: "Email and password are required" });
      return;
    }

    // Find user
    const user = await UserModel.findOne({ email }).select("+password");
    if (!user) {
      res.status(401).json({ success: false, message: "Invalid credentials" });
      return;
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      res.status(401).json({ success: false, message: "Invalid credentials" });
      return;
    }

    // Check verification status
    if (user.role === UserRole.USER && !user.isVerified) {
      res.status(403).json({ success: false, message: "Please verify your email first" });
      return;
    }

    // Generate token
    const token = jwt.sign({ userId: user._id, role: user.role }, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
    });

    // Set cookie
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
      maxAge: COOKIE_MAX_AGE,
    });

    res.status(200).json({
      success: true,
      message: "Login successful",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        contactNumber: user.contactNumber,
        profileImage: user.profileImage,
        serviceId: user.serviceId,
      },
    });
  } catch (error: any) {
    console.error("Login error:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
};

// Logout User
export const logout = async (req: Request, res: Response): Promise<void> => {
  try {
    res.clearCookie("token", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
    });
    res.status(200).json({ success: true, message: "Logged out successfully" });
  } catch (error: any) {
    console.error("Logout error:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
};

// Get Current User
export const getCurrentUser = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = (req as any).userId;

    const user = await UserModel.findById(userId)
      .select("-password")
      .populate("serviceId");
    if (!user) {
      res.status(404).json({ success: false, message: "User not found" });
      return;
    }

    res.status(200).json({ success: true, user });
  } catch (error: any) {
    console.error("Get current user error:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
};

// Update Current User Profile
export const updateCurrentUserProfile = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = (req as any).userId;
    const {
      name,
      profileImage,
      dateOfBirth,
      country,
      city,
      highestQualification,
      fieldOfStudy,
      graduationYear,
      marksOrCGPA,
      targetDegreeInGermany,
      desiredCourseProgram,
      preferredIntake,
      englishProficiency,
      germanLanguageLevel,
      workExperience,
      estimatedBudget,
      shortlistedUniversities,
      needHelpWith,
      agreedToTerms,
    } = req.body;

    // Find user
    const user = await UserModel.findById(userId);
    if (!user) {
      res.status(404).json({ success: false, message: "User not found" });
      return;
    }

    // Update fields
    if (name !== undefined) user.name = name.trim();
    if (profileImage !== undefined) {
      const trimmed = profileImage.trim();
      if (trimmed) {
        user.profileImage = trimmed;
      } else {
        delete user.profileImage;
      }
    }
    if (dateOfBirth !== undefined) {
      if (dateOfBirth) {
        user.dateOfBirth = new Date(dateOfBirth);
      } else {
        delete user.dateOfBirth;
      }
    }
    if (country !== undefined) {
      const trimmed = country.trim();
      if (trimmed) {
        user.country = trimmed;
      } else {
        delete user.country;
      }
    }
    if (city !== undefined) user.city = city.trim() || undefined;
    if (highestQualification !== undefined) {
      user.highestQualification = highestQualification.trim() || undefined;
    }
    if (fieldOfStudy !== undefined) {
      user.fieldOfStudy = fieldOfStudy.trim() || undefined;
    }
    if (graduationYear !== undefined) {
      if (graduationYear) {
        user.graduationYear = parseInt(graduationYear, 10);
      } else {
        delete user.graduationYear;
      }
    }
    if (marksOrCGPA !== undefined) {
      user.marksOrCGPA = marksOrCGPA.trim() || undefined;
    }
    if (targetDegreeInGermany !== undefined) {
      user.targetDegreeInGermany = targetDegreeInGermany.trim() || undefined;
    }
    if (desiredCourseProgram !== undefined) {
      user.desiredCourseProgram = desiredCourseProgram.trim() || undefined;
    }
    if (preferredIntake !== undefined) {
      user.preferredIntake = preferredIntake.trim() || undefined;
    }
    if (englishProficiency !== undefined) {
      user.englishProficiency = englishProficiency.trim() || undefined;
    }
    if (germanLanguageLevel !== undefined) {
      user.germanLanguageLevel = germanLanguageLevel.trim() || undefined;
    }
    if (workExperience !== undefined) {
      user.workExperience = workExperience.trim() || undefined;
    }
    if (estimatedBudget !== undefined) {
      user.estimatedBudget = estimatedBudget.trim() || undefined;
    }
    if (shortlistedUniversities !== undefined) {
      user.shortlistedUniversities = shortlistedUniversities.trim() || undefined;
    }
    if (needHelpWith !== undefined) {
      user.needHelpWith = Array.isArray(needHelpWith) ? needHelpWith : [];
    }
    if (agreedToTerms !== undefined) {
      user.agreedToTerms = agreedToTerms;
    }

    await user.save();

    // Reload user from database to ensure we have the latest data for PDF generation
    const updatedUserForPDF = await UserModel.findById(userId);
    if (!updatedUserForPDF) {
      res.status(404).json({ success: false, message: "User not found after update" });
      return;
    }

    // Generate PDF resume with the latest user data
    const pdfBuffer = await generateResumePDF(updatedUserForPDF);
    
    // Upload PDF to Cloudinary
    let pdfUrl: string;
    try {
      const cloudinaryResult = await uploadBufferToCloudinary(pdfBuffer, {
        folder: "german-demo/resumes",
        resource_type: "raw", 
        format:"pdf",
        use_filename: false, // We're using filename_override, so don't use original filename
        unique_filename: true,
        filename_override: `resume_${userId}_${Date.now()}.pdf`,
      });
      pdfUrl = cloudinaryResult.secure_url;
    } catch (error: any) {
      console.error("Cloudinary PDF upload error:", error);
      // If Cloudinary upload fails, we can still return success but log the error
      // Or you might want to fail the request - let's fail it for now
      res.status(500).json({
        success: false,
        message: "Failed to upload PDF to Cloudinary",
        error: error.message,
      });
      return;
    }

    // Store PDF URL in user model
    user.resumePdf = pdfUrl;
    await user.save();

    const updatedUser = await UserModel.findById(userId)
      .select("-password")
      .populate("serviceId");

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      user: updatedUser,
      resumePdf: pdfUrl,
    });
  } catch (error: any) {
    console.error("Update current user profile error:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
};

// Upload Profile Image
export const uploadProfileImage = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = (req as any).userId;
    const file = (req as any).file;

    if (!file) {
      res.status(400).json({
        success: false,
        message: "No image file provided",
      });
      return;
    }

    // Find user
    const user = await UserModel.findById(userId);
    if (!user) {
      res.status(404).json({ success: false, message: "User not found" });
      return;
    }

    // Upload to Cloudinary
    let cloudinaryResult;
    try {
      cloudinaryResult = await uploadBufferToCloudinary(file.buffer, {
        folder: "german-demo/profile-images",
        resource_type: "image",
        use_filename: true,
        unique_filename: true,
      });
    } catch (error: any) {
      console.error("Cloudinary upload error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to upload image to Cloudinary",
        error: error.message,
      });
      return;
    }

    // Update user profile image
    user.profileImage = cloudinaryResult.secure_url;
    await user.save();

    const updatedUser = await UserModel.findById(userId)
      .select("-password")
      .populate("serviceId");

    res.status(200).json({
      success: true,
      message: "Profile image uploaded successfully",
      user: updatedUser,
      imageUrl: cloudinaryResult.secure_url,
    });
  } catch (error: any) {
    console.error("Upload profile image error:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
};

// Get Current User Resume PDF (returns URL or data)
export const getCurrentUserResume = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = (req as any).userId;

    const user = await UserModel.findById(userId).select("-password");
    if (!user) {
      res.status(404).json({ success: false, message: "User not found" });
      return;
    }

    if (!user.resumePdf) {
      res.status(404).json({
        success: false,
        message: "Resume PDF not found. Please update your profile first.",
      });
      return;
    }

    // Return the Cloudinary URL (or legacy base64 data URL for backward compatibility)
    res.status(200).json({
      success: true,
      resumePdf: user.resumePdf,
      resumePdfUrl: user.resumePdf.startsWith("http") 
        ? user.resumePdf 
        : undefined, // If it's a Cloudinary URL, return it
    });
  } catch (error: any) {
    console.error("Get current user resume error:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
};

// Serve Current User Resume PDF (proxies from Cloudinary)
export const serveCurrentUserResume = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = (req as any).userId;

    const user = await UserModel.findById(userId).select("-password");
    if (!user) {
      res.status(404).json({ success: false, message: "User not found" });
      return;
    }

    if (!user.resumePdf) {
      res.status(404).json({
        success: false,
        message: "Resume PDF not found. Please update your profile first.",
      });
      return;
    }

    // If it's a base64 data URL, serve it directly
    if (user.resumePdf.startsWith("data:")) {
      const base64Data = user.resumePdf.split(",")[1];
      if (!base64Data) {
        res.status(400).json({
          success: false,
          message: "Invalid resume PDF format.",
        });
        return;
      }
      const buffer = Buffer.from(base64Data, "base64");
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="resume.pdf"`);
      res.send(buffer);
      return;
    }

    // If it's a Cloudinary URL, fetch and proxy it
    if (user.resumePdf.startsWith("http")) {
      try {
        const response = await axios.get(user.resumePdf, {
          responseType: "arraybuffer",
          headers: {
            "User-Agent": "Mozilla/5.0",
          },
        });

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `inline; filename="resume.pdf"`);
        res.setHeader("Cache-Control", "public, max-age=3600");
        res.send(Buffer.from(response.data));
      } catch (error: any) {
        console.error("Error fetching PDF from Cloudinary:", error);
        res.status(500).json({
          success: false,
          message: "Failed to fetch PDF from Cloudinary",
          error: error.message,
        });
      }
      return;
    }

    res.status(400).json({
      success: false,
      message: "Invalid PDF format",
    });
  } catch (error: any) {
    console.error("Serve current user resume error:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
};

// Verify Email
export const verifyEmail = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.body;

    if (!token) {
      res.status(400).json({ success: false, message: "Verification token is required" });
      return;
    }

    const user = await UserModel.findOne({
      verificationToken: token,
      verificationTokenExpiresAt: { $gt: Date.now() },
    });

    if (!user) {
      res.status(400).json({ success: false, message: "Invalid or expired verification token" });
      return;
    }

    user.isVerified = true;
    (user as any).verificationToken = undefined;
    (user as any).verificationTokenExpiresAt = undefined;
    

    await user.save();

    res.status(200).json({ success: true, message: "Email verified successfully. You can now log in." });
  } catch (error: any) {
    console.error("Verify email error:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};
