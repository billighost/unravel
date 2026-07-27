/**
 * CLOUDINARY SERVER-SIDE MP4 TRANSCODER UTILITY
 * 
 * Converts a recorded WebM video Blob into a standardized MP4 Blob using Cloudinary server-side transcoding.
 * Light on the client bundle, eliminating ffmpeg.wasm and mp4-muxer client-side encoding.
 */
export async function transcodeWebMToMP4(
  webmBlob: Blob,
  onProgress?: (progress: number) => void
): Promise<Blob> {
  if (typeof window === 'undefined') return webmBlob;

  // Check offline state
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    console.warn('Offline: cannot perform Cloudinary server-side MP4 transcode');
    return webmBlob;
  }

  try {
    if (onProgress) onProgress(0.15);

    // 1. Get upload signature from server API
    const signRes = await fetch('/api/cloudinary/sign');
    if (!signRes.ok) {
      console.warn('Cloudinary signature request failed');
      return webmBlob;
    }

    const signData = await signRes.json();
    if (!signData.enabled) {
      console.warn('Cloudinary is not enabled or configured on the server');
      return webmBlob;
    }

    if (onProgress) onProgress(0.35);

    // 2. Prepare FormData for direct video upload
    const formData = new FormData();
    formData.append('file', webmBlob, `unravel-recording-${Date.now()}.webm`);
    formData.append('api_key', signData.api_key);
    formData.append('timestamp', signData.timestamp.toString());
    formData.append('signature', signData.signature);
    formData.append('folder', signData.folder);

    // 3. Upload WebM to Cloudinary video upload endpoint
    const uploadRes = await fetch(
      `https://api.cloudinary.com/v1_1/${signData.cloud_name}/video/upload`,
      {
        method: 'POST',
        body: formData,
      }
    );

    if (!uploadRes.ok) {
      console.warn('Cloudinary direct video upload failed with status:', uploadRes.status);
      return webmBlob;
    }

    if (onProgress) onProgress(0.65);

    const uploadData = await uploadRes.json();
    const secureUrl = uploadData.secure_url;

    if (!secureUrl) {
      console.warn('Cloudinary video upload response contained no secure_url');
      return webmBlob;
    }

    // 4. Construct Cloudinary transformation URL for MP4 format
    let mp4Url = secureUrl;
    if (secureUrl.includes('/video/upload/')) {
      const parts = secureUrl.split('/video/upload/');
      const pathWithoutExt = parts[1].replace(/\.[^/.]+$/, '');
      mp4Url = `${parts[0]}/video/upload/f_mp4,q_auto,vc_h264:main,ac_aac,fl_faststart/${pathWithoutExt}.mp4`;
    } else {
      mp4Url = secureUrl.replace(/\.[^/.]+$/, '.mp4');
    }

    if (onProgress) onProgress(0.85);

    // 5. Fetch transcoded MP4 blob from Cloudinary
    const mp4Res = await fetch(mp4Url);
    if (!mp4Res.ok) {
      console.warn('Fetch for Cloudinary transcoded MP4 failed:', mp4Res.status);
      return webmBlob;
    }

    const mp4Blob = await mp4Res.blob();
    if (onProgress) onProgress(1.0);

    return new Blob([mp4Blob], { type: 'video/mp4' });
  } catch (err) {
    console.error('Error during Cloudinary server-side MP4 transcode:', err);
    if (onProgress) onProgress(1.0);
    return webmBlob;
  }
}
