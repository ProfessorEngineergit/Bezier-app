/**
 * What is being dragged over the window. During a drag the browser exposes each item's kind and
 * MIME type but not its name, so the extension is unknown until the drop (`use-transfer.ts`). Only
 * types that are certainly not importable (video, audio, PDF, archives) are refused. Images are
 * accepted: they are placed on a plane.
 */

/** Types no import reads. */
const REFUSED = /^(video\/|audio\/|application\/(pdf|zip|x-zip|gzip|x-7z|x-rar))/;

export function carriesFiles(transfer: DataTransfer | null): boolean {
  return transfer?.types.includes('Files') === true;
}

/** True when every file in the drag might be importable. */
export function looksImportable(transfer: DataTransfer | null): boolean {
  if (!carriesFiles(transfer) || transfer === null) return false;
  const items = Array.from(transfer.items).filter((item) => item.kind === 'file');
  // Some webviews do not report item types; let the drop decide. A wrong invitation costs one
  // notice, a wrong refusal makes dragging look broken.
  if (items.length === 0) return true;
  return items.every((item) => !REFUSED.test(item.type));
}
