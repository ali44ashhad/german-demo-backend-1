import mongoose, { Schema, Document } from "mongoose";
import { Gender, UserRole } from "./enums";

const BiodataPeriodFields = {
  startDate: { type: String, trim: true },
  endDate: { type: String, trim: true },
  startMonth: { type: Number, min: 1, max: 12 },
  startYear: { type: Number, min: 1950, max: 2100 },
  endMonth: { type: Number, min: 1, max: 12 },
  endYear: { type: Number, min: 1950, max: 2100 },
};

const RatedItemSchema = new Schema(
  {
    label: { type: String, trim: true, required: true },
    score: { type: Number, min: 1, max: 5, required: true },
  },
  { _id: false }
);

const BiodataEducationEntrySchema = new Schema(
  {
    ...BiodataPeriodFields,
    institutionName: { type: String, trim: true },
    location: { type: String, trim: true },
    courseOfStudy: { type: String, trim: true },
    degreeType: { type: String, trim: true },
    focusAreas: [{ type: String, trim: true }],
  },
  { _id: false }
);

const BiodataInternshipThesisEntrySchema = new Schema(
  {
    ...BiodataPeriodFields,
    isCurrent: { type: Boolean, default: false },
    organizationName: { type: String, trim: true },
    location: { type: String, trim: true },
    entryType: { type: String, trim: true },
    title: { type: String, trim: true },
    descriptionBullets: [{ type: String, trim: true }],
  },
  { _id: false }
);

const BiodataExperienceEntrySchema = new Schema(
  {
    ...BiodataPeriodFields,
    isCurrent: { type: Boolean, default: false },
    companyName: { type: String, trim: true },
    location: { type: String, trim: true },
    roleTitle: { type: String, trim: true },
    responsibilities: [{ type: String, trim: true }],
  },
  { _id: false }
);

const EnglishTestSectionsSchema = new Schema(
  {
    listening: { type: String, trim: true },
    reading: { type: String, trim: true },
    writing: { type: String, trim: true },
    speaking: { type: String, trim: true },
  },
  { _id: false }
);

const EnglishTestSchema = new Schema(
  {
    testType: { type: String, trim: true },
    overall: { type: String, trim: true },
    sections: { type: EnglishTestSectionsSchema, default: undefined },
    otherNote: { type: String, trim: true },
  },
  { _id: false }
);

const EducationOverviewRowSchema = new Schema(
  {
    degree: { type: String, trim: true },
    year: { type: String, trim: true },
    fieldOfStudy: { type: String, trim: true },
    universityOrLocation: { type: String, trim: true },
    percentageOrCgpa: { type: String, trim: true },
  },
  { _id: false }
);

const FamilyMemberSchema = new Schema(
  {
    name: { type: String, trim: true },
    occupation: { type: String, trim: true },
  },
  { _id: false }
);

export type BiodataPeriodEntry = {
  startDate?: string;
  endDate?: string;
  startMonth?: number;
  startYear?: number;
  endMonth?: number;
  endYear?: number;
};

export interface IBiodata {
  professionalTitle?: string;
  citizenship?: string;
  maritalStatus?: string;
  skillset?: { label: string; score: number }[];
  languages?: { label: string; score: number }[];
  itSkills?: { label: string; score: number }[];
  sportsAndHobbies?: { label: string; score: number }[];
  education?: (BiodataPeriodEntry & {
    institutionName?: string;
    location?: string;
    courseOfStudy?: string;
    degreeType?: string;
    focusAreas?: string[];
  })[];
  internshipsTheses?: (BiodataPeriodEntry & {
    isCurrent?: boolean;
    organizationName?: string;
    location?: string;
    entryType?: string;
    title?: string;
    descriptionBullets?: string[];
  })[];
  experience?: (BiodataPeriodEntry & {
    isCurrent?: boolean;
    companyName?: string;
    location?: string;
    roleTitle?: string;
    responsibilities?: string[];
  })[];
  keyHighlights?: string[];
  declarationPlace?: string;
  declarationDate?: Date;
  signatureName?: string;
}

export interface IFamilyMember {
  name?: string;
  occupation?: string;
}

export interface IStudentInquiry {
  /** @deprecated use gender */
  sex?: string;
  gender?: Gender;
  familyDescription?: string;
  familyMembers?: IFamilyMember[];
  educationOverview?: {
    degree?: string;
    year?: string;
    fieldOfStudy?: string;
    universityOrLocation?: string;
    percentageOrCgpa?: string;
  }[];
  motivationForFurtherStudies?: string;
  targetCountries?: string[];
  targetDegrees?: string[];
  targetFieldsOfStudy?: string[];
  englishTest?: {
    testType?: "IELTS" | "TOEFL" | "PTE" | "Other" | "";
    overall?: string;
    sections?: {
      listening?: string;
      reading?: string;
      writing?: string;
      speaking?: string;
    };
    otherNote?: string;
  };
  additionalTestOrCertificate?: string;
  shortlistedUniversitiesList?: string[];
  inquiryComments?: string[];
  inquiryAdditionalServices?: string[];
}

const BiodataSchema = new Schema<IBiodata>(
  {
    professionalTitle: { type: String, trim: true },
    citizenship: { type: String, trim: true },
    maritalStatus: { type: String, trim: true },
    skillset: { type: [RatedItemSchema], default: [] },
    languages: { type: [RatedItemSchema], default: [] },
    itSkills: { type: [RatedItemSchema], default: [] },
    sportsAndHobbies: { type: [RatedItemSchema], default: [] },
    education: { type: [BiodataEducationEntrySchema], default: [] },
    internshipsTheses: { type: [BiodataInternshipThesisEntrySchema], default: [] },
    experience: { type: [BiodataExperienceEntrySchema], default: [] },
    keyHighlights: [{ type: String, trim: true }],
    declarationPlace: { type: String, trim: true },
    declarationDate: { type: Date },
    signatureName: { type: String, trim: true },
  },
  { _id: false }
);

const StudentInquirySchema = new Schema<IStudentInquiry>(
  {
    sex: { type: String, trim: true },
    gender: { type: String, trim: true, enum: [...Object.values(Gender)] },
    familyDescription: { type: String, trim: true },
    familyMembers: { type: [FamilyMemberSchema], default: [] },
    educationOverview: { type: [EducationOverviewRowSchema], default: [] },
    motivationForFurtherStudies: { type: String, trim: true },
    targetCountries: [{ type: String, trim: true }],
    targetDegrees: [{ type: String, trim: true }],
    targetFieldsOfStudy: [{ type: String, trim: true }],
    englishTest: { type: EnglishTestSchema, default: undefined },
    additionalTestOrCertificate: { type: String, trim: true },
    shortlistedUniversitiesList: [{ type: String, trim: true }],
    inquiryComments: [{ type: String, trim: true }],
    inquiryAdditionalServices: [{ type: String, trim: true }],
  },
  { _id: false }
);

export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  contactNumber?: string;
  profileImage?: string;
  serviceId?: mongoose.Types.ObjectId;
  /** Shared: multiline mailing address for PDFs */
  address?: string;
  linkedInUrl?: string;
  fullLegalName?: string;
  dateOfBirth?: Date;
  country?: string;
  city?: string;
  highestQualification?: string;
  fieldOfStudy?: string;
  graduationYear?: number;
  marksOrCGPA?: string;
  targetDegreeInGermany?: string;
  desiredCourseProgram?: string;
  preferredIntake?: string;
  englishProficiency?: string;
  germanLanguageLevel?: string;
  workExperience?: string;
  estimatedBudget?: string;
  shortlistedUniversities?: string;
  needHelpWith?: string[];
  agreedToTerms?: boolean;
  isVerified?: boolean;
  verificationToken?: string;
  verificationTokenExpiresAt?: Date;
  /** @deprecated use biodataPdf */
  resumePdf?: string;
  biodataPdf?: string;
  studentInquiryPdf?: string;
  biodata?: IBiodata;
  studentInquiry?: IStudentInquiry;
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
    address: { type: String, trim: true },
    linkedInUrl: { type: String, trim: true },
    fullLegalName: { type: String, trim: true },
    serviceId: {
      type: Schema.Types.ObjectId,
      ref: "Service",
      required: function (this: IUser) {
        return this.role === UserRole.SUBADMIN;
      },
      validate: {
        validator: function (value: any) {
          if (this.role !== UserRole.SUBADMIN) return true;
          return mongoose.Types.ObjectId.isValid(value);
        },
        message: "Invalid serviceId provided.",
      },
    },
    dateOfBirth: { type: Date },
    country: { type: String, trim: true },
    city: { type: String, trim: true },
    highestQualification: { type: String, trim: true },
    fieldOfStudy: { type: String, trim: true },
    graduationYear: { type: Number },
    marksOrCGPA: { type: String, trim: true },
    targetDegreeInGermany: { type: String, trim: true },
    desiredCourseProgram: { type: String, trim: true },
    preferredIntake: { type: String, trim: true },
    englishProficiency: { type: String, trim: true },
    germanLanguageLevel: { type: String, trim: true },
    workExperience: { type: String, trim: true },
    estimatedBudget: { type: String, trim: true },
    shortlistedUniversities: { type: String, trim: true },
    needHelpWith: [{ type: String, trim: true }],
    agreedToTerms: { type: Boolean, default: false },
    isVerified: { type: Boolean, default: false },
    verificationToken: { type: String },
    verificationTokenExpiresAt: { type: Date },
    resumePdf: { type: String },
    biodataPdf: { type: String },
    studentInquiryPdf: { type: String },
    biodata: { type: BiodataSchema, default: {} },
    studentInquiry: { type: StudentInquirySchema, default: {} },
  },
  { timestamps: true }
);

export const UserModel = mongoose.model<IUser>("User", UserSchema);
