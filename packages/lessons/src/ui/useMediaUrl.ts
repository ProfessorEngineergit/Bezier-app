import { useEffect, useState } from 'react';

/**
 * An object URL for a blob, created in the effect (StrictMode replays cleanup) and revoked a second
 * later: WebKit may still read a media URL after React removes the video, and revoking it in the
 * same commit causes a failed resource load.
 */
export function useMediaUrl(blob: Blob | undefined): string {
  const [media, setMedia] = useState<{ blob: Blob; url: string } | null>(null);

  useEffect(() => {
    if (blob === undefined) return;
    const url = URL.createObjectURL(blob);
    setMedia({ blob, url });
    return () => {
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
  }, [blob]);

  return media !== null && media.blob === blob ? media.url : '';
}
