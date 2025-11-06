import { Request, Response } from "express";
import crypto from "crypto";
import { ZoomSessionModel } from "../models/ZoomSession";
import { BookingModel } from "../models/Booking";
import { ZoomSessionStatus } from "../models/enums";
import zoomService from "../utils/zoomService";
import dotenv from "dotenv";

dotenv.config();
// Zoom webhook secret token (should be set in environment variables)
const ZOOM_WEBHOOK_SECRET_TOKEN = process.env.ZOOM_WEBHOOK_SECRET_TOKEN || "";

/**
 * Verify Zoom webhook signature
 * Zoom sends webhooks with a signature in the headers for verification
 */
function verifyWebhookSignature(
  payload: string,
  signature: string,
  timestamp: string
): boolean {
  if (!ZOOM_WEBHOOK_SECRET_TOKEN) {
    console.warn(
      "⚠️  ZOOM_WEBHOOK_SECRET_TOKEN not set. Webhook verification disabled."
    );
    return true; // Allow if no secret is set (for development)
  }

  const message = `v0:${timestamp}:${payload}`;
  const hash = crypto
    .createHmac("sha256", ZOOM_WEBHOOK_SECRET_TOKEN)
    .update(message)
    .digest("hex");
  const expectedSignature = `v0=${hash}`;

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * Handle Zoom webhook verification challenge
 * Zoom sends a challenge request when you first set up the webhook
 * Format: { "event": "endpoint.url_validation", "payload": { "plainToken": "..." } }
 */
export const handleWebhookVerification = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    // Zoom sends verification as a webhook event
    const { event, payload } = req.body;

    // Check if this is a verification request
    if (event === "endpoint.url_validation") {
      console.log("ZOOM_WEBHOOK_SECRET_TOKEN", ZOOM_WEBHOOK_SECRET_TOKEN);
      const plainToken = payload?.plainToken;
      console.log("VERIFICATION REQUEST", plainToken);
      console.log("ZOOM_WEBHOOK_SECRET_TOKEN", ZOOM_WEBHOOK_SECRET_TOKEN);

      if (!plainToken) {
        res.status(400).json({
          success: false,
          message: "Missing plainToken in verification request",
        });
        return;
      }

      // Encrypt the plainToken with the webhook secret token
      const encryptedToken = crypto
        .createHmac("sha256", ZOOM_WEBHOOK_SECRET_TOKEN || "default-secret")
        .update(plainToken)
        .digest("hex");

      console.log("✅ Webhook verification challenge received and responded");

      res.status(200).json({
        plainToken,
        encryptedToken,
      });
      return;
    }

    // If not a verification request, return error
    res.status(400).json({
      success: false,
      message: "Not a verification request",
    });
  } catch (error: any) {
    console.error("Webhook verification error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during webhook verification",
      error: error.message,
    });
  }
};

/**
 * Handle Zoom webhook events
 * Processes various Zoom webhook events including recording.completed
 */
export const handleWebhookEvent = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { event, payload } = req.body;

    // Handle webhook verification challenge first
    if (event === "endpoint.url_validation") {
      return handleWebhookVerification(req, res);
    }

    // Verify webhook signature for actual events
    const signature = req.headers["x-zoom-webhook-signature"] as string;
    const timestamp = req.headers[
      "x-zoom-webhook-signature-timestamp"
    ] as string;

    if (signature && timestamp) {
      const payloadString = JSON.stringify(req.body);
      const isValid = verifyWebhookSignature(
        payloadString,
        signature,
        timestamp
      );

      if (!isValid) {
        console.error("❌ Invalid webhook signature");
        res.status(401).json({
          success: false,
          message: "Invalid webhook signature",
        });
        return;
      }
    }

    console.log(`📥 Received Zoom webhook event: ${event}`);

    // Handle different event types
    switch (event) {
      case "recording.completed":
        await handleRecordingCompleted(payload);
        break;

      case "meeting.ended":
        await handleMeetingEnded(payload);
        break;

      case "meeting.started":
        await handleMeetingStarted(payload);
        break;

      default:
        console.log(`ℹ️  Unhandled webhook event: ${event}`);
    }

    // Always return 200 to acknowledge receipt
    res.status(200).json({
      success: true,
      message: "Webhook received and processed",
    });
  } catch (error: any) {
    console.error("Webhook event processing error:", error);
    // Still return 200 to prevent Zoom from retrying
    res.status(200).json({
      success: false,
      message: "Error processing webhook",
      error: error.message,
    });
  }
};

/**
 * Handle recording.completed event
 * Fetches recording URLs and updates the booking and zoom session
 */
async function handleRecordingCompleted(payload: any): Promise<void> {
  try {
    const { object } = payload;
    console.log("OBJECT recieved when rec completed", object);
    const meetingId = object?.id?.toString();

    if (!meetingId) {
      console.error("❌ Missing meeting ID in recording.completed event");
      return;
    }

    console.log(`🎥 Recording completed for meeting: ${meetingId}`);

    // Find the ZoomSession by meetingId
    const zoomSession = await ZoomSessionModel.findOne({ meetingId });

    if (!zoomSession) {
      console.warn(
        `⚠️  No ZoomSession found for meeting ID: ${meetingId}. Recording URLs will not be saved.`
      );
      return;
    }

    // Fetch recording details from Zoom API
    let recordingUrl: string | undefined;
    try {
      const recordings = await zoomService.getMeetingRecordings(meetingId);

      if (recordings.recording_files && recordings.recording_files.length > 0) {
        // Prefer play_url (viewing URL) over download_url
        // You can change this logic based on your needs
        const recordingFile =
          recordings.recording_files.find(
            (file) => file.file_type === "MP4" || file.file_type === "M4A"
          ) || recordings.recording_files[0];

        if (recordingFile) {
          recordingUrl = recordingFile.play_url || recordingFile.download_url;

          console.log(
            `✅ Found recording URL for meeting ${meetingId}: ${recordingUrl}`
          );
        }
      } else {
        console.warn(`⚠️  No recording files found for meeting ${meetingId}`);
      }
    } catch (error: any) {
      console.error(
        `❌ Error fetching recordings for meeting ${meetingId}:`,
        error.message
      );
      // Continue even if API call fails - we'll try again later or use webhook data
    }

    // If we couldn't get recording from API, try to use webhook payload
    if (!recordingUrl && object?.recording_files) {
      const recordingFile =
        object.recording_files.find(
          (file: any) => file.file_type === "MP4" || file.file_type === "M4A"
        ) || object.recording_files[0];

      if (recordingFile) {
        recordingUrl = recordingFile.play_url || recordingFile.download_url;
        console.log(
          `✅ Using recording URL from webhook payload: ${recordingUrl}`
        );
      }
    }

    // Update ZoomSession with recording URL
    if (recordingUrl) {
      zoomSession.recordingUrl = recordingUrl;
      zoomSession.status = ZoomSessionStatus.COMPLETED;
      await zoomSession.save();

      console.log(
        `✅ Updated ZoomSession ${zoomSession._id} with recording URL`
      );
    } else {
      // Still mark as completed even if no recording URL yet
      zoomSession.status = ZoomSessionStatus.COMPLETED;
      await zoomSession.save();
      console.log(
        `⚠️  ZoomSession ${zoomSession._id} marked as completed but no recording URL available`
      );
    }
  } catch (error: any) {
    console.error("Error handling recording.completed event:", error);
    throw error;
  }
}

/**
 * Handle meeting.ended event
 * Updates the zoom session status when meeting ends
 */
async function handleMeetingEnded(payload: any): Promise<void> {
  try {
    const { object } = payload;
    const meetingId = object?.id?.toString();

    if (!meetingId) {
      console.error("❌ Missing meeting ID in meeting.ended event");
      return;
    }

    console.log(`🏁 Meeting ended: ${meetingId}`);

    const zoomSession = await ZoomSessionModel.findOne({ meetingId });

    if (zoomSession) {
      zoomSession.endTime = new Date();
      // Don't mark as completed yet - wait for recording.completed event
      await zoomSession.save();
      console.log(`✅ Updated ZoomSession ${zoomSession._id} end time`);
    }
  } catch (error: any) {
    console.error("Error handling meeting.ended event:", error);
  }
}

/**
 * Handle meeting.started event
 * Updates the zoom session status when meeting starts
 */
async function handleMeetingStarted(payload: any): Promise<void> {
  try {
    const { object } = payload;
    const meetingId = object?.id?.toString();

    if (!meetingId) {
      console.error("❌ Missing meeting ID in meeting.started event");
      return;
    }

    console.log(`▶️  Meeting started: ${meetingId}`);

    const zoomSession = await ZoomSessionModel.findOne({ meetingId });

    if (zoomSession) {
      zoomSession.status = ZoomSessionStatus.ONGOING;
      await zoomSession.save();
      console.log(
        `✅ Updated ZoomSession ${zoomSession._id} status to ONGOING`
      );
    }
  } catch (error: any) {
    console.error("Error handling meeting.started event:", error);
  }
}
