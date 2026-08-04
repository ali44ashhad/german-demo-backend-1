import { v2 as cloudinary, ConfigOptions } from "cloudinary";
import dotenv from "dotenv";
dotenv.config();

const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;

const isCloudinaryConfigured = Boolean(cloudName && apiKey && apiSecret);

if (cloudName && apiKey && apiSecret) {
  const config: ConfigOptions = {
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  };
  cloudinary.config(config);
} else {
  console.warn(
    "⚠️  Cloudinary configuration is missing. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET. Uploads will fail until configured."
  );
}

export function assertCloudinaryConfigured(): void {
  if (!isCloudinaryConfigured) {
    throw new Error(
      "Cloudinary configuration is missing. Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET environment variables."
    );
  }
}

export { cloudinary, isCloudinaryConfigured };
