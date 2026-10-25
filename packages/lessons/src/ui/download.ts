/** Downloads a blob as a file. The object URL is revoked after a delay for WebKit. */
export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  window.setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 1000);
}

/** "A box, extruded" → "A-box-extruded.bezierlesson". */
export function packageFilename(title: string): string {
  const name = title
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return `${name || 'lesson'}.bezierlesson`;
}
