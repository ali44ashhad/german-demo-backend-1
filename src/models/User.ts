import mongoose, { Schema, Document } from "mongoose";
import { UserRole } from "./enums";

export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  contactNumber?: string;
  profileImage?: string;
  serviceId?: mongoose.Types.ObjectId; // only for sub-admins
  // Personal Details
  dateOfBirth?: Date;
  country?: string;
  city?: string;
  // Academic Details
  highestQualification?: string;
  fieldOfStudy?: string;
  graduationYear?: number;
  marksOrCGPA?: string;
  targetDegreeInGermany?: string;
  desiredCourseProgram?: string;
  preferredIntake?: string; // Winter / Summer
  englishProficiency?: string; // IELTS / TOEFL / PTE
  germanLanguageLevel?: string; // None / A1 / A2 / B1 / B2 / C1
  workExperience?: string;
  // Financial & Planning
  estimatedBudget?: string;
  shortlistedUniversities?: string;
  needHelpWith?: string[]; // Array for SOP, LOR, Application Process checkboxes
  // Consent
  agreedToTerms?: boolean;
  // Verification
  isVerified?: boolean;
  verificationToken?: string;
  verificationTokenExpiresAt?: Date;
  // Resume PDF
  resumePdf?: string; // URL or path to the generated PDF resume
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true },
    role: {
      type: String,
      enum: Object.values(UserRole),
      required: true,
    },
    contactNumber: { type: String },
    profileImage: { type: String },
    serviceId: {
      type: Schema.Types.ObjectId,
      ref: "Service",
      required: function (this: IUser) {
        return this.role === UserRole.SUBADMIN;
      },
      validate: {
        validator: function (value: any) {
          // Allow undefined/null for non-subadmins
          if (this.role !== UserRole.SUBADMIN) return true;
          // Validate ObjectId format for subadmins
          return mongoose.Types.ObjectId.isValid(value);
        },
        message: "Invalid serviceId provided.",
      },
    },
    // Personal Details
    dateOfBirth: { type: Date },
    country: { type: String, trim: true },
    city: { type: String, trim: true },
    // Academic Details
    highestQualification: { type: String, trim: true },
    fieldOfStudy: { type: String, trim: true },
    graduationYear: { type: Number },
    marksOrCGPA: { type: String, trim: true },
    targetDegreeInGermany: { type: String, trim: true },
    desiredCourseProgram: { type: String, trim: true },
    preferredIntake: { type: String, trim: true }, // Winter / Summer
    englishProficiency: { type: String, trim: true }, // IELTS / TOEFL / PTE
    germanLanguageLevel: { type: String, trim: true }, // None / A1 / A2 / B1 / B2 / C1
    workExperience: { type: String, trim: true },
    // Financial & Planning
    estimatedBudget: { type: String, trim: true },
    shortlistedUniversities: { type: String, trim: true },
    needHelpWith: [{ type: String, trim: true }], // Array for SOP, LOR, Application Process
    // Consent
    agreedToTerms: { type: Boolean, default: false },
    // Verification
    isVerified: { type: Boolean, default: false },
    verificationToken: { type: String },
    verificationTokenExpiresAt: { type: Date },
    // Resume PDF
    resumePdf: { type: String },
  },
  { timestamps: true }
);

export const UserModel = mongoose.model<IUser>("User", UserSchema);
