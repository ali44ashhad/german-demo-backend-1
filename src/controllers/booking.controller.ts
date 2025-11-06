import { Request, Response } from "express";
import { BookingModel } from "../models/Booking";
import { UserModel } from "../models/User";
import { ServiceModel } from "../models/Service";
import { ZoomSessionModel } from "../models/ZoomSession";
import {
  BookingStatus,
  PaymentStatus,
  ZoomSessionStatus,
} from "../models/enums";
import mongoose from "mongoose";
import zoomService from "../utils/zoomService";

// Create Booking
export const createBooking = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const {
      userId,
      subAdminId,
      serviceId,
      date,
      timeslot,
      amount,
      paymentStatus,
      zoomLink,
      zoomRecordingLink,
      bookingStatus,
    } = req.body;

    // Validation
    if (
      !userId ||
      !subAdminId ||
      !serviceId ||
      !date ||
      !timeslot ||
      amount === undefined
    ) {
      res.status(400).json({
        success: false,
        message:
          "userId, subAdminId, serviceId, date, timeslot, and amount are required fields",
      });
      return;
    }

    // Validate timeslot structure
    if (!timeslot.start || !timeslot.end) {
      res.status(400).json({
        success: false,
        message: "timeslot must have both start and end properties",
      });
      return;
    }

    // Validate ObjectIds
    const objectIds = [
      { field: "userId", value: userId },
      { field: "subAdminId", value: subAdminId },
      { field: "serviceId", value: serviceId },
    ];

    for (const { field, value } of objectIds) {
      if (!mongoose.Types.ObjectId.isValid(value)) {
        res.status(400).json({
          success: false,
          message: `Invalid ${field} format`,
        });
        return;
      }
    }

    // Check if userId exists
    const user = await UserModel.findById(userId);
    if (!user) {
      res.status(404).json({
        success: false,
        message: "User not found",
      });
      return;
    }

    // Check if subAdminId exists
    const subAdmin = await UserModel.findById(subAdminId);
    if (!subAdmin) {
      res.status(404).json({
        success: false,
        message: "Sub-admin not found",
      });
      return;
    }

    // Check if serviceId exists
    const service = await ServiceModel.findById(serviceId);
    if (!service) {
      res.status(404).json({
        success: false,
        message: "Service not found",
      });
      return;
    }

    // Validate date
    const dateObj = new Date(date);
    if (isNaN(dateObj.getTime())) {
      res.status(400).json({
        success: false,
        message: "Invalid date format",
      });
      return;
    }

    // Validate amount
    if (typeof amount !== "number" || amount < 0) {
      res.status(400).json({
        success: false,
        message: "amount must be a positive number",
      });
      return;
    }

    // Validate paymentStatus enum if provided
    if (
      paymentStatus &&
      !Object.values(PaymentStatus).includes(paymentStatus)
    ) {
      res.status(400).json({
        success: false,
        message: `Invalid paymentStatus. Must be one of: ${Object.values(
          PaymentStatus
        ).join(", ")}`,
      });
      return;
    }

    // Validate bookingStatus enum if provided
    if (
      bookingStatus &&
      !Object.values(BookingStatus).includes(bookingStatus)
    ) {
      res.status(400).json({
        success: false,
        message: `Invalid bookingStatus. Must be one of: ${Object.values(
          BookingStatus
        ).join(", ")}`,
      });
      return;
    }

    // Validate zoomLink can only be set if paymentStatus is SUCCESS
    if (zoomLink) {
      const finalPaymentStatus = paymentStatus || PaymentStatus.PENDING;
      if (finalPaymentStatus !== PaymentStatus.SUCCESS) {
        res.status(400).json({
          success: false,
          message: "Cannot set zoomLink before payment is successful",
        });
        return;
      }
    }

    // Create booking
    const booking = new BookingModel({
      userId,
      subAdminId,
      serviceId,
      date: dateObj,
      timeslot,
      amount,
      paymentStatus: paymentStatus || PaymentStatus.PENDING,
      zoomLink,
      zoomRecordingLink,
      bookingStatus: bookingStatus || BookingStatus.SCHEDULED,
    });

    await booking.save();

    // Automatically create Zoom meeting for the booking
    let zoomSession = null;
    try {
      // Calculate meeting duration from timeslot
      const startTime = new Date(timeslot.start);
      const endTime = new Date(timeslot.end);
      const durationMinutes = Math.round(
        (endTime.getTime() - startTime.getTime()) / (1000 * 60)
      );

      // Validate duration (Zoom requires at least 1 minute)
      if (durationMinutes < 1) {
        throw new Error("Meeting duration must be at least 1 minute");
      }

      // Create meeting topic with service name and user names
      const meetingTopic = `${service.name} - ${user.name} & ${subAdmin.name}`;
      const meetingAgenda = `Consultation session for ${service.name} service`;
      console.log("meetingTopic", meetingTopic);
      console.log("meetingAgenda", meetingAgenda);

      // Create Zoom meeting
      const zoomMeeting = await zoomService.createMeeting(
        meetingTopic,
        startTime,
        durationMinutes,
        "UTC", // You can make this configurable
        {
          agenda: meetingAgenda,
          hostVideo: true,
          participantVideo: true,
          joinBeforeHost: false,
          muteUponEntry: false,
          waitingRoom: false,
          autoRecording: "cloud", // Enable cloud recording to capture recordings and chat
        }
      );
      console.log("ZOOM CALL TESTING", zoomMeeting);

      // Create ZoomSession record
      zoomSession = new ZoomSessionModel({
        bookingId: booking._id,
        meetingId: zoomMeeting.id.toString(),
        joinUrl: zoomMeeting.join_url,
        startTime: startTime,
        endTime: endTime,
        status: ZoomSessionStatus.SCHEDULED,
      });

      await zoomSession.save();

      // Update booking with zoom link if payment is already successful
      // Otherwise, the link will be added when payment succeeds
      const finalPaymentStatus = paymentStatus || PaymentStatus.PENDING;
      if (finalPaymentStatus === PaymentStatus.SUCCESS) {
        booking.zoomLink = zoomMeeting.join_url;
        await booking.save();
      }

      console.log(
        `✅ Zoom meeting created successfully for booking ${booking._id}: ${zoomMeeting.id}`
      );
    } catch (zoomError: any) {
      // Log error but don't fail the booking creation
      console.error(
        `⚠️  Failed to create Zoom meeting for booking ${booking._id}:`,
        zoomError.message
      );
      // Continue with booking creation even if Zoom fails
      // The booking will be created without a Zoom link
    }

    // Populate references for response
    const populatedBooking = await BookingModel.findById(booking._id)
      .populate("userId")
      .populate("subAdminId")
      .populate("serviceId");

    // Include zoom session info in response if created
    const responseData: any = {
      success: true,
      message: "Booking created successfully",
      booking: populatedBooking,
    };

    if (zoomSession) {
      responseData.zoomSession = {
        meetingId: zoomSession.meetingId,
        joinUrl: zoomSession.joinUrl,
        startTime: zoomSession.startTime,
        status: zoomSession.status,
      };
    }

    res.status(201).json(responseData);
  } catch (error: any) {
    console.error("Create booking error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// Get All Bookings (with pagination and filtering)
export const getAllBookings = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const {
      page = 1,
      limit = 10,
      bookingStatus,
      paymentStatus,
      userId,
      subAdminId,
      serviceId,
      search,
    } = req.query;

    const query: any = {};

    // Filter by bookingStatus if provided
    if (
      bookingStatus &&
      Object.values(BookingStatus).includes(bookingStatus as BookingStatus)
    ) {
      query.bookingStatus = bookingStatus;
    }

    // Filter by paymentStatus if provided
    if (
      paymentStatus &&
      Object.values(PaymentStatus).includes(paymentStatus as PaymentStatus)
    ) {
      query.paymentStatus = paymentStatus;
    }

    // Filter by userId if provided
    if (userId) {
      if (!mongoose.Types.ObjectId.isValid(userId as string)) {
        res.status(400).json({
          success: false,
          message: "Invalid userId format",
        });
        return;
      }
      query.userId = userId;
    }

    // Filter by subAdminId if provided
    if (subAdminId) {
      if (!mongoose.Types.ObjectId.isValid(subAdminId as string)) {
        res.status(400).json({
          success: false,
          message: "Invalid subAdminId format",
        });
        return;
      }
      query.subAdminId = subAdminId;
    }

    // Filter by serviceId if provided
    if (serviceId) {
      if (!mongoose.Types.ObjectId.isValid(serviceId as string)) {
        res.status(400).json({
          success: false,
          message: "Invalid serviceId format",
        });
        return;
      }
      query.serviceId = serviceId;
    }

    // Search by date (if provided as a date string)
    // Note: This is a basic search - you might want to enhance this
    if (search) {
      // Try to parse as date and search
      const searchDate = new Date(search as string);
      if (!isNaN(searchDate.getTime())) {
        query.$or = [
          { date: searchDate },
          { "timeslot.start": { $regex: search, $options: "i" } },
          { "timeslot.end": { $regex: search, $options: "i" } },
        ];
      } else {
        query.$or = [
          { "timeslot.start": { $regex: search, $options: "i" } },
          { "timeslot.end": { $regex: search, $options: "i" } },
        ];
      }
    }

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const bookings = await BookingModel.find(query)
      .populate("userId")
      .populate("subAdminId")
      .populate("serviceId")
      .skip(skip)
      .limit(limitNum)
      .sort({ createdAt: -1 });

    const total = await BookingModel.countDocuments(query);

    res.status(200).json({
      success: true,
      bookings,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalBookings: total,
        limit: limitNum,
      },
    });
  } catch (error: any) {
    console.error("Get all bookings error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// Get Booking by ID
export const getBookingById = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    // Validate ObjectId
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({
        success: false,
        message: "Invalid booking ID format",
      });
      return;
    }

    const booking = await BookingModel.findById(id)
      .populate("userId")
      .populate("subAdminId")
      .populate("serviceId");

    if (!booking) {
      res.status(404).json({
        success: false,
        message: "Booking not found",
      });
      return;
    }

    res.status(200).json({ success: true, booking });
  } catch (error: any) {
    console.error("Get booking by ID error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// Update Booking
export const updateBooking = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const {
      userId,
      subAdminId,
      serviceId,
      date,
      timeslot,
      amount,
      paymentStatus,
      zoomLink,
      zoomRecordingLink,
      bookingStatus,
    } = req.body;

    // Validate ObjectId
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({
        success: false,
        message: "Invalid booking ID format",
      });
      return;
    }

    // Find booking
    const booking = await BookingModel.findById(id);
    if (!booking) {
      res.status(404).json({
        success: false,
        message: "Booking not found",
      });
      return;
    }

    // Validate and update ObjectId references if provided
    if (userId) {
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        res.status(400).json({
          success: false,
          message: "Invalid userId format",
        });
        return;
      }
      const user = await UserModel.findById(userId);
      if (!user) {
        res.status(404).json({
          success: false,
          message: "User not found",
        });
        return;
      }
      booking.userId = userId;
    }

    if (subAdminId) {
      if (!mongoose.Types.ObjectId.isValid(subAdminId)) {
        res.status(400).json({
          success: false,
          message: "Invalid subAdminId format",
        });
        return;
      }
      const subAdmin = await UserModel.findById(subAdminId);
      if (!subAdmin) {
        res.status(404).json({
          success: false,
          message: "Sub-admin not found",
        });
        return;
      }
      booking.subAdminId = subAdminId;
    }

    if (serviceId) {
      if (!mongoose.Types.ObjectId.isValid(serviceId)) {
        res.status(400).json({
          success: false,
          message: "Invalid serviceId format",
        });
        return;
      }
      const service = await ServiceModel.findById(serviceId);
      if (!service) {
        res.status(404).json({
          success: false,
          message: "Service not found",
        });
        return;
      }
      booking.serviceId = serviceId;
    }

    // Validate and update date if provided
    if (date) {
      const dateObj = new Date(date);
      if (isNaN(dateObj.getTime())) {
        res.status(400).json({
          success: false,
          message: "Invalid date format",
        });
        return;
      }
      booking.date = dateObj;
    }

    // Validate and update timeslot if provided
    if (timeslot) {
      if (!timeslot.start || !timeslot.end) {
        res.status(400).json({
          success: false,
          message: "timeslot must have both start and end properties",
        });
        return;
      }
      booking.timeslot = timeslot;
    }

    // Validate and update amount if provided
    if (amount !== undefined) {
      if (typeof amount !== "number" || amount < 0) {
        res.status(400).json({
          success: false,
          message: "amount must be a positive number",
        });
        return;
      }
      booking.amount = amount;
    }

    // Store original payment status to detect changes
    const originalPaymentStatus = booking.paymentStatus;

    // Validate and update paymentStatus if provided
    if (paymentStatus) {
      if (!Object.values(PaymentStatus).includes(paymentStatus)) {
        res.status(400).json({
          success: false,
          message: `Invalid paymentStatus. Must be one of: ${Object.values(
            PaymentStatus
          ).join(", ")}`,
        });
        return;
      }
      booking.paymentStatus = paymentStatus;
    }

    // Validate and update bookingStatus if provided
    if (bookingStatus) {
      if (!Object.values(BookingStatus).includes(bookingStatus)) {
        res.status(400).json({
          success: false,
          message: `Invalid bookingStatus. Must be one of: ${Object.values(
            BookingStatus
          ).join(", ")}`,
        });
        return;
      }
      booking.bookingStatus = bookingStatus;
    }

    // Validate zoomLink can only be set if paymentStatus is SUCCESS
    if (zoomLink !== undefined) {
      if (zoomLink === null || zoomLink === "") {
        delete booking.zoomLink;
      } else {
        const finalPaymentStatus = booking.paymentStatus;
        if (finalPaymentStatus !== PaymentStatus.SUCCESS) {
          res.status(400).json({
            success: false,
            message: "Cannot set zoomLink before payment is successful",
          });
          return;
        }
        booking.zoomLink = zoomLink;
      }
    }

    // Update optional fields
    if (zoomRecordingLink !== undefined) {
      if (zoomRecordingLink === null || zoomRecordingLink === "") {
        delete booking.zoomRecordingLink;
      } else {
        booking.zoomRecordingLink = zoomRecordingLink;
      }
    }

    await booking.save();

    // Handle Zoom meeting updates
    try {
      // Find existing Zoom session for this booking
      const existingZoomSession = await ZoomSessionModel.findOne({
        bookingId: booking._id,
      });

      if (existingZoomSession) {
        // If payment status changed to SUCCESS, update booking with zoom link
        if (
          paymentStatus === PaymentStatus.SUCCESS &&
          originalPaymentStatus !== PaymentStatus.SUCCESS
        ) {
          booking.zoomLink = existingZoomSession.joinUrl;
          await booking.save();
        }

        // If timeslot changed, update Zoom meeting
        if (timeslot && (timeslot.start || timeslot.end)) {
          const startTime = new Date(timeslot.start);
          const endTime = new Date(timeslot.end);
          const durationMinutes = Math.round(
            (endTime.getTime() - startTime.getTime()) / (1000 * 60)
          );

          if (durationMinutes >= 1) {
            await zoomService.updateMeeting(existingZoomSession.meetingId, {
              start_time: startTime.toISOString(),
              duration: durationMinutes,
            });

            // Update ZoomSession record
            existingZoomSession.startTime = startTime;
            existingZoomSession.endTime = endTime;
            await existingZoomSession.save();

            console.log(
              `✅ Zoom meeting ${existingZoomSession.meetingId} updated for booking ${booking._id}`
            );
          }
        }
      } else if (paymentStatus === PaymentStatus.SUCCESS) {
        // If no Zoom session exists but payment is successful, create one
        // This handles the case where booking was created before Zoom integration
        const startTime = new Date(booking.timeslot.start);
        const endTime = new Date(booking.timeslot.end);
        const durationMinutes = Math.round(
          (endTime.getTime() - startTime.getTime()) / (1000 * 60)
        );

        if (durationMinutes >= 1) {
          const populatedBookingForTopic = await BookingModel.findById(
            booking._id
          )
            .populate("userId")
            .populate("subAdminId")
            .populate("serviceId");

          const user = populatedBookingForTopic?.userId as any;
          const subAdmin = populatedBookingForTopic?.subAdminId as any;
          const service = populatedBookingForTopic?.serviceId as any;

          if (user && subAdmin && service) {
            const meetingTopic = `${service.name} - ${user.name} & ${subAdmin.name}`;
            const meetingAgenda = `Consultation session for ${service.name} service`;

            const zoomMeeting = await zoomService.createMeeting(
              meetingTopic,
              startTime,
              durationMinutes,
              "UTC",
              {
                agenda: meetingAgenda,
                hostVideo: true,
                participantVideo: true,
                joinBeforeHost: false,
                muteUponEntry: false,
                waitingRoom: false,
                autoRecording: "none",
              }
            );

            const newZoomSession = new ZoomSessionModel({
              bookingId: booking._id,
              meetingId: zoomMeeting.id.toString(),
              joinUrl: zoomMeeting.join_url,
              startTime: startTime,
              endTime: endTime,
              status: ZoomSessionStatus.SCHEDULED,
            });

            await newZoomSession.save();

            booking.zoomLink = zoomMeeting.join_url;
            await booking.save();
            console.log(
              `✅ Zoom meeting created for existing booking ${booking._id}: ${zoomMeeting.id}`
            );
          }
        }
      }
    } catch (zoomError: any) {
      // Log error but don't fail the booking update
      console.error(
        `⚠️  Failed to update Zoom meeting for booking ${booking._id}:`,
        zoomError.message
      );
    }

    // Populate references for response
    const populatedBooking = await BookingModel.findById(id)
      .populate("userId")
      .populate("subAdminId")
      .populate("serviceId");

    res.status(200).json({
      success: true,
      message: "Booking updated successfully",
      booking: populatedBooking,
    });
  } catch (error: any) {
    console.error("Update booking error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// Delete Booking
export const deleteBooking = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    // Validate ObjectId
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({
        success: false,
        message: "Invalid booking ID format",
      });
      return;
    }

    // Find and delete associated Zoom session before deleting booking
    const zoomSession = await ZoomSessionModel.findOne({ bookingId: id });
    if (zoomSession) {
      try {
        await zoomService.deleteMeeting(zoomSession.meetingId);
        await ZoomSessionModel.findByIdAndDelete(zoomSession._id);
        console.log(
          `✅ Zoom meeting ${zoomSession.meetingId} deleted for booking ${id}`
        );
      } catch (zoomError: any) {
        // Log error but continue with booking deletion
        console.error(
          `⚠️  Failed to delete Zoom meeting for booking ${id}:`,
          zoomError.message
        );
        // Still delete the ZoomSession record even if API call fails
        await ZoomSessionModel.findByIdAndDelete(zoomSession._id);
      }
    }

    const booking = await BookingModel.findByIdAndDelete(id);

    if (!booking) {
      res.status(404).json({
        success: false,
        message: "Booking not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "Booking deleted successfully",
      deletedBooking: {
        id: booking._id,
        userId: booking.userId,
        serviceId: booking.serviceId,
        date: booking.date,
      },
    });
  } catch (error: any) {
    console.error("Delete booking error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};
