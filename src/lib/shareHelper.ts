/**
 * UNRAVEL WEB SHARE API UTILITY
 * 
 * Provides feature detection and invocation for native OS share sheets on supported devices.
 * Always guarantees that the share URL is explicitly included in the `text` field
 * to prevent link dropping on browser engines (e.g. WebKit) that ignore the `url` parameter
 * when file attachments are present.
 */

export function canShareFiles(): boolean {
  if (typeof navigator === 'undefined' || !navigator.share) return false;
  if ('canShare' in navigator) {
    try {
      const dummyFile = new File([''], 'test.png', { type: 'image/png' });
      return navigator.canShare({ files: [dummyFile] });
    } catch (e) {
      return false;
    }
  }
  return true;
}

/**
 * Shares a File (image or video) via the Web Share API.
 * Guarantees the site/challenge URL is present in the `text` field.
 */
export async function shareFile(
  file: File,
  title: string = 'Unravel Creation',
  customUrl?: string,
  customText?: string
): Promise<boolean> {
  if (!canShareFiles()) return false;

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const shareUrl = customUrl || origin || 'https://unravel.app';
  const baseText = customText || 'Made with Unravel — try it:';
  
  // Ensure the link is explicitly present inside the text body so browsers that drop `url` when `files` are attached still include the link!
  const shareText = baseText.includes(shareUrl) ? baseText : `${baseText} ${shareUrl}`;

  try {
    await navigator.share({
      title,
      text: shareText,
      url: shareUrl,
      files: [file],
    });
    return true;
  } catch (err: any) {
    if (err.name !== 'AbortError') {
      console.warn('Native file share failed:', err);
    }
    return false;
  }
}

/**
 * Shares or copies a link with rich readable text formatting.
 * Tries native navigator.share first, then falls back to navigator.clipboard.writeText.
 */
export async function shareOrCopyLink(
  title: string,
  baseMessage: string,
  fullUrl: string
): Promise<{ shared: boolean; copied: boolean }> {
  // Ensure formatted text contains the full URL cleanly
  const shareText = baseMessage.includes(fullUrl) ? baseMessage : `${baseMessage} ${fullUrl}`;

  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({
        title,
        text: shareText,
        url: fullUrl,
      });
      return { shared: true, copied: false };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return { shared: true, copied: false };
      }
      console.warn('Native link share failed, falling back to clipboard copy:', err);
    }
  }

  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(shareText);
      return { shared: false, copied: true };
    } catch (err) {
      console.error('Clipboard write failed:', err);
    }
  }

  return { shared: false, copied: false };
}
