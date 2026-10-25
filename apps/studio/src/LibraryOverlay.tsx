import type { ComponentProps } from 'react';
import { LibraryPage } from './LibraryPage.js';

export function LibraryOverlay({
  open,
  ...props
}: ComponentProps<typeof LibraryPage> & { open: boolean }) {
  return open ? <LibraryPage {...props} /> : null;
}
