/**
 * Cutlist optimizer — 2D guillotine bin packing.
 *
 * Given one stock-panel size and a list of required cut parts, returns
 * a packed layout across one or more sheets that minimises waste while
 * respecting **guillotine** constraint (every cut is edge-to-edge,
 * which is what real table saws / panel saws / hand circular saws can
 * actually do).
 *
 * Algorithm: First-Fit-Decreasing-Height (FFDH) with shelves.
 *   1. Expand each part by its quantity → flat list of pieces.
 *   2. Reject pieces that don't fit the stock at all (in any rotation)
 *      — those surface in `unplaced` so the UI can flag them.
 *   3. Sort the rest by max(w, h) descending — biggest first; this
 *      anchors the first shelf at the tallest piece's height and
 *      makes subsequent placements pack tight.
 *   4. For each piece, walk every existing sheet's open shelves; place
 *      it on the first shelf where it fits (with `kerf` between
 *      neighbours). If no shelf fits, open a new shelf below the
 *      last one (with `kerf` between shelves). If the new shelf
 *      doesn't fit on any existing sheet, open a new sheet.
 *   5. Tries both orientations (normal then rotated) per piece — the
 *      first one that fits is taken.
 *
 * All units are millimetres throughout. The UI module is responsible
 * for converting from the user's preferred unit (ft / mm) before
 * calling `optimize`.
 *
 * Pure data — no React, no IO, no globals. Trivially testable.
 */

export type Stock = {
  /** Width of a single stock panel, in mm. */
  width: number;
  /** Height of a single stock panel, in mm. */
  height: number;
  /** Saw blade kerf in mm — added between neighbouring placements. */
  kerf: number;
};

export type Part = {
  /** Stable id used to group placements back to the source part. */
  id: string;
  /** Width of one piece, in mm. */
  w: number;
  /** Height of one piece, in mm. */
  h: number;
  /** Number of identical pieces required. */
  qty: number;
  /** Optional human-readable label rendered on the piece in the diagram. */
  label?: string;
};

export type Placement = {
  /** Top-left x of the placed piece, in mm from the stock's left edge. */
  x: number;
  /** Top-left y of the placed piece, in mm from the stock's top edge. */
  y: number;
  /** Width of the placed piece, in mm (rotated dimension if `rotated`). */
  w: number;
  /** Height of the placed piece, in mm (rotated dimension if `rotated`). */
  h: number;
  /** Label propagated from the source `Part` (or auto-generated). */
  label: string;
  /** Source `Part.id`. */
  partId: string;
  /** True if the piece was rotated 90° to fit. */
  rotated: boolean;
};

export type Sheet = {
  placements: Placement[];
  /** Sum of placement areas (excluding kerf), in mm². */
  usedArea: number;
};

export type CutlistResult = {
  sheets: Sheet[];
  /** Total pieces requested (sum of all part quantities). */
  totalParts: number;
  /** Pieces successfully placed across all sheets. */
  placedParts: number;
  /** Source parts that don't fit on the stock at all (any orientation). */
  unplaced: Part[];
  /** Total area of all sheets used, in mm². */
  totalStockArea: number;
  /** Total area of all placed pieces, in mm². */
  totalUsedArea: number;
  /** Waste percentage (0–100) — `100 * (1 - used/stock)`, rounded to 1dp. */
  wastePct: number;
};

// ── Internal types ──────────────────────────────────────────────────

/** A horizontal "shelf" (band) within a sheet — established by the
 *  first piece placed on it; later pieces sit beside it as long as
 *  the band is tall enough and there's horizontal room. */
type Shelf = {
  /** Top edge of the shelf in mm from the stock's top edge. */
  y: number;
  /** Height of the shelf — equal to the tallest piece on it. */
  height: number;
  /** Next available x on this shelf (incl. kerf after each piece). */
  cursorX: number;
};

type SheetSlot = {
  shelves: Shelf[];
  placements: Placement[];
};

type PendingPiece = {
  partId: string;
  label: string;
  /** Original (un-rotated) width. */
  origW: number;
  /** Original (un-rotated) height. */
  origH: number;
};

// ── Public API ──────────────────────────────────────────────────────

export function optimize(stock: Stock, parts: Part[]): CutlistResult {
  const totalParts = parts.reduce((sum, p) => sum + Math.max(0, Math.floor(p.qty)), 0);

  // ---- 1+2) Expand pieces, filter unfit ----
  const pending: PendingPiece[] = [];
  const unplaced: Part[] = [];

  for (const p of parts) {
    if (p.qty <= 0 || p.w <= 0 || p.h <= 0) continue;

    const fitsNormal = p.w <= stock.width && p.h <= stock.height;
    const fitsRotated = p.h <= stock.width && p.w <= stock.height;

    if (!fitsNormal && !fitsRotated) {
      unplaced.push(p);
      continue;
    }

    const label = (p.label && p.label.trim()) || `Part ${pending.length + 1}`;
    for (let i = 0; i < Math.floor(p.qty); i++) {
      pending.push({
        partId: p.id,
        label,
        origW: p.w,
        origH: p.h,
      });
    }
  }

  // ---- 3) Sort by max dimension descending (FFDH heuristic) ----
  pending.sort(
    (a, b) => Math.max(b.origW, b.origH) - Math.max(a.origW, a.origH),
  );

  // ---- 4+5) Pack ----
  const sheets: SheetSlot[] = [];

  function pushPlacement(
    sheet: SheetSlot,
    shelf: Shelf,
    p: PendingPiece,
    rotated: boolean,
  ): void {
    const w = rotated ? p.origH : p.origW;
    const h = rotated ? p.origW : p.origH;
    // First piece on a shelf starts at x=0; later pieces start one
    // kerf-width past the previous cursor.
    const x = shelf.cursorX === 0 ? 0 : shelf.cursorX + stock.kerf;
    sheet.placements.push({
      x,
      y: shelf.y,
      w,
      h,
      label: p.label,
      partId: p.partId,
      rotated,
    });
    shelf.cursorX = x + w;
  }

  /** Try to place `p` on `sheet`. Returns true on success. */
  function tryPlaceOnSheet(sheet: SheetSlot, p: PendingPiece): boolean {
    // Try existing shelves
    for (const shelf of sheet.shelves) {
      // Normal orientation
      const xN = shelf.cursorX === 0 ? 0 : shelf.cursorX + stock.kerf;
      if (p.origH <= shelf.height && xN + p.origW <= stock.width) {
        pushPlacement(sheet, shelf, p, false);
        return true;
      }
      // Rotated (only if dimensions differ — square pieces don't benefit)
      if (p.origW !== p.origH) {
        const rw = p.origH;
        const rh = p.origW;
        if (rh <= shelf.height && xN + rw <= stock.width) {
          pushPlacement(sheet, shelf, p, true);
          return true;
        }
      }
    }

    // Open a new shelf below the last one
    const last = sheet.shelves[sheet.shelves.length - 1];
    const newY = last ? last.y + last.height + stock.kerf : 0;

    if (newY + p.origH <= stock.height && p.origW <= stock.width) {
      const shelf: Shelf = { y: newY, height: p.origH, cursorX: 0 };
      sheet.shelves.push(shelf);
      pushPlacement(sheet, shelf, p, false);
      return true;
    }
    if (p.origW !== p.origH) {
      const rw = p.origH;
      const rh = p.origW;
      if (newY + rh <= stock.height && rw <= stock.width) {
        const shelf: Shelf = { y: newY, height: rh, cursorX: 0 };
        sheet.shelves.push(shelf);
        pushPlacement(sheet, shelf, p, true);
        return true;
      }
    }
    return false;
  }

  for (const piece of pending) {
    let placed = false;
    for (const sheet of sheets) {
      if (tryPlaceOnSheet(sheet, piece)) {
        placed = true;
        break;
      }
    }
    if (!placed) {
      // Open a fresh sheet and try once more.
      const fresh: SheetSlot = { shelves: [], placements: [] };
      sheets.push(fresh);
      if (!tryPlaceOnSheet(fresh, piece)) {
        // Shouldn't happen if the up-front "fits at all" check passed,
        // but surface it as unplaced rather than crashing.
        sheets.pop();
        unplaced.push({
          id: piece.partId,
          label: piece.label,
          w: piece.origW,
          h: piece.origH,
          qty: 1,
        });
      }
    }
  }

  // ---- Assemble result ----
  const out: Sheet[] = sheets.map((s) => ({
    placements: s.placements,
    usedArea: s.placements.reduce((sum, pl) => sum + pl.w * pl.h, 0),
  }));

  const totalStockArea = out.length * stock.width * stock.height;
  const totalUsedArea = out.reduce((sum, s) => sum + s.usedArea, 0);
  const placedParts = out.reduce((sum, s) => sum + s.placements.length, 0);
  const wastePct =
    totalStockArea > 0
      ? Math.round((1 - totalUsedArea / totalStockArea) * 1000) / 10
      : 0;

  return {
    sheets: out,
    totalParts,
    placedParts,
    unplaced,
    totalStockArea,
    totalUsedArea,
    wastePct,
  };
}
