import type { PdfKitDoc } from "./pdfShared";
import { COLORS } from "./pdfShared";

export interface SidebarBlock {
  id: string;
  measure: () => number;
  draw: (sy: number) => number;
}

export interface PdfSidebarRunnerOptions {
  doc: PdfKitDoc;
  x: number;
  width: number;
  pageTop: number;
  contentBottom: number;
  blocks: SidebarBlock[];
  drawBackground?: (x: number, y: number, w: number, h: number) => void;
}

/**
 * Draws sidebar blocks top-to-bottom per page; continues on the next page when they overflow.
 */
export class PdfSidebarRunner {
  private readonly doc: PdfKitDoc;
  private readonly x: number;
  private readonly width: number;
  private readonly pageTop: number;
  private readonly contentBottom: number;
  private readonly blocks: SidebarBlock[];
  private readonly drawBackground: (x: number, y: number, w: number, h: number) => void;

  private nextIndex = 0;

  constructor(opts: PdfSidebarRunnerOptions) {
    this.doc = opts.doc;
    this.x = opts.x;
    this.width = opts.width;
    this.pageTop = opts.pageTop;
    this.contentBottom = opts.contentBottom;
    this.blocks = opts.blocks;
    this.drawBackground =
      opts.drawBackground ??
      ((x, y, w, h) => {
        this.doc.save();
        this.doc.rect(x, y, w, h).fill(COLORS.sidebarGrey);
        this.doc.restore();
      });
  }

  get hasBlocks(): boolean {
    return this.blocks.length > 0;
  }

  get pending(): boolean {
    return this.nextIndex < this.blocks.length;
  }

  /** Draw as many blocks as fit on the current page. */
  drawForCurrentPage(): void {
    this.drawBackground(this.x, this.pageTop, this.width, this.contentBottom - this.pageTop);

    if (!this.pending) return;

    const contactIdx = this.blocks.findIndex((b) => b.id === "contact");
    const contactPending = contactIdx >= 0 && this.nextIndex <= contactIdx;
    const contactBlock = contactIdx >= 0 ? this.blocks[contactIdx] : undefined;
    const contactH =
      contactPending && contactBlock ? contactBlock.measure() : 0;

    let sy = this.pageTop + (this.nextIndex === 0 ? 10 : 12);

    while (this.nextIndex < this.blocks.length) {
      const block = this.blocks[this.nextIndex];
      if (!block) break;
      const isContact = block.id === "contact";
      const blockH = block.measure();

      if (blockH <= 0) {
        this.nextIndex += 1;
        continue;
      }

      if (isContact) {
        if (sy > this.pageTop + 24 && sy + blockH > this.contentBottom + 2) {
          break;
        }
        const contactY = Math.max(sy + 8, this.contentBottom - blockH);
        block.draw(contactY);
        this.nextIndex += 1;
        break;
      }

      const maxY =
        contactPending && this.nextIndex < contactIdx
          ? this.contentBottom - contactH - 8
          : this.contentBottom;

      if (sy + blockH > maxY) {
        break;
      }

      sy = block.draw(sy);
      this.nextIndex += 1;
      sy += block.id === "photo" ? 0 : 8;
    }
  }
}
