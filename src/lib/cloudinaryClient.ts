/**
 * CLIENT-SIDE CLOUDINARY UPLOAD UTILITY
 * 
 * Performs direct client-to-Cloudinary upload using signatures from the server.
 * Falls back to returning the base64 URL if Cloudinary is not configured or fails.
 */

export async function uploadDirectToCloudinary(base64DataUrl: string): Promise<string> {
  if (!base64DataUrl || !base64DataUrl.startsWith('data:image')) {
    return base64DataUrl;
  }

  try {
    const signRes = await fetch('/api/cloudinary/sign');
    if (!signRes.ok) return base64DataUrl;

    const signData = await signRes.json();
    if (!signData.enabled) {
      return base64DataUrl;
    }

    const formData = new FormData();
    formData.append('file', base64DataUrl);
    formData.append('api_key', signData.api_key);
    formData.append('timestamp', signData.timestamp.toString());
    formData.append('signature', signData.signature);
    formData.append('folder', signData.folder);

    const uploadRes = await fetch(
      `https://api.cloudinary.com/v1_1/${signData.cloud_name}/image/upload`,
      {
        method: 'POST',
        body: formData,
      }
    );

    if (!uploadRes.ok) {
      console.warn('Direct Cloudinary upload response not ok, using base64 fallback');
      return base64DataUrl;
    }

    const uploadData = await uploadRes.json();
    return uploadData.secure_url || base64DataUrl;
  } catch (err) {
    console.error('Error during direct Cloudinary upload:', err);
    return base64DataUrl;
  }
}

/**
 * Optimizes a Cloudinary image URL on-the-fly by inserting transformation parameters.
 * Retains any existing version / public ID segments.
 */
export function getOptimizedCloudinaryUrl(url: string, width: number, height: number): string {
  if (
    !url ||
    typeof url !== 'string' ||
    !url.startsWith('https://res.cloudinary.com/') ||
    !url.includes('/image/upload/')
  ) {
    return url;
  }
  try {
    const parts = url.split('/image/upload/');
    if (parts.length === 2) {
      const path = parts[1];
      const versionMatch = path.match(/(^|\/)v\d+\//);
      if (versionMatch) {
        const matchStr = versionMatch[0];
        const index = path.indexOf(matchStr);
        const isLeadingSlash = matchStr.startsWith('/');
        const keepIndex = index + (isLeadingSlash ? 1 : 0);
        const rest = path.substring(keepIndex);
        return `${parts[0]}/image/upload/c_fill,w_${width},h_${height},f_auto,q_auto/${rest}`;
      } else {
        return `${parts[0]}/image/upload/c_fill,w_${width},h_${height},f_auto,q_auto/${parts[1]}`;
      }
    }
  } catch (e) {
    console.error('Failed to optimize Cloudinary URL:', e);
  }
  return url;
}

