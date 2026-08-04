import type { IUser } from "../models/User";

const MAX_SLUG_LEN = 60;

export const getProfileDisplayName = (user: Pick<IUser, "name" | "fullLegalName">): string => {
  const legal = user.fullLegalName?.trim();
  if (legal) return legal;
  const name = user.name?.trim();
  if (name) return name;
  return "User";
};

export const slugifyForFilename = (
  input: string,
  userIdFallback?: string
): string => {
  let slug = input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");

  if (!slug && userIdFallback) {
    const suffix = String(userIdFallback).slice(-6);
    slug = `user_${suffix}`;
  }
  if (!slug) slug = "user";

  if (slug.length > MAX_SLUG_LEN) {
    slug = slug.slice(0, MAX_SLUG_LEN).replace(/_+$/, "");
  }
  return slug;
};

const timestampSuffix = (): string => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
};

export type ProfilePdfFilenames = {
  biodata: string;
  inquiry: string;
  cloudinaryBiodata: string;
  cloudinaryInquiry: string;
};

export const getProfilePdfFilenames = (
  user: Pick<IUser, "name" | "fullLegalName"> & { _id?: unknown; id?: string }
): ProfilePdfFilenames => {
  const userId = String(user._id ?? user.id ?? "");
  const slug = slugifyForFilename(getProfileDisplayName(user), userId);
  const ts = timestampSuffix();

  return {
    biodata: `${slug}_Biodata.pdf`,
    inquiry: `${slug}_Student_Inquiry.pdf`,
    cloudinaryBiodata: `${slug}_Biodata_${ts}.pdf`,
    cloudinaryInquiry: `${slug}_Student_Inquiry_${ts}.pdf`,
  };
};
