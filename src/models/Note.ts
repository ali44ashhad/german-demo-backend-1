import mongoose, { Schema, Document } from "mongoose";

export interface INote extends Document {
  bookingId: mongoose.Types.ObjectId;
  authorId: mongoose.Types.ObjectId;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

const NoteSchema = new Schema<INote>(
  {
    bookingId: {
      type: Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
    },
    authorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    content: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { timestamps: true }
);

NoteSchema.index({ bookingId: 1, createdAt: -1 });
NoteSchema.index({ authorId: 1 });

export const NoteModel = mongoose.model<INote>("Note", NoteSchema);
