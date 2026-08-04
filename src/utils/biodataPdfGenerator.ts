import PDFDocument from "pdfkit";
import { IUser, IBiodata } from "../models/User";
import { formatBioPeriodPdf } from "./bioPeriodDisplay";
import {
  COLORS,
  fetchProfileImageBuffer,
  drawRatedRow,
  drawContactBlock,
  drawSidebarSectionHeader,
  drawMainSectionHeader,
  drawCornerAccent,
  drawPageFooter,
  drawBioEntry,
  bioEntryHasContent,
  heightOfBioEntry,
  formatDateDE,
  formatPersonalDataLine,
  sanitizeFooterLabel,
  filterRatedItems,
  userHasContactInfo,
  measureRatedListHeight,
  measureContactBlockHeight,
  sidebarSectionHeaderHeight,
  type PdfKitDoc,
  type BioEntryConfig,
  type SectionIconKind,
} from "./pdfShared";
import { PdfMainFlow, MAIN_SECTION_HEADER_H, A4_PAGE_WIDTH, A4_PAGE_HEIGHT } from "./pdfMainFlow";
import { PdfSidebarRunner, type SidebarBlock } from "./pdfSidebarFlow";

const M = 36;
const SIDEBAR_W = 152;
const GUTTER = 14;
const FOOTER_H = 24;

type EduRow = NonNullable<IBiodata["education"]>[number];
type IntRow = NonNullable<IBiodata["internshipsTheses"]>[number];
type ExpRow = NonNullable<IBiodata["experience"]>[number];

function hasEducationData(ed: EduRow): boolean {
  return Boolean(
    ed.institutionName?.trim() ||
      ed.location?.trim() ||
      ed.courseOfStudy?.trim() ||
      ed.degreeType?.trim() ||
      ed.startMonth ||
      ed.startYear ||
      ed.endMonth ||
      ed.endYear ||
      ed.startDate?.trim() ||
      ed.endDate?.trim() ||
      ed.focusAreas?.some((f) => f?.trim())
  );
}

function hasInternshipData(it: IntRow): boolean {
  return Boolean(
    it.organizationName?.trim() ||
      it.location?.trim() ||
      it.entryType?.trim() ||
      it.title?.trim() ||
      it.isCurrent ||
      it.startMonth ||
      it.startYear ||
      it.endMonth ||
      it.endYear ||
      it.startDate?.trim() ||
      it.endDate?.trim() ||
      it.descriptionBullets?.some((b) => b?.trim())
  );
}

function hasExperienceData(ex: ExpRow): boolean {
  return Boolean(
    ex.companyName?.trim() ||
      ex.location?.trim() ||
      ex.roleTitle?.trim() ||
      ex.isCurrent ||
      ex.startMonth ||
      ex.startYear ||
      ex.endMonth ||
      ex.endYear ||
      ex.startDate?.trim() ||
      ex.endDate?.trim() ||
      ex.responsibilities?.some((b) => b?.trim())
  );
}

function drawRatedList(
  doc: PdfKitDoc,
  items: { label: string; score: number }[] | undefined,
  x: number,
  y: number,
  w: number,
  maxY: number
): number {
  const rows = filterRatedItems(items);
  if (!rows.length) return y;
  let cy = y;
  for (const it of rows) {
    if (cy > maxY - 16) break;
    const h = drawRatedRow(doc, x + 8, cy, it.label, it.score, { width: w - 16 });
    cy += h + 2;
  }
  return cy;
}

function educationEntry(ed: EduRow): BioEntryConfig {
  const entry: BioEntryConfig = { blueLines: [], bullets: (ed.focusAreas || []).filter(Boolean) };
  const period = formatBioPeriodPdf(ed, { allowSince: false });
  const organization = [ed.institutionName, ed.location].filter(Boolean).join(", ");
  if (period) entry.period = period;
  if (organization) entry.organization = organization;
  if (ed.courseOfStudy?.trim()) entry.blueLines!.push(`Course of study: ${ed.courseOfStudy.trim()}`);
  if (ed.degreeType?.trim()) entry.blueLines!.push(`Degree: ${ed.degreeType.trim()}`);
  return entry;
}

function internshipEntry(it: IntRow): BioEntryConfig {
  const entry: BioEntryConfig = { blueLines: [], bullets: (it.descriptionBullets || []).filter(Boolean) };
  const period = formatBioPeriodPdf(it, { allowSince: true });
  const organization = [it.organizationName, it.location].filter(Boolean).join(", ");
  if (period) entry.period = period;
  if (organization) entry.organization = organization;
  const typeTitle = [it.entryType, it.title].filter(Boolean).join(": ");
  if (typeTitle.trim()) entry.blueLines!.push(typeTitle.trim());
  return entry;
}

function experienceEntry(ex: ExpRow): BioEntryConfig {
  const entry: BioEntryConfig = { blueLines: [], bullets: (ex.responsibilities || []).filter(Boolean) };
  const period = formatBioPeriodPdf(ex, { allowSince: true });
  const organization = [ex.companyName, ex.location].filter(Boolean).join(", ");
  if (period) entry.period = period;
  if (organization) entry.organization = organization;
  if (ex.roleTitle?.trim()) entry.blueLines!.push(ex.roleTitle.trim());
  return entry;
}

function biodataHasMainContent(
  user: IUser,
  bio: IBiodata,
  subtitle: string
): boolean {
  if ((user.name || "").trim()) return true;
  if (subtitle.trim()) return true;
  if ((bio.education || []).some(hasEducationData)) return true;
  if ((bio.internshipsTheses || []).some(hasInternshipData)) return true;
  if ((bio.experience || []).some(hasExperienceData)) return true;
  if ((bio.keyHighlights || []).some((l) => l?.trim())) return true;
  if (user.workExperience?.trim()) return true;
  return false;
}

function buildBiodataSidebarBlocks(
  doc: PdfKitDoc,
  user: IUser,
  bio: IBiodata,
  imgBuf: Buffer | null,
  sidebarLeft: number,
  contentBottom: number
): SidebarBlock[] {
  const blocks: SidebarBlock[] = [];

  if (imgBuf) {
    blocks.push({
      id: "photo",
      measure: () => 88,
      draw: (sy) => {
        try {
          const sz = 78;
          const ix = sidebarLeft + (SIDEBAR_W - sz) / 2;
          doc.image(imgBuf, ix, sy, { width: sz, height: sz, fit: [sz, sz] });
          return sy + sz + 10;
        } catch {
          return sy + 6;
        }
      },
    });
  }

  const ratedSection = (
    id: string,
    title: string,
    icon: Parameters<typeof drawSidebarSectionHeader>[5],
    items: { label: string; score: number }[] | undefined
  ) => {
    if (!filterRatedItems(items).length) return;
    blocks.push({
      id,
      measure: () => sidebarSectionHeaderHeight() + measureRatedListHeight(doc, items, SIDEBAR_W),
      draw: (sy) => {
        let y = drawSidebarSectionHeader(doc, sidebarLeft, sy, SIDEBAR_W, title, icon);
        y = drawRatedList(doc, items, sidebarLeft, y, SIDEBAR_W, contentBottom);
        return y;
      },
    });
  };

  ratedSection("skillset", "Skillset", "list", bio.skillset);
  ratedSection("language", "Language", "speech", bio.languages);

  const personalLine = formatPersonalDataLine(user.dateOfBirth, bio.citizenship, bio.maritalStatus);
  if (personalLine !== "—") {
    blocks.push({
      id: "personal",
      measure: () => {
        doc.font("Helvetica").fontSize(8);
        return sidebarSectionHeaderHeight() + doc.heightOfString(personalLine, { width: SIDEBAR_W - 16, lineGap: 2 }) + 10;
      },
      draw: (sy) => {
        let y = drawSidebarSectionHeader(doc, sidebarLeft, sy, SIDEBAR_W, "Personal data", "star");
        doc.font("Helvetica").fontSize(8).fillColor(COLORS.textDark);
        doc.text(personalLine, sidebarLeft + 8, y, { width: SIDEBAR_W - 16, lineGap: 2 });
        return y + doc.heightOfString(personalLine, { width: SIDEBAR_W - 16, lineGap: 2 }) + 10;
      },
    });
  }

  ratedSection("it", "IT", "monitor", bio.itSkills);
  ratedSection("hobbies", "Sports and hobbies", "sport", bio.sportsAndHobbies);

  if (userHasContactInfo(user)) {
    blocks.push({
      id: "contact",
      measure: () => measureContactBlockHeight(doc, user, SIDEBAR_W),
      draw: (sy) => {
        drawContactBlock(doc, user, { x: sidebarLeft, y: sy, width: SIDEBAR_W }, {
          maxY: contentBottom,
        });
        return sy + measureContactBlockHeight(doc, user, SIDEBAR_W);
      },
    });
  }

  return blocks;
}

export async function generateBiodataPDF(user: IUser): Promise<Buffer> {
  return new Promise(async (resolve, reject) => {
    try {
      const bio = user.biodata || {};
      const subtitle =
        bio.professionalTitle?.trim() ||
        user.highestQualification ||
        user.desiredCourseProgram ||
        "";

      const imgBuf = await fetchProfileImageBuffer(user.profileImage);
      const hasMain = biodataHasMainContent(user, bio, subtitle);

      const doc = new PDFDocument({
        size: "A4",
        margins: { top: M, bottom: M, left: M, right: M },
        bufferPages: true,
        autoFirstPage: false,
      });
      const buffers: Buffer[] = [];
      doc.on("data", buffers.push.bind(buffers));
      doc.on("end", () => resolve(Buffer.concat(buffers)));
      doc.on("error", reject);

      const pageW = A4_PAGE_WIDTH;
      const pageH = A4_PAGE_HEIGHT;
      const contentBottom = pageH - M - FOOTER_H;
      const mainX = M + SIDEBAR_W + GUTTER;
      const mainW = pageW - mainX - M;
      const sidebarLeft = M;
      const displayName = (user.name || "Student").trim();
      const footerLabel = `Student Biodata_${sanitizeFooterLabel(displayName)}`;

      const sidebarBlocks = buildBiodataSidebarBlocks(doc, user, bio, imgBuf, sidebarLeft, contentBottom);
      const hasSidebar = sidebarBlocks.length > 0;

      if (!hasMain && !hasSidebar) {
        doc.end();
        return;
      }

      const sidebar = new PdfSidebarRunner({
        doc,
        x: sidebarLeft,
        width: SIDEBAR_W,
        pageTop: M,
        contentBottom,
        blocks: sidebarBlocks,
      });

      const flow = new PdfMainFlow({
        doc,
        margin: M,
        footerReserve: FOOTER_H,
        pageHeight: pageH,
        contentTop: M + 8,
        continuationTop: M + 6,
        onNewPage: () => {
          sidebar.drawForCurrentPage();
        },
      });

      await flow.beginFirstPage();

      /** Tracks where main-column content actually ends (from PDFKit doc.y after draws). */
      let contentEndY = flow.y;

      const drawMainNameBlock = (withCornerAccent: boolean): number => {
        let my = flow.y;
        if (withCornerAccent) {
          drawCornerAccent(doc, mainX + mainW - 48, my, 48, 8);
        }
        doc.fontSize(22).font("Helvetica-Bold").fillColor(COLORS.accentBlue).text(displayName, mainX, my, {
          width: mainW,
        });
        my += 28;
        doc.fontSize(11).font("Helvetica").fillColor(COLORS.textDark).text(subtitle || "—", mainX, my, {
          width: mainW,
        });
        return my + doc.heightOfString(subtitle || "—", { width: mainW }) + 16 - flow.y;
      };

      if (hasMain) {
        flow.advance(drawMainNameBlock(true));
        contentEndY = doc.y;
      }

      const drawSectionHeader = async (title: string, icon: SectionIconKind) => {
        await flow.ensureSpace(MAIN_SECTION_HEADER_H + 4);
        flow.y = drawMainSectionHeader(doc, mainX, flow.y, mainW, title, icon);
        contentEndY = flow.y;
      };

      const drawBioEntries = async (entries: BioEntryConfig[]) => {
        const filled = entries.filter(bioEntryHasContent);
        for (const entry of filled) {
          const entryH = heightOfBioEntry(doc, mainW, entry);
          if (entryH > flow.remaining() && flow.remaining() < 24) {
            await flow.ensureSpace(Math.min(entryH, 40));
          }
          drawBioEntry(doc, mainX, flow.y, mainW, entry, contentBottom);
          flow.y = doc.y;
          contentEndY = doc.y;
        }
      };

      const eduEntries = (bio.education || []).filter(hasEducationData).map(educationEntry);
      if (eduEntries.length) {
        await drawSectionHeader("Education", "graduation");
        await drawBioEntries(eduEntries);
        flow.advance(6);
        contentEndY = flow.y;
      }

      const intEntries = (bio.internshipsTheses || []).filter(hasInternshipData).map(internshipEntry);
      if (intEntries.length) {
        await drawSectionHeader("Internship / Thesis", "compass");
        await drawBioEntries(intEntries);
        flow.advance(6);
        contentEndY = flow.y;
      }

      const expEntries = (bio.experience || []).filter(hasExperienceData).map(experienceEntry);
      const legacyExp = user.workExperience?.trim();
      if (expEntries.length || legacyExp) {
        await drawSectionHeader("Experience", "briefcase");
        if (!expEntries.length && legacyExp) {
          doc.fontSize(9).font("Helvetica");
          const legacyH = doc.heightOfString(legacyExp, { width: mainW, lineGap: 2 }) + 12;
          await flow.ensureSpace(legacyH);
          doc.fillColor(COLORS.textDark).text(legacyExp, mainX, flow.y, {
            width: mainW,
            lineGap: 2,
            height: flow.remaining(),
          });
          flow.y = doc.y;
          contentEndY = doc.y;
        } else {
          await drawBioEntries(expEntries);
        }
        flow.advance(6);
        contentEndY = flow.y;
      }

      const highlights = (bio.keyHighlights || []).filter((l) => l?.trim());
      if (highlights.length) {
        await drawSectionHeader("Key Highlights", "star");
        doc.fontSize(10).font("Helvetica").fillColor(COLORS.textDark);
        for (const line of highlights) {
          const bullet = `• ${line.trim()}`;
          const bulletH = doc.heightOfString(bullet, { width: mainW, lineGap: 2 }) + 4;
          if (bulletH > flow.remaining() && flow.remaining() < 12) {
            await flow.ensureSpace(bulletH);
          }
          doc.text(bullet, mainX, flow.y, {
            width: mainW,
            lineGap: 2,
            height: flow.remaining(),
          });
          flow.y = doc.y;
          contentEndY = doc.y;
        }
        flow.advance(6);
        contentEndY = flow.y;
      }

      const place =
        bio.declarationPlace?.trim() || [user.city, user.country].filter(Boolean).join(", ") || "—";
      const declDate =
        bio.declarationDate && !isNaN(new Date(bio.declarationDate as unknown as Date).getTime())
          ? formatDateDE(bio.declarationDate as unknown as Date)
          : formatDateDE(new Date());
      if (hasMain) {
        const signName = bio.signatureName?.trim() || displayName;
        const declText = `${place}, ${declDate}`;
        doc.fontSize(9).font("Helvetica").fillColor(COLORS.textDark);
        const declH = doc.heightOfString(declText, { width: mainW });
        const nameH = doc.heightOfString(signName, { width: mainW });
        const sigGap = 16;
        const sigSpacing = 20;
        const totalSigH = declH + sigGap + nameH;
        const pinY = contentBottom - totalSigH - 8;

        let sigY = contentEndY + sigSpacing;

        if (sigY + totalSigH > contentBottom) {
          await flow.ensureSpace(totalSigH);
          sigY = doc.y + sigSpacing;
        }

        // Pin to bottom only when that is below the last drawn content (avoids overlapping).
        if (pinY > sigY + 12 && pinY + totalSigH <= contentBottom) {
          sigY = pinY;
        }

        flow.y = sigY;

        // Draw as one unit — clip each line so PDFKit cannot split across pages.
        doc.text(declText, mainX, flow.y, {
          width: mainW,
          lineBreak: false,
          height: declH + 4,
        });
        flow.y += declH + sigGap;
        doc.text(signName, mainX, flow.y, {
          width: mainW,
          lineBreak: false,
          height: nameH + 4,
        });
        flow.y += nameH;
      }

      const pageRange = doc.bufferedPageRange();
      const totalPages = pageRange.count;
      for (let i = 0; i < totalPages; i++) {
        doc.switchToPage(pageRange.start + i);
        drawPageFooter(doc, {
          label: footerLabel,
          pageNum: i + 1,
          totalPages,
          margin: M,
          pageHeight: pageH,
          pageWidth: pageW,
        });
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
