import axios, { AxiosInstance } from "axios";
import dotenv from "dotenv";

// Ensure dotenv is configured before reading environment variables
dotenv.config();

const ZOOM_ACCOUNT_ID = process.env?.ZOOM_ACCOUNT_ID;
const ZOOM_CLIENT_ID = process.env.ZOOM_CLIENT_ID;
const ZOOM_CLIENT_SECRET = process.env.ZOOM_CLIENT_SECRET;

// console.log("🔍 Zoom Credentials Check:");
// console.log(
//   "  ZOOM_ACCOUNT_ID:",
//   ZOOM_ACCOUNT_ID
//     ? `✅ Set (${ZOOM_ACCOUNT_ID.substring(0, 4)}...)`
//     : "❌ Missing"
// );
// console.log(
//   "  ZOOM_CLIENT_ID:",
//   ZOOM_CLIENT_ID
//     ? `✅ Set (${ZOOM_CLIENT_ID.substring(0, 4)}...)`
//     : "❌ Missing"
// );
// console.log(
//   "  ZOOM_CLIENT_SECRET:",
//   ZOOM_CLIENT_SECRET
//     ? `✅ Set (${ZOOM_CLIENT_SECRET.substring(0, 4)}...)`
//     : "❌ Missing"
// );

// Additional debug: Check if .env file is being read
if (!ZOOM_ACCOUNT_ID && !ZOOM_CLIENT_ID && !ZOOM_CLIENT_SECRET) {
  console.warn("⚠️  No Zoom credentials found. Please verify:");
  console.warn("   1. .env file exists in the project root");
  console.warn(
    "   2. .env file contains: ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET"
  );
  console.warn(
    '   3. No quotes around values in .env (e.g., ZOOM_CLIENT_ID=abc123 not ZOOM_CLIENT_ID="abc123")'
  );
  console.warn("   4. Server has been restarted after adding .env variables");
}

interface ZoomTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

interface ZoomMeetingSettings {
  host_video?: boolean;
  participant_video?: boolean;
  join_before_host?: boolean;
  mute_upon_entry?: boolean;
  watermark?: boolean;
  use_pmi?: boolean;
  approval_type?: 0 | 1 | 2; // 0: Automatically, 1: Manually, 2: No registration required
  registration_type?: 0 | 1 | 2 | 3;
  audio?: "both" | "telephony" | "voip";
  auto_recording?: "local" | "cloud" | "none";
  waiting_room?: boolean;
}

interface ZoomMeetingRequest {
  topic: string;
  type: 2; // Scheduled meeting
  start_time: string; // ISO 8601 format
  duration: number; // Duration in minutes
  timezone?: string;
  password?: string;
  agenda?: string;
  settings?: ZoomMeetingSettings;
}

interface ZoomMeetingResponse {
  id: string;
  join_url: string;
  start_url: string;
  topic: string;
  start_time: string;
  duration: number;
  timezone: string;
  created_at: string;
  settings: {
    host_video: boolean;
    participant_video: boolean;
    join_before_host: boolean;
    mute_upon_entry: boolean;
    watermark: boolean;
    use_pmi: boolean;
    approval_type: number;
    audio: string;
    auto_recording: string;
    waiting_room: boolean;
  };
}

interface ZoomRecordingFile {
  id: string;
  meeting_id: string;
  recording_start: string;
  recording_end: string;
  file_type: string;
  file_size: number;
  play_url: string;
  download_url: string;
  status: string;
  recording_type: string;
}

interface ZoomRecordingResponse {
  account_id: string;
  host_id: string;
  host_email: string;
  topic: string;
  type: number;
  start_time: string;
  timezone: string;
  duration: number;
  total_size: number;
  recording_count: number;
  recording_files: ZoomRecordingFile[];
}

class ZoomService {
  private accountId: string | undefined;
  private clientId: string | undefined;
  private clientSecret: string | undefined;
  private baseURL: string = "https://api.zoom.us/v2";
  private tokenURL: string = "https://zoom.us/oauth/token";
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;
  private axiosInstance: AxiosInstance;

  constructor() {
    this.accountId = ZOOM_ACCOUNT_ID;
    this.clientId = ZOOM_CLIENT_ID;
    this.clientSecret = ZOOM_CLIENT_SECRET;

    if (!this.accountId || !this.clientId || !this.clientSecret) {
      const missing = [];
      if (!this.accountId) missing.push("ZOOM_ACCOUNT_ID");
      if (!this.clientId) missing.push("ZOOM_CLIENT_ID");
      if (!this.clientSecret) missing.push("ZOOM_CLIENT_SECRET");

      console.warn(
        `⚠️  Zoom credentials missing: ${missing.join(
          ", "
        )}. Zoom integration will not work.`
      );
      console.warn("   Make sure these are set in your .env file.");
    }

    this.axiosInstance = axios.create({
      baseURL: this.baseURL,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }

  /**
   * Get access token using server-to-server OAuth
   * Implements token caching to avoid unnecessary API calls
   */
  private async getAccessToken(): Promise<string> {
    // Check if we have a valid cached token
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    if (!this.accountId || !this.clientId || !this.clientSecret) {
      const missing = [];
      if (!this.accountId) missing.push("ZOOM_ACCOUNT_ID");
      if (!this.clientId) missing.push("ZOOM_CLIENT_ID");
      if (!this.clientSecret) missing.push("ZOOM_CLIENT_SECRET");

      throw new Error(
        `Zoom credentials are missing: ${missing.join(
          ", "
        )}. Please check your .env file.`
      );
    }

    try {
      // Create the accountId:clientId:clientSecret string for Basic Auth
      const credentials = Buffer.from(
        `${this.clientId}:${this.clientSecret}`
      ).toString("base64");

      const response = await axios.post<ZoomTokenResponse>(
        `${this.tokenURL}?grant_type=account_credentials&account_id=${this.accountId}`,
        {},
        {
          headers: {
            Authorization: `Basic ${credentials}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      );

      if (!response.data.access_token) {
        throw new Error("Failed to obtain Zoom access token");
      }

      // Cache the token (subtract 60 seconds as buffer before expiry)
      this.accessToken = response.data.access_token;
      this.tokenExpiry = Date.now() + (response.data.expires_in - 60) * 1000;

      return this.accessToken;
    } catch (error: any) {
      console.error(
        "Error getting Zoom access token:",
        error.response?.data || error.message
      );
      throw new Error(
        `Failed to authenticate with Zoom: ${
          error.response?.data?.error_description || error.message
        }`
      );
    }
  }

  /**
   * Make authenticated request to Zoom API
   */
  private async makeAuthenticatedRequest<T>(
    method: "get" | "post" | "patch" | "delete",
    endpoint: string,
    data?: any
  ): Promise<T> {
    const token = await this.getAccessToken();

    try {
      const response = await this.axiosInstance.request<T>({
        method,
        url: endpoint,
        headers: {
          Authorization: `Bearer ${token}`,
        },
        data,
      });

      return response.data;
    } catch (error: any) {
      // If token expired, try once more with a new token
      if (error.response?.status === 401) {
        this.accessToken = null; // Clear cached token
        const newToken = await this.getAccessToken();
        const retryResponse = await this.axiosInstance.request<T>({
          method,
          url: endpoint,
          headers: {
            Authorization: `Bearer ${newToken}`,
          },
          data,
        });
        return retryResponse.data;
      }

      console.error(
        `Zoom API Error (${method.toUpperCase()} ${endpoint}):`,
        error.response?.data || error.message
      );
      throw new Error(
        `Zoom API error: ${error.response?.data?.message || error.message}`
      );
    }
  }

  /**
   * Create a Zoom meeting
   */
  async createMeeting(
    topic: string,
    startTime: Date,
    duration: number, // in minutes
    timezone: string = "UTC",
    options?: {
      password?: string;
      agenda?: string;
      hostVideo?: boolean;
      participantVideo?: boolean;
      joinBeforeHost?: boolean;
      muteUponEntry?: boolean;
      waitingRoom?: boolean;
      autoRecording?: "local" | "cloud" | "none";
    }
  ): Promise<ZoomMeetingResponse> {
    // Format start time as ISO 8601 string
    const startTimeISO = startTime.toISOString();

    const meetingRequest: ZoomMeetingRequest = {
      topic,
      type: 2, // Scheduled meeting
      start_time: startTimeISO,
      duration,
      timezone,
      ...(options?.password && { password: options.password }),
      ...(options?.agenda && { agenda: options.agenda }),
      settings: {
        host_video: options?.hostVideo ?? true,
        participant_video: options?.participantVideo ?? true,
        join_before_host: options?.joinBeforeHost ?? false,
        mute_upon_entry: options?.muteUponEntry ?? false,
        waiting_room: options?.waitingRoom ?? false,
        approval_type: 0, // Automatically approve
        audio: "both",
        auto_recording: options?.autoRecording ?? "none",
        use_pmi: false,
        watermark: false,
      },
    };

    try {
      const meeting = await this.makeAuthenticatedRequest<ZoomMeetingResponse>(
        "post",
        "/users/me/meetings",
        meetingRequest
      );

      return meeting;
    } catch (error: any) {
      console.error("Error creating Zoom meeting:", error);
      throw error;
    }
  }

  /**
   * Update a Zoom meeting
   */
  async updateMeeting(
    meetingId: string,
    updates: Partial<ZoomMeetingRequest>
  ): Promise<void> {
    try {
      await this.makeAuthenticatedRequest(
        "patch",
        `/meetings/${meetingId}`,
        updates
      );
    } catch (error: any) {
      console.error(`Error updating Zoom meeting ${meetingId}:`, error);
      throw error;
    }
  }

  /**
   * Delete a Zoom meeting
   */
  async deleteMeeting(meetingId: string): Promise<void> {
    try {
      await this.makeAuthenticatedRequest("delete", `/meetings/${meetingId}`);
    } catch (error: any) {
      console.error(`Error deleting Zoom meeting ${meetingId}:`, error);
      throw error;
    }
  }

  /**
   * Get meeting details
   */
  async getMeeting(meetingId: string): Promise<ZoomMeetingResponse> {
    try {
      return await this.makeAuthenticatedRequest<ZoomMeetingResponse>(
        "get",
        `/meetings/${meetingId}`
      );
    } catch (error: any) {
      console.error(`Error getting Zoom meeting ${meetingId}:`, error);
      throw error;
    }
  }

  /**
   * Get recording details for a meeting
   * Returns the recording files including download URLs
   */
  async getMeetingRecordings(
    meetingId: string
  ): Promise<ZoomRecordingResponse> {
    try {
      return await this.makeAuthenticatedRequest<ZoomRecordingResponse>(
        "get",
        `/meetings/${meetingId}/recordings`
      );
    } catch (error: any) {
      console.error(
        `Error getting recordings for meeting ${meetingId}:`,
        error
      );
      throw error;
    }
  }
}

// Export singleton instance
export const zoomService = new ZoomService();
export default zoomService;
