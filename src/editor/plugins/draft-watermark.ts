/**
 * DRAFT-Wasserzeichen — pure toggle helper + DOM applier
 *
 * Zeigt im Editor einen Banner "Arbeitskopie — Submission-Stand siehe exports/"
 * wenn das Dokument NICHT in einem Submission-Zustand ist.
 *
 * Share-mode: Watermark ist sichtbar für alle Rollen (viewer, commenter, editor)
 * solange kein Submission-Flag gesetzt ist.
 *
 * TODO: `isSubmission` an einen echten Submission-State binden sobald das
 * Datenmodell `submitted_at` o.Ä. einführt. MVP: hardcoded false (immer Watermark).
 *
 * Pure helper — testbar ohne DOM (symmetrisch zu shouldShowAffordances in adproof-plugins.ts).
 */

/**
 * Returns `true` when the DRAFT watermark should be visible, `false` when hidden.
 *
 * @param isSubmission - `true` when the document has been officially submitted
 *   (hides the watermark). `false` for all draft states (shows the watermark).
 */
export function shouldShowDraftWatermark(isSubmission: boolean): boolean {
  return !isSubmission;
}

/**
 * Applies the draft watermark visibility to the given DOM element.
 * Pass `isSubmission: false` to always show (MVP default).
 *
 * @param el - The `.milkdown-draft-watermark` element from index.html
 * @param isSubmission - Whether the document is in submission state
 */
export function applyDraftWatermark(el: HTMLElement, isSubmission: boolean): void {
  if (shouldShowDraftWatermark(isSubmission)) {
    el.removeAttribute('hidden');
  } else {
    el.setAttribute('hidden', '');
  }
}
