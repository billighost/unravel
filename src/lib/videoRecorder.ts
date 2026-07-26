/**
 * UNRAVEL CANVAS VIDEO RECORDER UTILITY
 * 
 * Captures live WebGL canvas animation streams using MediaRecorder API.
 * Optimized for performance: 30fps stream cap, un-timesliced batch encoding to avoid main thread hangs,
 * native MP4 support where available, and Cloudinary server-side MP4 transcoding fallback.
 */

export type VideoFormat = 'webm' | 'mp4';

export class VideoRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private recording: boolean = false;
  private targetFormat: VideoFormat = 'webm';
  private nativeMp4Supported: boolean = false;

  constructor() {
    if (typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined') {
      this.nativeMp4Supported =
        MediaRecorder.isTypeSupported('video/mp4;codecs=h264') ||
        MediaRecorder.isTypeSupported('video/mp4;codecs=avc1') ||
        MediaRecorder.isTypeSupported('video/mp4');
    }
  }

  /**
   * Checks if the browser natively supports MP4 recording without transcoding.
   */
  public isNativeMp4Supported(): boolean {
    return this.nativeMp4Supported;
  }

  /**
   * Starts recording the specified HTMLCanvasElement at 30 fps.
   */
  public start(canvas: HTMLCanvasElement, format: VideoFormat = 'webm'): boolean {
    if (typeof window === 'undefined' || !canvas) return false;

    try {
      this.recordedChunks = [];
      this.targetFormat = format;

      // Explicitly cap stream frame rate at 30 fps to reduce GPU readback pressure
      const stream = (canvas as any).captureStream ? (canvas as any).captureStream(30) : null;
      if (!stream) {
        console.warn('canvas.captureStream is not supported in this browser environment');
        return false;
      }

      let selectedMime = '';

      if (format === 'mp4' && this.nativeMp4Supported) {
        const mp4Types = [
          'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
          'video/mp4;codecs=h264',
          'video/mp4;codecs=avc1',
          'video/mp4',
        ];
        selectedMime = mp4Types.find((type) => MediaRecorder.isTypeSupported(type)) || 'video/mp4';
      } else {
        const webmTypes = [
          'video/webm;codecs=vp9',
          'video/webm;codecs=vp8',
          'video/webm',
        ];
        selectedMime = webmTypes.find((type) => MediaRecorder.isTypeSupported(type)) || 'video/webm';
      }

      this.mediaRecorder = new MediaRecorder(stream, selectedMime ? { mimeType: selectedMime } : undefined);

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          this.recordedChunks.push(e.data);
        }
      };

      // Start WITHOUT timeslice parameter: lets the browser batch efficiently
      // and flush data only when stop() is called, preventing main thread event flooding!
      this.mediaRecorder.start();
      this.recording = true;
      return true;
    } catch (err) {
      console.error('Failed to start video recording:', err);
      this.recording = false;
      return false;
    }
  }

  /**
   * Stops recording and resolves with the generated video Blob.
   * If MP4 was requested on a browser without native support, performs Cloudinary server-side transcode.
   */
  public stop(onProgress?: (progress: number) => void): Promise<{ blob: Blob | null; format: VideoFormat; isNative: boolean }> {
    return new Promise((resolve) => {
      if (!this.mediaRecorder || !this.recording) {
        this.recording = false;
        resolve({ blob: null, format: this.targetFormat, isNative: this.nativeMp4Supported });
        return;
      }

      const requestedFormat = this.targetFormat;
      const isNative = requestedFormat === 'mp4' ? this.nativeMp4Supported : true;

      this.mediaRecorder.onstop = async () => {
        this.recording = false;
        const mimeType = this.mediaRecorder?.mimeType || (requestedFormat === 'mp4' && this.nativeMp4Supported ? 'video/mp4' : 'video/webm');
        let blob = new Blob(this.recordedChunks, { type: mimeType });
        this.mediaRecorder = null;

        // Handle MP4 server-side transcode via Cloudinary if requested but not natively supported
        if (requestedFormat === 'mp4' && !this.nativeMp4Supported) {
          try {
            const { transcodeWebMToMP4 } = await import('./transcoder');
            blob = await transcodeWebMToMP4(blob, onProgress);
            const actualFormat = blob.type === 'video/mp4' ? 'mp4' : 'webm';
            resolve({ blob, format: actualFormat, isNative: false });
            return;
          } catch (err) {
            console.error('Cloudinary server-side MP4 transcode failed, falling back to WebM:', err);
            resolve({ blob, format: 'webm', isNative: false });
            return;
          }
        }

        resolve({ blob, format: requestedFormat, isNative });
      };

      try {
        this.mediaRecorder.stop();
      } catch (err) {
        console.error('Error stopping MediaRecorder:', err);
        this.recording = false;
        resolve({ blob: null, format: requestedFormat, isNative });
      }
    });
  }

  public isRecording(): boolean {
    return this.recording;
  }
}

export const videoRecorder = new VideoRecorder();
