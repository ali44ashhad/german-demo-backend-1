import { Router } from "express";
import { authenticate, authorize } from "../middlewares/userAuth";
import { UserRole } from "../models/enums";
import {
  createNote,
  getNotesByBookingId,
  getNotes,
  updateNote,
  deleteNote,
} from "../controllers/note.controller";

const router = Router();

const staffAuth = authorize(UserRole.SUBADMIN, UserRole.SUPERADMIN);

router.post("/notes", authenticate, staffAuth, createNote);

router.get("/notes/booking/:bookingId", authenticate, staffAuth, getNotesByBookingId);

router.get("/notes", authenticate, staffAuth, getNotes);

router.patch("/notes/:noteId", authenticate, staffAuth, updateNote);

router.delete("/notes/:noteId", authenticate, staffAuth, deleteNote);

export default router;
