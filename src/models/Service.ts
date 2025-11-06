import mongoose, { Schema, Document } from "mongoose";

export interface IService extends Document {
  name: string;
  description?: string;
  basePrice: number;
  duration: number; // in minutes
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ServiceSchema = new Schema<IService>(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String },
    basePrice: { type: Number, required: true },
    duration: { type: Number, required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const ServiceModel = mongoose.model<IService>("Service", ServiceSchema);
