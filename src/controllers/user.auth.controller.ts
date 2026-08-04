import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import axios from "axios";
import { UserModel } from "../models/User";
import { UserRole } from "../models/enums";
import { generateBiodataPDF } from "../utils/biodataPdfGenerator";
import { generateStudentInquiryPDF } from "../utils/studentInquiryPdfGenerator";
import { mergeProfileBodyIntoUser } from "../utils/profilePayloadMerge";
import {
  uploadBufferToCloudinary,
  destroyManyBestEffort,
  destroyPublicIdBestEffort,
  destroyCloudinaryUrlBestEffort,
} from "../utils/cloudinary";
import { getProfilePdfFilenames } from "../utils/profileDocumentNames";
import type { UploadApiResponse } from "cloudinary";

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

    const user = await UserModel.findById(userId);
    if (!user) {
      res.status(404).json({ success: false, message: "User not found" });
      return;
    }

    mergeProfileBodyIntoUser(user, req.body as Record<string, unknown>);

    await user.save();

    const updatedUserForPDF = await UserModel.findById(userId);
    if (!updatedUserForPDF) {
      res.status(404).json({ success: false, message: "User not found after update" });
      return;
    }

    const oldBiodataUrl = user.biodataPdf || user.resumePdf;
    const oldInquiryUrl = user.studentInquiryPdf;
    const pdfNames = getProfilePdfFilenames(updatedUserForPDF);

    let pdfBioBuffer: Buffer;
    let pdfInqBuffer: Buffer;
    try {
      pdfBioBuffer = await generateBiodataPDF(updatedUserForPDF);
      pdfInqBuffer = await generateStudentInquiryPDF(updatedUserForPDF);
    } catch (pdfErr: any) {
      console.error("PDF generation error:", pdfErr);
      res.status(500).json({
        success: false,
        message: "Failed to generate PDF documents",
        error: pdfErr?.message,
      });
      return;
    }

    let biodataPdfUrl: string;
    let studentInquiryPdfUrl: string;
    let bioResult: UploadApiResponse | undefined;
    let inqResult: UploadApiResponse | undefined;

    try {
      bioResult = await uploadBufferToCloudinary(pdfBioBuffer, {
        folder: "german-demo/biodata",
        resource_type: "raw",
        format: "pdf",
        use_filename: true,
        unique_filename: false,
        filename_override: pdfNames.cloudinaryBiodata,
      });
      biodataPdfUrl = bioResult.secure_url;
    } catch (error: any) {
      console.error("Cloudinary biodata PDF upload error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to upload PDF to Cloudinary",
        error: error.message,
      });
      return;
    }

    try {
      inqResult = await uploadBufferToCloudinary(pdfInqBuffer, {
        folder: "german-demo/student-inquiry",
        resource_type: "raw",
        format: "pdf",
        use_filename: true,
        unique_filename: false,
        filename_override: pdfNames.cloudinaryInquiry,
      });
      studentInquiryPdfUrl = inqResult.secure_url;
    } catch (error: any) {
      console.error("Cloudinary student inquiry PDF upload error:", error);
      await destroyPublicIdBestEffort(bioResult.public_id, "raw");
      res.status(500).json({
        success: false,
        message: "Failed to upload PDF to Cloudinary",
        error: error.message,
      });
      return;
    }

    user.biodataPdf = biodataPdfUrl;
    user.studentInquiryPdf = studentInquiryPdfUrl;
    user.resumePdf = biodataPdfUrl;

    try {
      await user.save();
    } catch (saveErr: any) {
      console.error("Failed to save PDF URLs after upload:", saveErr);
      await destroyPublicIdBestEffort(bioResult.public_id, "raw");
      await destroyPublicIdBestEffort(inqResult.public_id, "raw");
      res.status(500).json({
        success: false,
        message: "Failed to save profile PDF references",
        error: saveErr?.message,
      });
      return;
    }

    await destroyManyBestEffort(
      [oldBiodataUrl, oldInquiryUrl],
      "raw",
      [biodataPdfUrl, studentInquiryPdfUrl]
    );

    const updatedUser = await UserModel.findById(userId)
      .select("-password")
      .populate("serviceId");

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      user: updatedUser,
      biodataPdf: biodataPdfUrl,
      studentInquiryPdf: studentInquiryPdfUrl,
      resumePdf: biodataPdfUrl,
      biodataPdfFilename: pdfNames.biodata,
      studentInquiryPdfFilename: pdfNames.inquiry,
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

    const user = await UserModel.findById(userId);
    if (!user) {
      res.status(404).json({ success: false, message: "User not found" });
      return;
    }

    const oldProfileImage = user.profileImage;

    let cloudinaryResult: UploadApiResponse;
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

    const newImageUrl = cloudinaryResult.secure_url;
    user.profileImage = newImageUrl;

    try {
      await user.save();
    } catch (saveErr: any) {
      console.error("Failed to save profile image URL:", saveErr);
      await destroyPublicIdBestEffort(cloudinaryResult.public_id, "image");
      res.status(500).json({
        success: false,
        message: "Failed to save profile image",
        error: saveErr?.message,
      });
      return;
    }

    if (oldProfileImage && oldProfileImage !== newImageUrl) {
      await destroyCloudinaryUrlBestEffort(oldProfileImage, "image");
    }

    const updatedUser = await UserModel.findById(userId)
      .select("-password")
      .populate("serviceId");

    res.status(200).json({
      success: true,
      message: "Profile image uploaded successfully",
      user: updatedUser,
      imageUrl: newImageUrl,
    });
  } catch (error: any) {
    console.error("Upload profile image error:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
};

/** Stream a PDF from Cloudinary URL or data: URL */
async function serveStoredPdfResponse(
  res: Response,
  stored: string | undefined,
  filename: string
): Promise<void> {
  if (!stored) {
    res.status(404).json({
      success: false,
      message: "PDF not found. Please update your profile first.",
    });
    return;
  }

  if (stored.startsWith("data:")) {
    const base64Data = stored.split(",")[1];
    if (!base64Data) {
      res.status(400).json({
        success: false,
        message: "Invalid PDF format.",
      });
      return;
    }
    const buffer = Buffer.from(base64Data, "base64");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    res.send(buffer);
    return;
  }

  if (stored.startsWith("http")) {
    try {
      const response = await axios.get(stored, {
        responseType: "arraybuffer",
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.send(Buffer.from(response.data));
    } catch (error: any) {
      console.error("Error fetching PDF from Cloudinary:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch PDF from storage",
        error: error.message,
      });
    }
    return;
  }

  res.status(400).json({
    success: false,
    message: "Invalid PDF format",
  });
}

// Get Current User Resume PDF (returns URL or data) — legacy key points at biodata
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

    const biodataRef = user.biodataPdf || user.resumePdf;
    if (!biodataRef && !user.studentInquiryPdf) {
      res.status(404).json({
        success: false,
        message: "PDF not found. Please update your profile first.",
      });
      return;
    }

    res.status(200).json({
      success: true,
      resumePdf: biodataRef,
      resumePdfUrl: biodataRef?.startsWith("http") ? biodataRef : undefined,
      biodataPdf: user.biodataPdf,
      biodataPdfUrl: user.biodataPdf?.startsWith("http") ? user.biodataPdf : undefined,
      studentInquiryPdf: user.studentInquiryPdf,
      studentInquiryPdfUrl: user.studentInquiryPdf?.startsWith("http")
        ? user.studentInquiryPdf
        : undefined,
    });
  } catch (error: any) {
    console.error("Get current user resume error:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
};

// Serve biodata PDF (legacy /resume/file serves biodata || resumePdf)
export const serveCurrentUserBiodataFile = async (
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
    const pdfNames = getProfilePdfFilenames(user);
    await serveStoredPdfResponse(
      res,
      user.biodataPdf || user.resumePdf,
      pdfNames.biodata
    );
  } catch (error: any) {
    console.error("Serve biodata error:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

export const serveCurrentUserStudentInquiryFile = async (
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
    const pdfNames = getProfilePdfFilenames(user);
    await serveStoredPdfResponse(res, user.studentInquiryPdf, pdfNames.inquiry);
  } catch (error: any) {
    console.error("Serve student inquiry error:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

// Serve Current User Resume PDF (proxies biodata for backward compatibility)
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

    const pdfNames = getProfilePdfFilenames(user);
    await serveStoredPdfResponse(
      res,
      user.biodataPdf || user.resumePdf,
      pdfNames.biodata
    );
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

// Resend Verification Email
export const resendVerificationEmail = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;

    if (!email) {
      res.status(400).json({ success: false, message: "Email is required" });
      return;
    }

    const user = await UserModel.findOne({ email });
    if (!user) {
      res.status(404).json({ success: false, message: "User not found" });
      return;
    }

    if (user.isVerified) {
      res.status(400).json({ success: false, message: "Email is already verified. You can log in." });
      return;
    }

    const crypto = require("crypto");
    const verificationToken = crypto.randomBytes(32).toString("hex");
    const verificationTokenExpiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    user.verificationToken = verificationToken;
    user.verificationTokenExpiresAt = verificationTokenExpiresAt;
    await user.save();

    const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
    const { sendHtmlEmail } = require("../utils/emailService");
    
    const verificationLink = `${FRONTEND_URL}/verify?token=${verificationToken}`;
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-radius: 8px; overflow: hidden;">
        <div style="background-color: #4CAF50; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0; font-size: 24px;">New Verification Link</h1>
        </div>
        <div style="padding: 30px;">
          <p style="font-size: 16px; color: #333;">Hi ${user.name},</p>
          <p style="font-size: 16px; color: #333;">We received a request to resend your email verification link. Please click below to verify your account.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${verificationLink}" style="background-color: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; font-size: 16px; display: inline-block;">Verify Email Address</a>
          </div>
          <p style="font-size: 14px; color: #666;">If the button doesn't work, copy and paste this link:</p>
          <p style="font-size: 14px; word-break: break-all; color: #0066cc;">${verificationLink}</p>
        </div>
      </div>
    `;

    try {
      await sendHtmlEmail(email, "Your New Verification Link", emailHtml);
      res.status(200).json({ success: true, message: "A new verification link has been sent to your email." });
    } catch (emailError) {
      console.error("Failed to resend verification email:", emailError);
      res.status(500).json({ success: false, message: "Failed to send email. Please try again later." });
    }
  } catch (error: any) {
    console.error("Resend verify email error:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

