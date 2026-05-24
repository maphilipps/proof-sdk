/**
 * adProof Inline-Image-Upload — Helpers + Uploader-Factory
 *
 * Pure Funktionen (DOM-frei, unit-testbar in Node):
 *   isAllowedImageType, buildAssetSrc, classifyUploadError
 *
 * Browser-facing Factory (nicht unit-testbar):
 *   createAssetUploader — Milkdown Uploader für @milkdown/plugin-upload
 *
 * Issue #48 — Slice 5
 */
import type { Node } from '@milkdown/prose/model';
import type { Uploader } from '@milkdown/plugin-upload';

// ---------------------------------------------------------------------------
// MIME-Whitelist
// ---------------------------------------------------------------------------

const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

/**
 * Gibt `true` zurück wenn der MIME-Typ hochgeladen werden darf.
 * SVG ist explizit ausgeschlossen (XSS-Risiko).
 */
export function isAllowedImageType(mimeType: string): boolean {
  return ALLOWED_MIME_TYPES.has(mimeType);
}

// ---------------------------------------------------------------------------
// Asset-Pfad für Markdown-Speicherung
// ---------------------------------------------------------------------------

/**
 * Normalisiert einen Asset-Pfad zur relativen Form `assets/{uuid}.ext`
 * für AC-konforme Markdown-Speicherung (`![](assets/{uuid}.ext)`).
 *
 * Der führende `/` wird entfernt falls vorhanden.
 */
export function buildAssetSrc(path: string): string {
  return path.startsWith('/') ? path.slice(1) : path;
}

// ---------------------------------------------------------------------------
// HTTP-Fehler-Klassifizierung
// ---------------------------------------------------------------------------

export const UploadErrorKind = {
  UnsupportedType: 'UnsupportedType',
  FileTooLarge: 'FileTooLarge',
  Unauthorized: 'Unauthorized',
  Unknown: 'Unknown',
} as const;

export type UploadErrorKind = (typeof UploadErrorKind)[keyof typeof UploadErrorKind];

/**
 * Wandelt einen HTTP-Status-Code in einen typisierten Upload-Fehler um.
 *
 * 415 → UnsupportedType  (MIME nicht erlaubt)
 * 413 → FileTooLarge     (> 10 MB)
 * 401 → Unauthorized     (kein gültiges Token)
 * sonst → Unknown
 */
export function classifyUploadError(httpStatus: number): UploadErrorKind {
  switch (httpStatus) {
    case 415:
      return UploadErrorKind.UnsupportedType;
    case 413:
      return UploadErrorKind.FileTooLarge;
    case 401:
      return UploadErrorKind.Unauthorized;
    default:
      return UploadErrorKind.Unknown;
  }
}

// ---------------------------------------------------------------------------
// Uploader-Factory (Browser-only — uses fetch + FileReader)
// ---------------------------------------------------------------------------

/**
 * Erstellt einen Milkdown-Uploader für @milkdown/plugin-upload.
 *
 * - Filtert nach MIME-Whitelist (PNG/JPEG/WEBP)
 * - Lädt jede Datei via POST /documents/{slug}/assets/upload hoch
 * - Gibt ProseMirror image-Nodes mit relativem `assets/{uuid}.ext` src zurück
 *
 * Bei Fehler (415/413/401): kein Node → keine korrupten Markdown-Einträge.
 *
 * @param slug       - Dokument-Slug für den Upload-Endpoint
 * @param getToken   - Callback der das Bearer-Token zurückgibt
 */
export function createAssetUploader(
  slug: string,
  getToken: () => string,
): Uploader {
  return async (files, schema): Promise<Node[]> => {
    const { image } = schema.nodes;
    if (!image) return [];

    const results: Node[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files.item(i);
      if (!file) continue;
      if (!isAllowedImageType(file.type)) continue;

      try {
        const arrayBuffer = await file.arrayBuffer();
        const res = await fetch(`/documents/${slug}/assets/upload`, {
          method: 'POST',
          headers: {
            'Content-Type': file.type,
            Authorization: `Bearer ${getToken()}`,
          },
          body: arrayBuffer,
        });

        if (!res.ok) {
          const kind = classifyUploadError(res.status);
          console.warn(`[adProof] Upload fehlgeschlagen (${kind}):`, res.status);
          continue;
        }

        const data = (await res.json()) as { success: boolean; path: string };
        if (!data.success || !data.path) continue;

        const src = buildAssetSrc(data.path);
        const node = image.createAndFill({ src, alt: file.name, title: '' });
        if (node) results.push(node as Node);
      } catch (err) {
        console.warn('[adProof] Upload-Netzwerkfehler:', err);
      }
    }

    return results;
  };
}
