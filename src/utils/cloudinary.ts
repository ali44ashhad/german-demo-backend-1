import {
  UploadApiResponse,
  UploadApiErrorResponse,
} from "cloudinary";
import streamifier from "streamifier";
import { assertCloudinaryConfigured, cloudinary } from "../config/cloudinary";

type CloudinaryUploadOptions = {
  folder?: string;
  resource_type?: "image" | "raw" | "video" | "auto";
  use_filename?: boolean;
  unique_filename?: boolean;
  filename_override?: string;
} & Record<string, unknown>;

export const uploadBufferToCloudinary = (
  fileBuffer: Buffer,
  options: CloudinaryUploadOptions = {}
): Promise<UploadApiResponse> => {
  assertCloudinaryConfigured();

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: "auto",
        use_filename: true,
        unique_filename: true,
        ...options,
      },
      (
        error: UploadApiErrorResponse | undefined,
        result: UploadApiResponse | undefined
      ) => {
        if (error) {
          return reject(error);
        }

        if (!result) {
          return reject(
            new Error("Cloudinary upload failed without an error response")
          );
        }

        return resolve(result);
      }
    );

    streamifier.createReadStream(fileBuffer).pipe(uploadStream);
  });
};

export type CloudinaryResourceType = "image" | "raw" | "video";

const CLOUDINARY_HOST_RE = /res\.cloudinary\.com/i;

/** Extract public_id from a Cloudinary secure_url (strips version segment when present). */
export const parsePublicIdFromUrl = (url: string): string | null => {
  if (!url || url.startsWith("data:") || !CLOUDINARY_HOST_RE.test(url)) {
    return null;
  }

  try {
    const parsed = new URL(url);
    const uploadMarker = "/upload/";
    const markerIdx = parsed.pathname.indexOf(uploadMarker);
    if (markerIdx === -1) return null;

    let pathAfterUpload = parsed.pathname.slice(
      markerIdx + uploadMarker.length
    );
    // Drop leading transformations segment (e.g. v1234567890 or fl_attachment)
    const segments = pathAfterUpload.split("/").filter(Boolean);
    if (segments.length === 0) return null;

    const firstSegment = segments[0];
    if (firstSegment && /^v\d+$/.test(firstSegment)) {
      segments.shift();
    }

    if (segments.length === 0) return null;

    // Keep file extension — with use_filename + .pdf override, public_id includes ".pdf".
    return segments.join("/");
  } catch {
    return null;
  }
};

/** Build candidate public_ids (full path vs filename-only under known folders). */
export const buildPublicIdCandidates = (url: string): string[] => {
  const parsed = parsePublicIdFromUrl(url);
  if (!parsed) return [];

  const candidates = new Set<string>([parsed]);

  // Legacy uploads may have public_id without ".pdf" in the id.
  if (parsed.endsWith(".pdf")) {
    candidates.add(parsed.slice(0, -4));
  } else if (/\.pdf$/i.test(url)) {
    candidates.add(`${parsed}.pdf`);
  }

  const parts = parsed.split("/");
  if (parts.length > 1) {
    const basename = parts[parts.length - 1]!;
    candidates.add(basename);
    if (basename.endsWith(".pdf")) {
      candidates.add(basename.slice(0, -4));
    }
    if (parts[0] === "german-demo" && parts.length >= 3) {
      const withoutRoot = parts.slice(1).join("/");
      candidates.add(withoutRoot);
      if (withoutRoot.endsWith(".pdf")) {
        candidates.add(withoutRoot.slice(0, -4));
      }
    }
  }
  return [...candidates];
};

export const destroyCloudinaryAsset = async (
  publicId: string,
  resourceType: CloudinaryResourceType
): Promise<string> => {
  assertCloudinaryConfigured();
  const result = await cloudinary.uploader.destroy(publicId, {
    resource_type: resourceType,
    invalidate: true,
  });
  if (result.result === "ok" || result.result === "not found") {
    return result.result;
  }
  throw new Error(
    `Cloudinary destroy failed for ${publicId}: ${result.result}`
  );
};

const RESOURCE_TYPES_TO_TRY: CloudinaryResourceType[] = ["raw", "image"];

/** Try raw then image (legacy PDFs may be stored as image). */
const destroyPublicIdWithFallbackTypes = async (
  publicId: string,
  preferredType: CloudinaryResourceType = "raw"
): Promise<boolean> => {
  const order = [
    preferredType,
    ...RESOURCE_TYPES_TO_TRY.filter((t) => t !== preferredType),
  ];

  for (const resourceType of order) {
    const apiResult = await destroyCloudinaryAsset(publicId, resourceType);
    if (apiResult === "ok") return true;
  }
  return false;
};

export const destroyCloudinaryUrlBestEffort = async (
  url: string | undefined,
  resourceType: CloudinaryResourceType
): Promise<void> => {
  if (!url) return;

  const candidates = buildPublicIdCandidates(url);
  if (candidates.length === 0) return;

  for (const publicId of candidates) {
    try {
      const deleted = await destroyPublicIdWithFallbackTypes(
        publicId,
        resourceType
      );
      if (deleted) return;
    } catch {
      return;
    }
  }
};

export const destroyManyBestEffort = async (
  urls: (string | undefined)[],
  resourceType: CloudinaryResourceType,
  excludeUrls: (string | undefined)[] = []
): Promise<void> => {
  const exclude = new Set(excludeUrls.filter(Boolean) as string[]);
  const unique = [
    ...new Set(
      urls.filter(
        (u): u is string =>
          typeof u === "string" && u.length > 0 && !exclude.has(u)
      )
    ),
  ];

  await Promise.allSettled(
    unique.map((url) => destroyCloudinaryUrlBestEffort(url, resourceType))
  );
};

export const destroyPublicIdBestEffort = async (
  publicId: string | undefined,
  resourceType: CloudinaryResourceType
): Promise<void> => {
  if (!publicId) return;
  try {
    await destroyPublicIdWithFallbackTypes(publicId, resourceType);
  } catch {
    // Best-effort compensation / cleanup
  }
};

