// Enums for roles, statuses, and payment methods

export enum UserRole {
  SUPERADMIN = "superadmin",
  SUBADMIN = "subadmin",
  USER = "user",
}

export enum BookingStatus {
  SCHEDULED = "scheduled",
  COMPLETED = "completed",
  CANCELLED = "cancelled",
  NO_SHOW = "no-show",
}

export enum PaymentStatus {
  PENDING = "pending",
  SUCCESS = "success",
  FAILED = "failed",
  REFUNDED = "refunded",
}

export enum PaymentMethod {
  STRIPE = "stripe",
  PAYPAL = "paypal",
  RAZORPAY = "razorpay",
  OTHER = "other",
}

export enum ZoomSessionStatus {
  SCHEDULED = "scheduled",
  ONGOING = "ongoing",
  COMPLETED = "completed",
}

/** Student inquiry / PDF — stable API values */
export enum Gender {
  MALE = "male",
  FEMALE = "female",
  TRANSGENDER = "transgender",
  NON_BINARY = "non_binary",
  PREFER_NOT_TO_SAY = "prefer_not_to_say",
  OTHER = "other",
}
