import { Router } from "express";
import { handleWebhookEvent } from "../controllers/webhook.controller";

const router = Router();

// Zoom webhook endpoint (public - no authentication required)
// Zoom will call this endpoint for webhook events and verification
// Verification is handled within handleWebhookEvent for endpoint.url_validation events
router.post("/zoom/webhook", handleWebhookEvent);

export default router;
