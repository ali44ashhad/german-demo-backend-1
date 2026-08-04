import PDFDocument from "pdfkit";
import { IUser } from "../models/User";
import {
  COLORS,
  fetchProfileImageBuffer,
  drawContactBlock,
  drawPageFooter,
  formatDateDE,
  ageFromDateOfBirth,
  sanitizeFooterLabel,
  userHasContactInfo,
  measureContactBlockHeight,
  type PdfKitDoc,
} from "./pdfShared";
import { formatGenderForPdf } from "./bioPeriodDisplay";
import { PdfMainFlow, A4_PAGE_WIDTH, A4_PAGE_HEIGHT } from "./pdfMainFlow";
import { PdfSidebarRunner, type SidebarBlock } from "./pdfSidebarFlow";

const M = 36;
const SIDEBAR_W = 152;
const GUTTER = 14;
const FOOTER_H = 24;

function drawInquiryTitle(doc: PdfKitDoc, mainX: number, mainW: number, y: number): number {
  doc
    .fontSize(14)
    .font("Helvetica-Bold")
    .fillColor(COLORS.accentBlue)
    .text("Student Inquiry Form", mainX, y, { width: mainW, align: "center" });
  return y + 22;
}

function drawCompactNameHeader(
  doc: PdfKitDoc,
  mainX: number,
  mainW: number,
  y: number,
  displayName: string,
  latestDegree: string,
  maxY: number
): number {
  let my = y;
  doc.fontSize(18).font("Helvetica-Bold").fillColor(COLORS.accentBlue).text(displayName, mainX, my, {
    width: mainW,
    height: Math.max(0, maxY - my),
  });
  my += 22;
  doc.fontSize(10).font("Helvetica").fillColor(COLORS.textDark).text(latestDegree, mainX, my, {
    width: mainW,
    height: Math.max(0, maxY - my),
  });
  my += 10;
  doc.fontSize(8).fillColor(COLORS.accentBlue).text("(Latest degree of the student)", mainX, my, {
    width: mainW,
    height: Math.max(0, maxY - my),
  });
  return my + 16;
}

function englishSectionLines(user: IUser): string[] {
  const si = user.studentInquiry || {};
  const et = si.englishTest;
  const lines: string[] = [];
  if (et?.testType) lines.push(`Test: ${et.testType}`);
  if (et?.overall) lines.push(`Overall: ${et.overall}`);
  if (et?.sections) {
    const s = et.sections;
    if (s.listening) lines.push(`Listening: ${s.listening}`);
    if (s.reading) lines.push(`Reading: ${s.reading}`);
    if (s.writing) lines.push(`Writing: ${s.writing}`);
    if (s.speaking) lines.push(`Speaking: ${s.speaking}`);
  }
  if (et?.otherNote?.trim()) lines.push(et.otherNote.trim());
  if (!lines.length && user.englishProficiency?.trim()) lines.push(user.englishProficiency.trim());
  return lines;
}

function hasEducationOverviewRow(
  r: { degree?: string; year?: string; fieldOfStudy?: string; universityOrLocation?: string; percentageOrCgpa?: string }
): boolean {
  return Boolean(
    r.degree?.trim() ||
      r.year?.trim() ||
      r.fieldOfStudy?.trim() ||
      r.universityOrLocation?.trim() ||
      r.percentageOrCgpa?.trim()
  );
}

function buildInquirySidebarBlocks(
  doc: PdfKitDoc,
  user: IUser,
  imgBuf: Buffer | null,
  sidebarLeft: number,
  contentBottom: number
): SidebarBlock[] {
  const blocks: SidebarBlock[] = [];

  if (imgBuf) {
    blocks.push({
      id: "photo",
      measure: () => 82,
      draw: (sy) => {
        try {
          const sz = 72;
          const ix = sidebarLeft + (SIDEBAR_W - sz) / 2;
          doc.image(imgBuf, ix, sy, { width: sz, height: sz, fit: [sz, sz] });
          return sy + sz + 10;
        } catch {
          return sy + 6;
        }
      },
    });
  }

  if (userHasContactInfo(user)) {
    blocks.push({
      id: "contact",
      measure: () => measureContactBlockHeight(doc, user, SIDEBAR_W),
      draw: (sy) => {
        drawContactBlock(doc, user, { x: sidebarLeft, y: sy, width: SIDEBAR_W }, { maxY: contentBottom });
        return sy + measureContactBlockHeight(doc, user, SIDEBAR_W);
      },
    });
  }

  return blocks;
}

function inquiryHasMainContent(user: IUser): boolean {
  const si = user.studentInquiry || {};
  if ((user.name || "").trim()) return true;
  if ((user.fullLegalName || "").trim()) return true;
  if (si.gender || si.sex) return true;
  if (user.dateOfBirth) return true;
  if ((si.familyMembers || []).some((m) => m?.name?.trim() || m?.occupation?.trim())) return true;
  if (si.familyDescription?.trim()) return true;
  if ((si.educationOverview || []).some(hasEducationOverviewRow)) return true;
  if (si.motivationForFurtherStudies?.trim()) return true;
  if ((si.targetCountries || []).some(Boolean)) return true;
  if ((si.targetDegrees || []).some(Boolean)) return true;
  if ((si.targetFieldsOfStudy || []).some(Boolean)) return true;
  if (user.preferredIntake?.trim()) return true;
  if (englishSectionLines(user).length) return true;
  if (si.additionalTestOrCertificate?.trim()) return true;
  if ((si.shortlistedUniversitiesList || []).some(Boolean)) return true;
  if (user.shortlistedUniversities?.trim()) return true;
  if (user.estimatedBudget?.trim()) return true;
  if ((si.inquiryAdditionalServices || []).length) return true;
  if ((user.needHelpWith || []).length) return true;
  if ((si.inquiryComments || []).some(Boolean)) return true;
  return false;
}

export async function generateStudentInquiryPDF(user: IUser): Promise<Buffer> {
  return new Promise(async (resolve, reject) => {
    try {
      const si = user.studentInquiry || {};
      const hasMain = inquiryHasMainContent(user);

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

      const pageH = A4_PAGE_HEIGHT;
      const pageW = A4_PAGE_WIDTH;
      const contentBottom = pageH - M - FOOTER_H;
      const mainX = M + SIDEBAR_W + GUTTER;
      const mainW = pageW - mainX - M;
      const sidebarLeft = M;
      const displayName = (user.name || "Student").trim();
      const footerLabel = `Student Inquiry_${sanitizeFooterLabel(displayName)}`;
      const latestDegree =
        user.biodata?.professionalTitle?.trim() ||
        user.highestQualification?.trim() ||
        user.targetDegreeInGermany?.trim() ||
        "—";

      const imgBuf = await fetchProfileImageBuffer(user.profileImage);
      const blocks = buildInquirySidebarBlocks(doc, user, imgBuf, sidebarLeft, contentBottom);
      const hasSidebar = blocks.length > 0;

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
        blocks,
      });

      const flow = new PdfMainFlow({
        doc,
        margin: M,
        footerReserve: FOOTER_H,
        pageHeight: pageH,
        contentTop: M + 6,
        continuationTop: M + 10,
        onNewPage: () => {
          sidebar.drawForCurrentPage();
        },
      });

      await flow.beginFirstPage();

      const writeMain = async (
        text: string,
        opts?: { fontSize?: number; font?: string; color?: string; indent?: number; lineGap?: number }
      ) => {
        const fontSize = opts?.fontSize ?? 9;
        const font = opts?.font ?? "Helvetica";
        const color = opts?.color ?? COLORS.textDark;
        const x = mainX + (opts?.indent ?? 0);
        const w = mainW - (opts?.indent ?? 0);
        doc.fontSize(fontSize).font(font).fillColor(color);
        const blockH = doc.heightOfString(text, { width: w, lineGap: opts?.lineGap ?? 0 }) + 4;
        await flow.ensureSpace(blockH);
        doc.text(text, x, flow.y, {
          width: w,
          lineGap: opts?.lineGap ?? 0,
          height: flow.remaining(),
        });
        flow.advance(blockH);
      };

      const writeLabelValue = (label: string, value: string) =>
        writeMain(`${label}: ${value || "—"}`);

      const sectionTitle = async (title: string) => {
        await flow.ensureSpace(12);
        doc.fontSize(10).font("Helvetica-Bold").fillColor(COLORS.accentBlue).text(title, mainX, flow.y, {
          width: mainW,
          height: flow.remaining(),
        });
        flow.advance(12);
      };

      if (hasMain) {
        flow.y = drawInquiryTitle(doc, mainX, mainW, flow.y);
        flow.y = drawCompactNameHeader(doc, mainX, mainW, flow.y, displayName, latestDegree, contentBottom);

        await writeLabelValue("Full name", (user.fullLegalName || user.name || "").trim());
        await writeLabelValue("Gender", formatGenderForPdf(si.gender, si.sex));
        const dobStr = formatDateDE(user.dateOfBirth);
        const age = ageFromDateOfBirth(user.dateOfBirth);
        await writeLabelValue(
          "Date of birth",
          age != null ? `${dobStr}; Age = ${age} years` : dobStr
        );
        flow.advance(2);

        const members = (si.familyMembers || []).filter((m) => m && (m.name?.trim() || m.occupation?.trim()));
        const familyDesc = si.familyDescription?.trim();
        if (members.length || familyDesc) {
          await flow.ensureSpace(11);
          doc.fontSize(9).font("Helvetica-Bold").fillColor(COLORS.textDark).text("Family:", mainX, flow.y, {
            width: mainW,
            height: flow.remaining(),
          });
          flow.advance(11);
          doc.font("Helvetica").fontSize(9).fillColor(COLORS.textDark);
          if (members.length) {
            for (const m of members) {
              const line = [m.name?.trim(), m.occupation?.trim()].filter(Boolean).join(" — ") || "—";
              await writeMain(`• ${line}`, { lineGap: 2 });
            }
          } else if (familyDesc) {
            await writeMain(familyDesc, { lineGap: 2 });
          }
          flow.advance(4);
        }

        const rows = (si.educationOverview || []).filter(hasEducationOverviewRow);
        if (rows.length) {
          await sectionTitle("Education overview");
          const colW = [mainW * 0.18, mainW * 0.12, mainW * 0.22, mainW * 0.28, mainW * 0.18];
          const headers = ["Degree", "Year", "Field", "University / Location", "% / CGPA"];

          await flow.ensureSpace(12);
          let cx = mainX;
          doc.fontSize(7).font("Helvetica-Bold");
          headers.forEach((h, i) => {
            doc.text(h, cx, flow.y, { width: (colW[i] ?? 20) - 2, height: flow.remaining() });
            cx += colW[i] ?? 20;
          });
          flow.advance(12);

          doc.font("Helvetica").fontSize(8).fillColor(COLORS.textDark);
          for (const r of rows) {
            const cells = [
              r.degree || "—",
              r.year || "—",
              r.fieldOfStudy || "—",
              r.universityOrLocation || "—",
              r.percentageOrCgpa || "—",
            ];
            const rowH =
              Math.max(...cells.map((c, i) => doc.heightOfString(c, { width: (colW[i] ?? 20) - 2 })), 10) + 3;
            await flow.ensureSpace(rowH);
            cx = mainX;
            cells.forEach((c, i) => {
              doc.text(c, cx, flow.y, {
                width: (colW[i] ?? 20) - 2,
                lineGap: 1,
                height: flow.remaining(),
              });
              cx += colW[i] ?? 20;
            });
            flow.advance(rowH);
          }
          flow.advance(4);
        }

        if (si.motivationForFurtherStudies?.trim()) {
          await sectionTitle("Motivation for further studies");
          await writeMain(si.motivationForFurtherStudies.trim(), { lineGap: 2 });
        }

        const countries = (si.targetCountries || []).slice(0, 3).filter(Boolean);
        const deg = (si.targetDegrees || []).filter(Boolean);
        const fields = (si.targetFieldsOfStudy || []).filter(Boolean);
        const hasFuture =
          countries.length || deg.length || fields.length || user.preferredIntake?.trim();
        if (hasFuture) {
          await sectionTitle("Future study preferences");
          if (countries.length) await writeMain(`Target country: ${countries.join(", ")}`);
          if (deg.length) await writeMain(`Target degree: ${deg.join(", ")}`);
          if (fields.length) await writeMain(`Target field of study: ${fields.join(", ")}`);
          if (user.preferredIntake?.trim()) await writeMain(`Preferred intake: ${user.preferredIntake.trim()}`);
        }

        const engLines = englishSectionLines(user);
        const hasTests =
          engLines.length || si.additionalTestOrCertificate?.trim();
        if (hasTests) {
          await sectionTitle("Test scores & certifications");
          if (engLines.length) {
            await writeMain("English proficiency:");
            for (const ln of engLines) {
              await writeMain(ln, { indent: 8 });
            }
          }
          if (si.additionalTestOrCertificate?.trim()) {
            await writeMain(`Additional test / certificate: ${si.additionalTestOrCertificate.trim()}`);
          }
        }

        const uniList = (si.shortlistedUniversitiesList || []).slice(0, 7).filter(Boolean);
        const uniFallback = user.shortlistedUniversities?.trim();
        if (uniList.length || uniFallback) {
          await writeMain(
            `Shortlisted universities: ${uniList.length ? uniList.join("; ") : uniFallback}`
          );
        }

        if (user.estimatedBudget?.trim()) {
          flow.advance(6);
          const budgetText = `Budget: ${user.estimatedBudget.trim()}`;
          doc.fontSize(10).font("Helvetica-Bold");
          const budgetH = doc.heightOfString(budgetText, { width: mainW }) + 4;
          await flow.ensureSpace(budgetH);
          doc.fillColor(COLORS.textDark).text(budgetText, mainX, flow.y, {
            width: mainW,
            height: flow.remaining(),
          });
          flow.advance(budgetH + 12);
        }

        const svcSet = new Set(si.inquiryAdditionalServices || []);
        const legacy = user.needHelpWith || [];
        const tick = (on: boolean) => (on ? "[x]" : "[ ]");
        const hasServices =
          svcSet.size > 0 ||
          legacy.includes("SOP") ||
          legacy.includes("LOR") ||
          legacy.some((x) => /English|IELTS/i.test(x));
        if (hasServices) {
          await sectionTitle("Additional services");
          doc.font("Helvetica").fontSize(9).fillColor(COLORS.textDark);
          await writeMain(`${tick(svcSet.has("SOP") || legacy.includes("SOP"))} Statement of Purpose (SOP)`);
          await writeMain(`${tick(svcSet.has("LOR") || legacy.includes("LOR"))} Letter of Recommendation (LOR)`);
          await writeMain(
            `${tick(svcSet.has("EnglishLanguageTraining") || legacy.some((x) => /English|IELTS/i.test(x)))} English Language Training (e.g. IELTS)`
          );
        }

        const comments = si.inquiryComments?.filter(Boolean) || [];
        if (comments.length) {
          await sectionTitle("Comments");
          for (const c of comments) {
            await writeMain(`• ${c}`, { lineGap: 2 });
          }
        }
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
    } catch (e) {
      reject(e);
    }
  });
}
