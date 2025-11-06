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
