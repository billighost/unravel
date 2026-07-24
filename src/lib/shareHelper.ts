/**
 * UNRAVEL WEB SHARE API UTILITY
 * 
 * Provides feature detection and invocation for native OS share sheets on supported devices.
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

export async function shareFile(file: File, title: string = 'Unravel Creation'): Promise<boolean> {
  if (!canShareFiles()) return false;

  try {
    await navigator.share({
      title,
      text: 'Check out my tactile 3D creation made with Unravel!',
      files: [file],
    });
    return true;
  } catch (err: any) {
    // AbortError happens when user cancels the share sheet
    if (err.name !== 'AbortError') {
      console.warn('Native share failed:', err);
    }
    return false;
  }
}
