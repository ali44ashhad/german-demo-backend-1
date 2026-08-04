import axios from "axios";
import PDFDocument from "pdfkit";
import { IUser } from "../models/User";

export type PdfKitDoc = InstanceType<typeof PDFDocument>;

export type SectionIconKind =
  | "list"
  | "speech"
  | "star"
  | "person"
  | "monitor"
  | "sport"
  | "graduation"
  | "briefcase"
  | "compass";

export const COLORS = {
  sidebarGrey: "#e8e8e8",
  white: "#ffffff",
  accentBlue: "#1e4d8b",
  textDark: "#1a1a1a",
  muted: "#555555",
  dateGrey: "#888888",
  dotEmpty: "#b0b0b0",
  footerGrey: "#999999",
  columnRule: "#cccccc",
};

const ICON_RADIUS = 6;
const ICON_DIAM = ICON_RADIUS * 2;

/** Draw a filled blue circle with a simple white glyph */
export function drawCircleSectionIcon(
  doc: PdfKitDoc,
  cx: number,
  cy: number,
  kind: SectionIconKind
): void {
  doc.save();
  doc.circle(cx, cy, ICON_RADIUS).fillColor(COLORS.accentBlue).fill();
  doc.strokeColor(COLORS.white).lineWidth(0.8);
  const s = 3.5;
  const x0 = cx - s / 2;
  const y0 = cy - s / 2;

  switch (kind) {
    case "list":
      for (let i = 0; i < 3; i++) {
        doc.circle(x0 + 1, y0 + 1 + i * 2.2, 0.6).fillColor(COLORS.white).fill();
        doc
          .moveTo(x0 + 2.5, y0 + 1 + i * 2.2)
          .lineTo(x0 + s, y0 + 1 + i * 2.2)
          .stroke();
      }
      break;
    case "speech":
      doc
        .roundedRect(x0, y0, s, s - 1, 1)
        .stroke();
      doc
        .moveTo(x0 + 1.5, y0 + s - 1)
        .lineTo(x0 + 0.5, y0 + s + 1.5)
        .lineTo(x0 + 3, y0 + s - 0.5)
        .stroke();
      break;
    case "star": {
      const spikes = 5;
      const outer = 3.2;
      const inner = 1.4;
      doc.moveTo(cx, cy - outer);
      for (let i = 0; i < spikes * 2; i++) {
        const r = i % 2 === 0 ? outer : inner;
        const a = (Math.PI / 2) * -1 + (i * Math.PI) / spikes;
        doc.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
      }
      doc.closePath().fillColor(COLORS.white).fill();
      break;
    }
    case "person":
      doc.circle(cx, cy - 1.5, 1.3).fillColor(COLORS.white).fill();
      doc
        .moveTo(cx - 2.5, cy + 3)
        .lineTo(cx + 2.5, cy + 3)
        .quadraticCurveTo(cx, cy + 0.5, cx - 2.5, cy + 3)
        .fillColor(COLORS.white)
        .fill();
      break;
    case "monitor":
      doc.rect(x0, y0, s, s - 1.2).stroke();
      doc.moveTo(cx - 1.5, y0 + s - 1.2).lineTo(cx + 1.5, y0 + s - 1.2).stroke();
      doc.moveTo(cx, y0 + s - 1.2).lineTo(cx, y0 + s + 0.8).stroke();
      break;
    case "sport":
      doc.circle(cx - 1.2, cy, 1).fillColor(COLORS.white).fill();
      doc
        .moveTo(cx + 0.5, cy - 2)
        .lineTo(cx + 2.5, cy + 2)
        .stroke();
      break;
    case "graduation":
      doc.moveTo(x0, cy).lineTo(cx, y0).lineTo(x0 + s, cy).stroke();
      doc.moveTo(cx - 2, cy + 0.5).lineTo(cx + 2, cy + 0.5).stroke();
      doc.moveTo(cx, cy + 0.5).lineTo(cx, cy + 3).stroke();
      break;
    case "briefcase":
      doc.rect(x0 + 0.5, y0 + 1.5, s - 1, s - 2).stroke();
      doc.moveTo(cx - 1.2, y0 + 1.5).lineTo(cx - 1.2, y0).lineTo(cx + 1.2, y0).lineTo(cx + 1.2, y0 + 1.5).stroke();
      break;
    case "compass":
      doc.circle(cx, cy, s / 2 - 0.3).stroke();
      doc.moveTo(cx, cy - 2.5).lineTo(cx, cy + 2.5).stroke();
      doc.moveTo(cx - 2.5, cy).lineTo(cx + 2.5, cy).stroke();
      break;
    default:
      break;
  }
  doc.restore();
}

export function drawSidebarSectionHeader(
  doc: PdfKitDoc,
  x: number,
  y: number,
  w: number,
  title: string,
  iconKind: SectionIconKind
): number {
  const pad = 8;
  const iconCx = x + pad + ICON_RADIUS;
  const iconCy = y + ICON_RADIUS + 1;
  drawCircleSectionIcon(doc, iconCx, iconCy, iconKind);
  doc
    .fontSize(9)
    .font("Helvetica-Bold")
    .fillColor(COLORS.textDark)
    .text(title.toUpperCase(), x + pad + ICON_DIAM + 4, y + 1, {
      width: w - pad * 2 - ICON_DIAM - 4,
    });
  return y + ICON_DIAM + 6;
}

export function drawMainSectionHeader(
  doc: PdfKitDoc,
  x: number,
  y: number,
  w: number,
  title: string,
  iconKind: SectionIconKind
): number {
  const iconCx = x + ICON_RADIUS;
  const iconCy = y + ICON_RADIUS + 1;
  drawCircleSectionIcon(doc, iconCx, iconCy, iconKind);
  doc
    .fontSize(11)
    .font("Helvetica-Bold")
    .fillColor(COLORS.accentBlue)
    .text(title.toUpperCase(), x + ICON_DIAM + 6, y, { width: w - ICON_DIAM - 6 });
  return y + ICON_DIAM + 10;
}

/** Small dark-blue block at top-right of main column (reference template). */
export function drawCornerAccent(
  doc: PdfKitDoc,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  doc.save();
  doc.rect(x, y, width, height).fillColor(COLORS.accentBlue).fill();
  doc.restore();
}

export function drawPageFooter(
  doc: PdfKitDoc,
  opts: {
    label: string;
    pageNum: number;
    totalPages: number;
    margin: number;
    pageHeight: number;
    pageWidth: number;
  }
): void {
  const { label, pageNum, totalPages, margin, pageHeight, pageWidth } = opts;
  // Keep footer inside the bottom margin — drawing below the page edge creates blank pages in PDFKit.
  const footerY = pageHeight - margin - 12;
  const fontSize = 7.5;
  const innerW = pageWidth - margin * 2;
  doc.save();
  doc.font("Courier").fontSize(fontSize).fillColor(COLORS.footerGrey);
  doc.text(`${label}    Page ${pageNum} of ${totalPages}`, margin, footerY, {
    width: innerW,
    align: "left",
    lineBreak: false,
  });
  doc.restore();
}

function drawContactIcon(doc: PdfKitDoc, kind: "pin" | "mail" | "phone" | "linkedin", x: number, y: number): void {
  doc.save();
  doc.strokeColor(COLORS.accentBlue).fillColor(COLORS.accentBlue).lineWidth(0.7);
  const cx = x + 5;
  const cy = y + 5;
  switch (kind) {
    case "pin":
      doc.circle(cx, cy - 1, 2).stroke();
      doc.moveTo(cx, cy + 1).lineTo(cx, cy + 4).stroke();
      break;
    case "mail":
      doc.rect(cx - 3, cy - 2, 6, 4).stroke();
      doc.moveTo(cx - 3, cy - 2).lineTo(cx, cy).lineTo(cx + 3, cy - 2).stroke();
      break;
    case "phone":
      doc.roundedRect(cx - 2, cy - 3, 4, 6, 0.8).stroke();
      doc.moveTo(cx - 0.5, cy + 2).lineTo(cx + 0.5, cy + 2).stroke();
      break;
    case "linkedin":
      doc.fontSize(7).font("Helvetica-Bold").text("in", x + 1.5, y + 1.5, { width: 8 });
      break;
    default:
      break;
  }
  doc.restore();
}

/** Draw label + N filled dots (score 1–maxDots) */
export function drawRatedRow(
  doc: PdfKitDoc,
  x: number,
  y: number,
  label: string,
  score: number,
  opts: {
    width: number;
    fontSize?: number;
    textColor?: string;
    filledColor?: string;
    emptyColor?: string;
    maxDots?: number;
  }
): number {
  const fontSize = opts.fontSize ?? 8;
  const textColor = opts.textColor ?? COLORS.textDark;
  const filledColor = opts.filledColor ?? COLORS.accentBlue;
  const emptyColor = opts.emptyColor ?? COLORS.dotEmpty;
  const maxDots = opts.maxDots ?? 5;
  const safeScore = Math.min(maxDots, Math.max(0, Math.round(score)));
  const dotsWidth = maxDots * 5.5 + 4;

  doc.fontSize(fontSize).fillColor(textColor).text(label, x, y, {
    width: opts.width - dotsWidth,
    continued: false,
  });
  const dotY = y + 3;
  const startX = x + opts.width - dotsWidth + 2;
  const r = 2.5;
  const gap = 5.5;
  for (let i = 0; i < maxDots; i++) {
    doc
      .circle(startX + i * gap, dotY, r)
      .fillColor(i < safeScore ? filledColor : emptyColor)
      .fill();
  }
  return fontSize + 5;
}

export function drawContactBlock(
  doc: PdfKitDoc,
  user: IUser,
  box: { x: number; y: number; width: number },
  opts?: { title?: string; textColor?: string; withHeader?: boolean; maxY?: number }
): number {
  const title = opts?.title ?? "Contact";
  const textColor = opts?.textColor ?? COLORS.textDark;
  const withHeader = opts?.withHeader !== false;
  const maxY = opts?.maxY ?? doc.page.height;
  let y = box.y;
  const pad = 8;
  const iconColW = 14;
  const textX = box.x + pad + iconColW;
  const innerW = box.width - pad * 2 - iconColW;

  if (withHeader) {
    const iconCx = box.x + pad + ICON_RADIUS;
    const iconCy = y + ICON_RADIUS + 1;
    drawCircleSectionIcon(doc, iconCx, iconCy, "person");
    doc
      .fontSize(9)
      .font("Helvetica-Bold")
      .fillColor(COLORS.textDark)
      .text(title.toUpperCase(), box.x + pad + ICON_DIAM + 4, y + 1, {
        width: box.width - pad * 2 - ICON_DIAM - 4,
      });
    y += ICON_DIAM + 8;
  }

  doc.font("Helvetica").fontSize(8).fillColor(textColor);

  type ContactRow = { kind: "pin" | "mail" | "phone" | "linkedin"; value: string };
  const rows: ContactRow[] = [];
  if (user.address?.trim()) rows.push({ kind: "pin", value: user.address.trim() });
  if (user.email) rows.push({ kind: "mail", value: user.email });
  if (user.contactNumber?.trim()) rows.push({ kind: "phone", value: user.contactNumber.trim() });
  if (user.linkedInUrl?.trim()) rows.push({ kind: "linkedin", value: user.linkedInUrl.trim() });

  if (!rows.length) {
    doc.text("—", textX, y, { width: innerW });
    return y - box.y + 14;
  }

  for (const row of rows) {
    if (y > maxY - 12) break;
    drawContactIcon(doc, row.kind, box.x + pad, y);
    const lineH = doc.heightOfString(row.value, { width: innerW, lineGap: 1 });
    doc.text(row.value, textX, y, {
      width: innerW,
      lineGap: 1,
      height: Math.max(0, maxY - y),
    });
    y += lineH + 6;
  }
  return y - box.y + 4;
}

export type BioEntryConfig = {
  period?: string;
  organization?: string;
  blueLines?: string[];
  bullets?: string[];
};

/** Structured biodata main-column entry (clipped to maxY — no auto page breaks). */
export function drawBioEntry(
  doc: PdfKitDoc,
  x: number,
  y: number,
  w: number,
  entry: BioEntryConfig,
  maxY?: number
): number {
  const bottom = maxY ?? doc.page.height;
  let cy = y;
  const lineGap = 2;

  const writeLine = (
    text: string,
    fontSize: number,
    font: string,
    color: string
  ): boolean => {
    if (cy > bottom - 10) return false;
    doc.fontSize(fontSize).font(font).fillColor(color);
    const h = doc.heightOfString(text, { width: w, lineGap });
    doc.text(text, x, cy, { width: w, lineGap, height: Math.max(0, bottom - cy) });
    cy += h + lineGap;
    return true;
  };

  if (entry.period) {
    writeLine(entry.period, 8, "Helvetica", COLORS.dateGrey);
    cy += 2;
  }

  if (entry.organization) {
    writeLine(entry.organization, 10, "Helvetica-Bold", COLORS.textDark);
    cy += 2;
  }

  if (entry.blueLines?.length) {
    for (const line of entry.blueLines) {
      if (!line.trim()) continue;
      if (!writeLine(line, 9, "Helvetica", COLORS.accentBlue)) break;
    }
    cy += 2;
  }

  if (entry.bullets?.length) {
    for (const b of entry.bullets) {
      if (!b.trim()) continue;
      if (!writeLine(`• ${b.trim()}`, 9, "Helvetica", COLORS.textDark)) break;
    }
  }

  if (!entry.period && !entry.organization && !entry.blueLines?.length && !entry.bullets?.length) {
    writeLine("—", 9, "Helvetica", COLORS.textDark);
  }

  // Cap reported height so flow.y does not advance past the clip region (prevents orphan signature pages).
  const used = cy - y + 8;
  const maxUsed = Math.max(8, bottom - y);
  return Math.min(used, maxUsed);
}

export function bioEntryHasContent(entry: BioEntryConfig): boolean {
  return Boolean(
    entry.period?.trim() ||
      entry.organization?.trim() ||
      entry.blueLines?.some((l) => l?.trim()) ||
      entry.bullets?.some((b) => b?.trim())
  );
}

export function heightOfBioEntry(
  doc: PdfKitDoc,
  w: number,
  entry: BioEntryConfig,
  _maxY?: number
): number {
  let h = 8;
  const lineGap = 2;
  if (entry.period) {
    doc.fontSize(8).font("Helvetica");
    h += doc.heightOfString(entry.period, { width: w }) + lineGap + 2;
  }
  if (entry.organization) {
    doc.fontSize(10).font("Helvetica-Bold");
    h += doc.heightOfString(entry.organization, { width: w, lineGap }) + lineGap + 2;
  }
  if (entry.blueLines?.length) {
    doc.fontSize(9).font("Helvetica");
    for (const line of entry.blueLines) {
      if (!line.trim()) continue;
      h += doc.heightOfString(line, { width: w, lineGap }) + lineGap;
    }
    h += 2;
  }
  if (entry.bullets?.length) {
    doc.fontSize(9).font("Helvetica");
    for (const b of entry.bullets) {
      if (!b.trim()) continue;
      h += doc.heightOfString(`• ${b.trim()}`, { width: w, lineGap }) + lineGap;
    }
  }
  if (!entry.period && !entry.organization && !entry.blueLines?.length && !entry.bullets?.length) {
    h += 12;
  }
  return h;
}

export async function fetchProfileImageBuffer(
  profileImageUrl?: string | null
): Promise<Buffer | null> {
  if (!profileImageUrl || !profileImageUrl.startsWith("http")) return null;
  try {
    const imageResponse = await axios.get(profileImageUrl, {
      responseType: "arraybuffer",
      timeout: 10000,
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    return Buffer.from(imageResponse.data);
  } catch (error) {
    console.error("Failed to fetch profile image for PDF:", error);
    return null;
  }
}

export function formatDateDE(d?: Date | null): string {
  if (!d || isNaN(new Date(d).getTime())) return "—";
  const dt = new Date(d);
  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const yyyy = dt.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

export function formatPersonalDataLine(
  dob?: Date | null,
  citizenship?: string,
  maritalStatus?: string
): string {
  const parts: string[] = [];
  const dobStr = formatDateDE(dob);
  if (dobStr !== "—") parts.push(dobStr);
  const cit = citizenship?.trim();
  if (cit) parts.push(cit);
  const ms = maritalStatus?.trim();
  if (ms) parts.push(ms);
  return parts.length ? parts.join(", ") : "—";
}

export function sanitizeFooterLabel(name: string): string {
  return name.replace(/[^\w\s-]/g, "").replace(/\s+/g, "_").slice(0, 40) || "Student";
}

export function userHasContactInfo(user: IUser): boolean {
  return Boolean(
    user.address?.trim() ||
      user.email?.trim() ||
      user.contactNumber?.trim() ||
      user.linkedInUrl?.trim()
  );
}

const SIDEBAR_HEADER_H = ICON_DIAM + 6;

/** Height of a sidebar rated list (0 if no items). */
export function measureRatedListHeight(
  doc: PdfKitDoc,
  items: { label: string; score: number }[] | undefined,
  width: number
): number {
  const rows = filterRatedItems(items);
  if (!rows.length) return 0;
  let h = 0;
  const innerW = width - 16;
  doc.fontSize(8).font("Helvetica");
  for (const it of rows) {
    h += doc.heightOfString(it.label, { width: innerW - 40 }) + 7;
  }
  return h;
}

/** Height of contact block (0 if user has no contact fields). */
export function measureContactBlockHeight(
  doc: PdfKitDoc,
  user: IUser,
  width: number,
  withHeader = true
): number {
  if (!userHasContactInfo(user)) return 0;
  const pad = 8;
  const iconColW = 14;
  const innerW = width - pad * 2 - iconColW;
  let h = withHeader ? SIDEBAR_HEADER_H + 2 : 0;
  doc.font("Helvetica").fontSize(8);
  const rows: string[] = [];
  if (user.address?.trim()) rows.push(user.address.trim());
  if (user.email) rows.push(user.email);
  if (user.contactNumber?.trim()) rows.push(user.contactNumber.trim());
  if (user.linkedInUrl?.trim()) rows.push(user.linkedInUrl.trim());
  for (const value of rows) {
    h += doc.heightOfString(value, { width: innerW, lineGap: 1 }) + 6;
  }
  return h + 4;
}

export function sidebarSectionHeaderHeight(): number {
  return SIDEBAR_HEADER_H;
}

/** Only user-entered rated rows (no empty labels). */
export function filterRatedItems(
  items: { label: string; score: number }[] | undefined
): { label: string; score: number }[] {
  if (!items?.length) return [];
  return items
    .filter((it) => it?.label?.trim())
    .map((it) => ({
      label: it.label.trim(),
      score: Math.min(5, Math.max(1, Math.round(Number(it.score) || 3))),
    }));
}

export function ageFromDateOfBirth(dob?: Date | null): number | null {
  if (!dob || isNaN(new Date(dob).getTime())) return null;
  const d = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
  return age;
}
