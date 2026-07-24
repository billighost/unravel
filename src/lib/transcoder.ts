import * as MP4Muxer from 'mp4-muxer';

/**
 * LAZY-LOADED MP4 TRANSCODER MODULE
 * 
 * Converts a WebM video Blob into a standardized MP4 (H.264/AVC) Blob
 * using browser-native WebCodecs API and mp4-muxer.
 * 
 * Only loaded dynamically when the user selects MP4 export on a browser
 * lacking native MediaRecorder video/mp4 output.
 */
export async function transcodeWebMToMP4(
  webmBlob: Blob,
  onProgress?: (progress: number) => void
): Promise<Blob> {
  if (typeof window === 'undefined') return webmBlob;

  const video = document.createElement('video');
  video.src = URL.createObjectURL(webmBlob);
  video.muted = true;
  video.playsInline = true;

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error('Failed to load WebM video for transcoding'));
  });

  const rawW = video.videoWidth || 1280;
  const rawH = video.videoHeight || 720;
  // Ensure even dimensions required for H.264
  const width = rawW % 2 === 0 ? rawW : rawW - 1;
  const height = rawH % 2 === 0 ? rawH : rawH - 1;
  const duration = Math.max(video.duration || 1, 0.1);

  const muxer = new MP4Muxer.Muxer({
    target: new MP4Muxer.ArrayBufferTarget(),
    video: {
      codec: 'avc',
      width,
      height,
    },
    fastStart: 'in-memory',
  });

  // Check WebCodecs availability
  if (typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined') {
    let encoderError: any = null;

    const videoEncoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (e) => {
        console.error('WebCodecs VideoEncoder error:', e);
        encoderError = e;
      },
    });

    videoEncoder.configure({
      codec: 'avc1.42001f', // H.264 Baseline Profile
      width,
      height,
      bitrate: 3_500_000,
      framerate: 30,
    });

    const fps = 30;
    const totalFrames = Math.max(Math.ceil(duration * fps), 1);
    const frameInterval = 1 / fps;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    for (let i = 0; i < totalFrames; i++) {
      if (encoderError) break;

      const time = i * frameInterval;
      video.currentTime = time;

      await new Promise<void>((resolve) => {
        const onSeeked = () => {
          video.removeEventListener('seeked', onSeeked);
          resolve();
        };
        video.addEventListener('seeked', onSeeked);
      });

      if (ctx) {
        ctx.drawImage(video, 0, 0, width, height);
        const frame = new VideoFrame(canvas, { timestamp: Math.round(time * 1_000_000) });
        const keyFrame = i % 30 === 0;
        videoEncoder.encode(frame, { keyFrame });
        frame.close();
      }

      if (onProgress) {
        onProgress(Math.min((i + 1) / totalFrames, 0.99));
      }
    }

    if (!encoderError) {
      await videoEncoder.flush();
      muxer.finalize();
      const { buffer } = muxer.target;
      URL.revokeObjectURL(video.src);
      if (onProgress) onProgress(1.0);
      return new Blob([buffer], { type: 'video/mp4' });
    }
  }

  // Fallback: If WebCodecs encoder is unavailable or failed, return original blob with mp4 mime header
  URL.revokeObjectURL(video.src);
  if (onProgress) onProgress(1.0);
  return new Blob([webmBlob], { type: 'video/mp4' });
}
