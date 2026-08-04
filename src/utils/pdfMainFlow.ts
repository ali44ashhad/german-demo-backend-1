import type { PdfKitDoc } from "./pdfShared";

/** A4 size in PDF points (used before the first page exists with autoFirstPage: false). */
export const A4_PAGE_WIDTH = 595.28;
export const A4_PAGE_HEIGHT = 841.89;

/** Vertical space used by drawMainSectionHeader (icon + title). */
export const MAIN_SECTION_HEADER_H = 22;

export type PdfPageSetupFn = (pageIndex: number, isFirstPage: boolean) => void | Promise<void>;

export interface PdfMainFlowOptions {
  doc: PdfKitDoc;
  margin: number;
  footerReserve: number;
  pageHeight: number;
  contentTop?: number;
  continuationTop?: number;
  onNewPage: PdfPageSetupFn;
}

/**
 * Tracks main-column Y and adds pages when content does not fit.
 * Sidebars are redrawn via onNewPage; first page uses isFirstPage=true.
 */
export class PdfMainFlow {
  readonly doc: PdfKitDoc;
  readonly contentBottom: number;
  readonly contentTop: number;
  readonly continuationTop: number;

  private readonly margin: number;
  private readonly pageHeight: number;
  private readonly onNewPage: PdfPageSetupFn;

  private _y: number;
  private _pageIndex = 0;
  private _initialized = false;

  constructor(opts: PdfMainFlowOptions) {
    this.doc = opts.doc;
    this.margin = opts.margin;
    this.pageHeight = opts.pageHeight;
    this.onNewPage = opts.onNewPage;
    this.contentBottom = opts.pageHeight - opts.margin - opts.footerReserve;
    this.contentTop = opts.contentTop ?? opts.margin + 8;
    this.continuationTop = opts.continuationTop ?? opts.margin + 6;
    this._y = this.contentTop;
  }

  get y(): number {
    return this._y;
  }

  set y(value: number) {
    this._y = value;
  }

  get pageIndex(): number {
    return this._pageIndex;
  }

  remaining(): number {
    return Math.max(0, this.contentBottom - this._y);
  }

  fits(needed: number): boolean {
    return this._y + needed <= this.contentBottom;
  }

  advance(delta: number): void {
    this._y += delta;
  }

  /** Adds the first page and runs onNewPage (use with PDFDocument autoFirstPage: false). */
  async beginFirstPage(): Promise<void> {
    if (this._initialized) return;
    this._initialized = true;
    this._pageIndex = 0;
    this._y = this.contentTop;
    this.doc.addPage();
    await this.onNewPage(0, true);
  }

  /**
   * Ensures at least `needed` pt remain on the current page; otherwise adds a page
   * and redraws the sidebar via onNewPage.
   */
  async ensureSpace(needed: number): Promise<void> {
    if (this.fits(needed)) return;

    if (!this._initialized) {
      await this.beginFirstPage();
      if (this.fits(needed)) return;
    }

    this.doc.addPage();
    this._pageIndex += 1;
    this._y = this.continuationTop;
    await this.onNewPage(this._pageIndex, false);

    // Entry taller than one page: caller draws with clipping on this page.
  }
}
