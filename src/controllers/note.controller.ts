import { Request, Response } from "express";
import { NoteModel } from "../models/Note";
import { BookingModel } from "../models/Booking";
import { IBooking } from "../models/Booking";
import { INote } from "../models/Note";
import { UserRole } from "../models/enums";
import mongoose from "mongoose";

const AUTHOR_SELECT = "name email role";
const BOOKING_POPULATE = {
  path: "bookingId",
  populate: [
    { path: "userId", select: "name email" },
    { path: "subAdminId", select: "name email" },
    { path: "serviceId", select: "name description" },
  ],
};

function isValidObjectId(id: unknown): id is string {
  return typeof id === "string" && mongoose.Types.ObjectId.isValid(id);
}

function assertStaffRole(role: UserRole | undefined, res: Response): boolean {
  if (role === UserRole.SUBADMIN || role === UserRole.SUPERADMIN) {
    return true;
  }
  res.status(403).json({
    success: false,
    message: "Only subadmins and superadmins can access notes",
  });
  return false;
}

function assertBookingAccess(
  booking: IBooking,
  userId: string,
  role: UserRole | undefined,
  res: Response
): boolean {
  if (role === UserRole.SUPERADMIN) return true;
  if (role === UserRole.SUBADMIN && booking.subAdminId.toString() === userId) {
    return true;
  }
  res.status(403).json({
    success: false,
    message: "You do not have permission to access notes for this booking",
  });
  return false;
}

function assertNoteModifyAccess(
  note: INote,
  userId: string,
  role: UserRole | undefined,
  res: Response
): boolean {
  if (role === UserRole.SUPERADMIN) return true;
  const authorId =
    (note.authorId as mongoose.Types.ObjectId)?.toString?.() ||
    String(note.authorId);
  if (authorId === userId) return true;
  res.status(403).json({
    success: false,
    message: "You do not have permission to modify this note",
  });
  return false;
}

async function getAccessibleBookingIds(
  userId: string,
  role: UserRole | undefined,
  studentUserId?: string
): Promise<mongoose.Types.ObjectId[] | null> {
  if (role === UserRole.SUPERADMIN) {
    const filter: Record<string, unknown> = {};
    if (studentUserId && isValidObjectId(studentUserId)) {
      filter.userId = studentUserId;
    }
    const bookings = await BookingModel.find(filter).select("_id");
    return bookings.map((b) => b._id as mongoose.Types.ObjectId);
  }

  if (role === UserRole.SUBADMIN) {
    const filter: Record<string, unknown> = { subAdminId: userId };
    if (studentUserId && isValidObjectId(studentUserId)) {
      filter.userId = studentUserId;
    }
    const bookings = await BookingModel.find(filter).select("_id");
    return bookings.map((b) => b._id as mongoose.Types.ObjectId);
  }

  return null;
}

function applyNotePopulates<T>(query: T): T {
  return (query as mongoose.Query<unknown, INote>)
    .populate(BOOKING_POPULATE)
    .populate("authorId", AUTHOR_SELECT) as T;
}

// Create note for a booking
export const createNote = async (req: Request, res: Response): Promise<void> => {
  try {
    const { bookingId, content } = req.body;
    const userId = req.userId;
    const userRole = req.userRole;

    if (!assertStaffRole(userRole, res)) return;

    if (!bookingId) {
      res.status(400).json({ success: false, message: "bookingId is required" });
      return;
    }

    if (typeof content !== "string" || !content.trim()) {
      res.status(400).json({
        success: false,
        message: "content is required and cannot be empty",
      });
      return;
    }

    if (!isValidObjectId(bookingId)) {
      res.status(400).json({ success: false, message: "Invalid bookingId format" });
      return;
    }

    if (!userId || !isValidObjectId(userId)) {
      res.status(401).json({ success: false, message: "Invalid authentication" });
      return;
    }

    const booking = await BookingModel.findById(bookingId);
    if (!booking) {
      res.status(404).json({ success: false, message: "Booking not found" });
      return;
    }

    if (!assertBookingAccess(booking, userId, userRole, res)) return;

    const note = new NoteModel({
      bookingId,
      authorId: userId,
      content: content.trim(),
    });

    await note.save();

    const populatedNote = await applyNotePopulates(NoteModel.findById(note._id));

    res.status(201).json({
      success: true,
      message: "Note created successfully",
      note: populatedNote,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Create note error:", error);
    res.status(500).json({ success: false, message: "Server error", error: message });
  }
};

// List notes for a booking
export const getNotesByBookingId = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { bookingId } = req.params;
    const userId = req.userId;
    const userRole = req.userRole;

    if (!assertStaffRole(userRole, res)) return;

    if (!bookingId || !isValidObjectId(bookingId)) {
      res.status(400).json({ success: false, message: "Invalid bookingId format" });
      return;
    }

    if (!userId || !isValidObjectId(userId)) {
      res.status(401).json({ success: false, message: "Invalid authentication" });
      return;
    }

    const booking = await BookingModel.findById(bookingId);
    if (!booking) {
      res.status(404).json({ success: false, message: "Booking not found" });
      return;
    }

    if (!assertBookingAccess(booking, userId, userRole, res)) return;

    const notes = await applyNotePopulates(
      NoteModel.find({ bookingId }).sort({ createdAt: -1 })
    );

    res.status(200).json({
      success: true,
      notes: notes ?? [],
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Get notes by booking ID error:", error);
    res.status(500).json({ success: false, message: "Server error", error: message });
  }
};

// List notes (filter by student userId and/or bookingId)
export const getNotes = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    const userRole = req.userRole;
    const { page = 1, limit = 10, userId: studentUserId, bookingId } = req.query;

    if (!assertStaffRole(userRole, res)) return;

    if (!userId || !isValidObjectId(userId)) {
      res.status(401).json({ success: false, message: "Invalid authentication" });
      return;
    }

    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(1000, Math.max(1, parseInt(limit as string, 10) || 10));
    const skip = (pageNum - 1) * limitNum;

    let bookingIds: mongoose.Types.ObjectId[];

    if (bookingId) {
      if (!isValidObjectId(bookingId as string)) {
        res.status(400).json({ success: false, message: "Invalid bookingId format" });
        return;
      }
      const booking = await BookingModel.findById(bookingId);
      if (!booking) {
        res.status(404).json({ success: false, message: "Booking not found" });
        return;
      }
      if (!assertBookingAccess(booking, userId, userRole, res)) return;
      bookingIds = [booking._id as mongoose.Types.ObjectId];
    } else {
      const ids = await getAccessibleBookingIds(
        userId,
        userRole,
        studentUserId as string | undefined
      );
      if (ids === null) {
        res.status(403).json({ success: false, message: "Forbidden" });
        return;
      }
      bookingIds = ids;
    }

    const query =
      bookingIds.length > 0
        ? { bookingId: { $in: bookingIds } }
        : { bookingId: { $in: [] } };

    const notes = await applyNotePopulates(
      NoteModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum)
    );

    const total = await NoteModel.countDocuments(query);

    res.status(200).json({
      success: true,
      notes: notes ?? [],
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum) || 0,
        totalNotes: total,
        limit: limitNum,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Get notes error:", error);
    res.status(500).json({ success: false, message: "Server error", error: message });
  }
};

// Update note content
export const updateNote = async (req: Request, res: Response): Promise<void> => {
  try {
    const { noteId } = req.params;
    const { content } = req.body;
    const userId = req.userId;
    const userRole = req.userRole;

    if (!assertStaffRole(userRole, res)) return;

    if (!noteId || !isValidObjectId(noteId)) {
      res.status(400).json({ success: false, message: "Invalid noteId format" });
      return;
    }

    if (typeof content !== "string" || !content.trim()) {
      res.status(400).json({
        success: false,
        message: "content is required and cannot be empty",
      });
      return;
    }

    if (!userId || !isValidObjectId(userId)) {
      res.status(401).json({ success: false, message: "Invalid authentication" });
      return;
    }

    const note = await NoteModel.findById(noteId);
    if (!note) {
      res.status(404).json({ success: false, message: "Note not found" });
      return;
    }

    const booking = await BookingModel.findById(note.bookingId);
    if (!booking) {
      res.status(404).json({ success: false, message: "Booking not found" });
      return;
    }

    if (!assertBookingAccess(booking, userId, userRole, res)) return;
    if (!assertNoteModifyAccess(note, userId, userRole, res)) return;

    note.content = content.trim();
    await note.save();

    const populatedNote = await applyNotePopulates(NoteModel.findById(note._id));

    res.status(200).json({
      success: true,
      message: "Note updated successfully",
      note: populatedNote,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Update note error:", error);
    res.status(500).json({ success: false, message: "Server error", error: message });
  }
};

// Delete note
export const deleteNote = async (req: Request, res: Response): Promise<void> => {
  try {
    const { noteId } = req.params;
    const userId = req.userId;
    const userRole = req.userRole;

    if (!assertStaffRole(userRole, res)) return;

    if (!noteId || !isValidObjectId(noteId)) {
      res.status(400).json({ success: false, message: "Invalid noteId format" });
      return;
    }

    if (!userId || !isValidObjectId(userId)) {
      res.status(401).json({ success: false, message: "Invalid authentication" });
      return;
    }

    const note = await NoteModel.findById(noteId);
    if (!note) {
      res.status(404).json({ success: false, message: "Note not found" });
      return;
    }

    const booking = await BookingModel.findById(note.bookingId);
    if (!booking) {
      res.status(404).json({ success: false, message: "Booking not found" });
      return;
    }

    if (!assertBookingAccess(booking, userId, userRole, res)) return;
    if (!assertNoteModifyAccess(note, userId, userRole, res)) return;

    const bookingId = note.bookingId.toString();
    await note.deleteOne();

    res.status(200).json({
      success: true,
      message: "Note deleted successfully",
      bookingId,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Delete note error:", error);
    res.status(500).json({ success: false, message: "Server error", error: message });
  }
};
