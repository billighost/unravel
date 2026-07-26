'use client';

import React, { useRef, useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { AnimatePresence, motion } from 'framer-motion';
import { RotateCcw, Download, Plus, Images, Square, Sparkles, Check } from 'lucide-react';
import { qualityTierManager } from '@/lib/qualityTier';
import { BrandLoader } from '@/components/ui/BrandLoader';
import { showToast } from '@/components/ui/Toast';
import { useAppStore } from '@/store/useAppStore';
import { Wordmark } from '@/components/ui/Wordmark';
import { Button } from '@/components/ui/Button';
import { AppMenu } from '@/components/ui/AppMenu';
import { ExportModal } from '@/components/ui/ExportModal';
import { ResumeModal } from '@/components/ui/ResumeModal';
import { GalleryModal } from '@/components/ui/GalleryModal';
import { AccessibilityAnnouncer, announceToScreenReader } from '@/components/ui/AccessibilityAnnouncer';
import { FirstTouchHint } from '@/components/ui/FirstTouchHint';
import { ModeSelect } from '@/components/modes/ModeSelect';
import { UploadMode } from '@/components/modes/UploadMode';
import { DrawMode } from '@/components/modes/DrawMode';
import { TypeMode } from '@/components/modes/TypeMode';

import { sampleImageToGrid } from '@/lib/imageSampler';
import { soundEngine } from '@/lib/audio/soundEngine';
import { videoRecorder, VideoFormat } from '@/lib/videoRecorder';
import { shareFile } from '@/lib/shareHelper';
import { getLastCreation, clearLastCreation, toSampledGridResult, SavedCreation, SavedGridData } from '@/lib/storage';
import { getDeviceId } from '@/lib/deviceId';
import { t } from '@/lib/i18n/strings';

const CubeCanvas = dynamic(
  () => import('@/components/canvas/CubeCanvas').then((mod) => mod.CubeCanvas),
  { ssr: false }
);

export default function Home() {
  const mode = useAppStore((state) => state.mode);
  const isDisturbed = useAppStore((state) => state.isDisturbed);
  const setMode = useAppStore((state) => state.setMode);
  const setGridData = useAppStore((state) => state.setGridData);
  const resetToDemo = useAppStore((state) => state.resetToDemo);

  const exportFnRef = useRef<((options?: { transparent?: boolean }) => void) | null>(null);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);

  // Auto-resume state
  const [isResumeOpen, setIsResumeOpen] = useState(false);
  const [savedCreation, setSavedCreation] = useState<SavedCreation | null>(null);

  // Video recording & transcoding progress state
  const [isRecording, setIsRecording] = useState(false);
  const [transcodeProgress, setTranscodeProgress] = useState<number | null>(null);
  const [transcodeSuccess, setTranscodeSuccess] = useState(false);

  // Global Image Paste / Drag-and-Drop state
  const [isProcessingDroppedImage, setIsProcessingDroppedImage] = useState(false);

  // Disperse Cooldown state
  const [isDisperseCooling, setIsDisperseCooling] = useState(false);
  const disperseTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Global Image Paste & Drag-and-Drop Anywhere Handlers (Desktop)
  const processImageFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      showToast("That doesn't look like an image — try a photo or drawing", 'error');
      return;
    }
    try {
      setIsProcessingDroppedImage(true);
      soundEngine.playUIClick();
      const tierMax = qualityTierManager.getConfig().gridResolutionMax;
      const sampled = await sampleImageToGrid(file, tierMax);
      setGridData(sampled, 'upload');
      announceToScreenReader('Image turned into 3D cubes');
    } catch (err) {
      console.error('Image sampling failed on paste/drop:', err);
      showToast("Couldn't read that image — try a different one", 'error');
    } finally {
      setIsProcessingDroppedImage(false);
    }
  };

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            processImageFile(file);
            break;
          }
        }
      }
    };

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
    };

    const handleDrop = (e: DragEvent) => {
      const files = e.dataTransfer?.files;
      if (!files || files.length === 0) return;
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.type.startsWith('image/')) {
          e.preventDefault();
          processImageFile(file);
          break;
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('paste', handlePaste);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, []);

  // Check for saved creation on app startup
  useEffect(() => {
    async function checkSaved() {
      const saved = await getLastCreation();
      if (saved && saved.gridData) {
        setSavedCreation(saved);
        setIsResumeOpen(true);
      }
    }
    checkSaved();
  }, []);

  const handleResumeContinue = () => {
    if (savedCreation && savedCreation.gridData) {
      setGridData(toSampledGridResult(savedCreation.gridData), savedCreation.mode);
      announceToScreenReader('Restored your saved creation');
    }
    setIsResumeOpen(false);
  };

  const handleResumeStartFresh = async () => {
    await clearLastCreation();
    setIsResumeOpen(false);
  };

  const handleExecuteExport = (options: { transparent: boolean }) => {
    if (exportFnRef.current) {
      exportFnRef.current(options);
      announceToScreenReader('Artwork PNG saved to downloads');
    }
  };

  const handleStartVideoRecording = (format: VideoFormat = 'webm') => {
    const canvas = document.querySelector('canvas') as HTMLCanvasElement;
    if (!canvas) return;

    window.dispatchEvent(new CustomEvent('unravel-recording-start'));
    const started = videoRecorder.start(canvas, format);
    if (started) {
      setIsRecording(true);
      announceToScreenReader(`Video recording started. Disturb picture and revert to finish`);
    } else {
      showToast("Video recording isn't supported on this browser", 'error');
    }
  };

  const handleStopVideoRecording = async () => {
    if (!isRecording) return;
    
    window.dispatchEvent(new CustomEvent('unravel-recording-stop'));
    setIsRecording(false);
    setTranscodeProgress(0.05);

    const { blob, format, isNative } = await videoRecorder.stop((progress) => {
      setTranscodeProgress(progress);
    });

    if (blob) {
      const ext = format === 'mp4' ? 'mp4' : 'webm';

      if (format !== 'mp4' && !isNative) {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          showToast("Offline mode: MP4 conversion requires internet connection. Saved as WebM.", 'info');
        } else {
          showToast("Server transcode unavailable. Saved as WebM instead.", 'info');
        }
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = `unravel-moment-${Date.now()}.${ext}`;
      link.href = url;
      link.click();
      announceToScreenReader(`Video recording saved as ${ext.toUpperCase()} to downloads`);

      // Briefly display a success confirmation overlay
      setTranscodeSuccess(true);
      await new Promise((resolve) => setTimeout(resolve, 1500));
      setTranscodeSuccess(false);
    }

    setTranscodeProgress(null);
  };

  const handleShareNative = async () => {
    const canvas = document.querySelector('canvas') as HTMLCanvasElement;
    if (!canvas) return;

    try {
      const dataUrl = canvas.toDataURL('image/png');
      const arr = dataUrl.split(',');
      const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png';
      const bstr = atob(arr[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      const file = new File([u8arr], `unravel-art-${Date.now()}.png`, { type: mime });
      
      const origin = typeof window !== 'undefined' ? window.location.origin : 'https://unravel.app';
      const shared = await shareFile(file, 'My Unravel Creation', origin, 'Made with Unravel — try it:');
      if (shared) {
        announceToScreenReader('Artwork shared successfully');
      }
    } catch (err) {
      console.error('Failed to share artwork:', err);
      showToast("Couldn't share artwork — try again", 'error');
    }
  };

  // Listen for revert completion to automatically finalize video recording
  useEffect(() => {
    const handleRevertFinished = async () => {
      if (videoRecorder.isRecording()) {
        await handleStopVideoRecording();
      }
    };

    window.addEventListener('unravel-revert-complete', handleRevertFinished);
    return () => {
      window.removeEventListener('unravel-revert-complete', handleRevertFinished);
    };
  }, [isRecording]);

  const handleRevert = () => {
    soundEngine.playUIClick();
    const windowWithPhysics = window as any;
    if (windowWithPhysics.__unravelPhysics) {
      windowWithPhysics.__unravelPhysics.triggerRevert();
    } else {
      window.dispatchEvent(new CustomEvent('unravel-trigger-revert'));
    }
  };

  const handleDisperse = () => {
    if (isDisperseCooling) return;

    setIsDisperseCooling(true);
    soundEngine.playUIClick();
    const windowWithPhysics = window as any;
    if (windowWithPhysics.__unravelPhysics) {
      windowWithPhysics.__unravelPhysics.triggerDisperse();
    } else {
      window.dispatchEvent(new CustomEvent('unravel-trigger-disperse'));
    }
    announceToScreenReader('Dispersed picture cubes outward');

    if (disperseTimerRef.current) clearTimeout(disperseTimerRef.current);
    disperseTimerRef.current = setTimeout(() => {
      setIsDisperseCooling(false);
    }, 750);
  };

  useEffect(() => {
    return () => {
      if (disperseTimerRef.current) clearTimeout(disperseTimerRef.current);
    };
  }, []);

  // Mobile "Shake to reset" detection via DeviceMotionEvent
  useEffect(() => {
    let lastX = 0;
    let lastY = 0;
    let lastZ = 0;
    let lastCheck = 0;

    const handleMotion = (e: DeviceMotionEvent) => {
      const acc = e.accelerationIncludingGravity;
      if (!acc) return;
      const now = performance.now();
      if (now - lastCheck < 100) return;
      lastCheck = now;

      const deltaX = Math.abs((acc.x || 0) - lastX);
      const deltaY = Math.abs((acc.y || 0) - lastY);
      const deltaZ = Math.abs((acc.z || 0) - lastZ);

      lastX = acc.x || 0;
      lastY = acc.y || 0;
      lastZ = acc.z || 0;

      if (deltaX + deltaY + deltaZ > 28) {
        handleRevert();
      }
    };

    const setupMotionListener = async () => {
      if (typeof window !== 'undefined' && 'DeviceMotionEvent' in window) {
        const DME = DeviceMotionEvent as any;
        if (typeof DME.requestPermission === 'function') {
          const handleFirstGesture = async () => {
            try {
              const res = await DME.requestPermission();
              if (res === 'granted') {
                window.addEventListener('devicemotion', handleMotion);
              }
            } catch (err) {}
            window.removeEventListener('pointerdown', handleFirstGesture);
          };
          window.addEventListener('pointerdown', handleFirstGesture);
        } else {
          window.addEventListener('devicemotion', handleMotion);
        }
      }
    };

    setupMotionListener();

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('devicemotion', handleMotion);
      }
    };
  }, []);

  return (
    <main style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden' }}>
      {/* Screen Reader Accessibility Announcer */}
      <AccessibilityAnnouncer />

      {/* 3D Cube WebGL Field (Always rendered in background) */}
      <CubeCanvas
        onExportReady={(exportFn) => {
          exportFnRef.current = exportFn;
        }}
      />

      {/* Image Paste / Drag-and-Drop Loader Overlay */}
      {isProcessingDroppedImage && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 120,
            backgroundColor: 'rgba(247, 246, 242, 0.95)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1rem',
          }}
        >
          <BrandLoader size={48} />
          <p className="font-heading" style={{ fontSize: '1rem', color: 'var(--ink)' }}>
            PIXELATING IMAGE...
          </p>
        </div>
      )}

      {/* MP4 Transcode Overlay Modal */}
      {(transcodeProgress !== null || transcodeSuccess) && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 110,
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--surface)',
              border: '4px solid var(--ink)',
              boxShadow: '8px 8px 0 var(--ink)',
              padding: '2rem 2.5rem',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '1rem',
              textAlign: 'center',
              maxWidth: '360px',
            }}
          >
            {transcodeSuccess ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#34C759', border: '3px solid var(--ink)', borderRadius: '50%', padding: '0.5rem', color: '#FFFFFF' }}>
                  <Check size={28} />
                </div>
                <h3 className="font-heading" style={{ fontSize: '1rem', color: 'var(--ink)' }}>
                  VIDEO SAVED!
                </h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Your recording has been saved to downloads.
                </p>
              </>
            ) : (
              <>
                <BrandLoader size={44} />
                <h3 className="font-heading" style={{ fontSize: '1rem', color: 'var(--ink)' }}>
                  CONVERTING TO MP4...
                </h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Uploading & transcoding video via Cloudinary. Please wait...
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {/* Recording Pulsing Bar Overlay */}
      {isRecording && (
        <div
          data-ui-obstacle="true"
          style={{
            position: 'fixed',
            top: '1.5rem',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 90,
            backgroundColor: 'var(--surface)',
            border: '3px solid var(--ink)',
            boxShadow: '4px 4px 0 var(--ink)',
            padding: '0.6rem 1.2rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.85rem',
          }}
        >
          <div
            style={{
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              backgroundColor: '#FF3B30',
              animation: 'pulse 1s infinite alternate',
            }}
          />
          <span className="font-heading" style={{ fontSize: '0.8rem', color: 'var(--ink)' }}>
            {t('RECORDING_BAR')}
          </span>
          <button
            onClick={handleStopVideoRecording}
            aria-label="Stop Video Recording"
            style={{
              backgroundColor: 'var(--ink)',
              color: '#FFFFFF',
              border: 'none',
              padding: '0.25rem 0.6rem',
              fontFamily: 'var(--font-heading)',
              fontSize: '0.7rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.3rem',
            }}
          >
            <Square size={10} fill="#FFF" /> {t('STOP')}
          </button>
        </div>
      )}

      {/* First Touch Nudge Hint on Landing Screen */}
      {mode === 'landing' && <FirstTouchHint />}

      {/* Landing / Hero Overlay */}
      <AnimatePresence>
        {mode === 'landing' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed',
              inset: 0,
              pointerEvents: 'none',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              padding: '2.5rem',
              zIndex: 5,
            }}
          >
            {/* Top Bar: Wordmark + AppMenu */}
            <div style={{ pointerEvents: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <Wordmark size="lg" />
              <AppMenu
                onOpenGallery={() => setIsGalleryOpen(true)}
                showNewOption={false}
              />
            </div>

            {/* Bottom Bar: Today's Picture Daily Challenge + Start Button */}
            <div
              style={{
                pointerEvents: 'auto',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '1rem',
                marginBottom: '1rem',
                width: '100%',
              }}
            >
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'center', width: '100%', maxWidth: '400px' }}>
                <a href="/api/daily-challenge-redirect" onClick={async (e) => {
                  e.preventDefault();
                  soundEngine.playUIClick();
                  try {
                    const deviceId = getDeviceId();
                    const res = await fetch('/api/daily-challenge', { headers: { 'x-device-id': deviceId } });
                    const data = await res.json();
                    if (data.challenge && data.challenge.id) {
                      window.location.href = `/challenge/${data.challenge.id}`;
                    } else {
                      showToast("No daily picture available right now — try again later", 'info');
                      setMode('select');
                    }
                  } catch (_) {
                    showToast("Couldn't load today's picture — check your connection", 'error');
                    setMode('select');
                  }
                }} style={{ textDecoration: 'none', display: 'inline-flex', flex: '1 1 120px' }}>
                  <Button variant="secondary" style={{ fontSize: '0.85rem', padding: '0.85rem 1.25rem', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                    <Sparkles size={16} color="var(--accent)" /> <span>TODAY'S PICTURE</span>
                  </Button>
                </a>

                <Button
                  variant="primary"
                  onClick={() => setMode('select')}
                  style={{ fontSize: '0.9rem', padding: '0.85rem 1.75rem', flex: '1 1 100px' }}
                >
                  {t('START')}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Canvas Controls Overlay ('canvas' mode) */}
      <AnimatePresence>
        {mode === 'canvas' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed',
              inset: 0,
              pointerEvents: 'none',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              padding: '1.5rem',
              zIndex: 5,
            }}
          >
            {/* Top Bar: Wordmark + AppMenu */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                pointerEvents: 'auto',
              }}
            >
              <Wordmark size="md" onClick={resetToDemo} />

              <AppMenu
                onOpenGallery={() => setIsGalleryOpen(true)}
                onNewCreation={() => setMode('select')}
                showNewOption={true}
              />
            </div>

            {/* Bottom Floating Bar: Revert (when disturbed), Disperse (always), Save (always) */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '1rem',
                width: '100%',
                pointerEvents: 'auto',
                flexWrap: 'nowrap',
              }}
            >
              {isDisturbed && (
                <motion.div
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  <Button
                    variant="primary"
                    onClick={handleRevert}
                    aria-label="Revert cubes"
                    style={{ fontSize: '0.9rem', padding: '0.85rem 1.5rem' }}
                  >
                    <RotateCcw size={18} />
                    <span className="btn-text-responsive" style={{ marginLeft: '0.25rem' }}>{t('REVERT')}</span>
                  </Button>
                </motion.div>
              )}

              <Button
                variant="secondary"
                onClick={handleDisperse}
                disabled={isDisperseCooling}
                aria-label="Disperse cubes"
                style={{
                  fontSize: '0.9rem',
                  padding: '0.85rem 1.5rem',
                  opacity: isDisperseCooling ? 0.5 : 1,
                  cursor: isDisperseCooling ? 'not-allowed' : 'pointer',
                  transition: 'opacity 0.2s ease',
                }}
              >
                <Sparkles size={18} />
                <span className="btn-text-responsive" style={{ marginLeft: '0.25rem' }}>{t('DISPERSE')}</span>
              </Button>

              <Button
                variant="secondary"
                onClick={() => setIsExportOpen(true)}
                aria-label="Save or export creation"
                style={{ fontSize: '0.9rem', padding: '0.85rem 1.5rem' }}
              >
                <Download size={18} />
                <span className="btn-text-responsive" style={{ marginLeft: '0.25rem' }}>{t('SAVE')}</span>
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Export Modal */}
      <ExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        onExport={handleExecuteExport}
        onRecordVideo={handleStartVideoRecording}
        onShareNative={handleShareNative}
      />

      {/* Resume Previous Creation Prompt */}
      <ResumeModal
        isOpen={isResumeOpen}
        onContinue={handleResumeContinue}
        onStartFresh={handleResumeStartFresh}
      />

      {/* Local History Gallery Modal */}
      <GalleryModal
        isOpen={isGalleryOpen}
        onClose={() => setIsGalleryOpen(false)}
        onSelectGridData={(data: SavedGridData) => setGridData(toSampledGridResult(data))}
      />

      {/* Screen Modes */}
      <AnimatePresence>
        {mode === 'select' && <ModeSelect key="select" />}
        {mode === 'upload' && <UploadMode key="upload" />}
        {mode === 'draw' && <DrawMode key="draw" />}
        {mode === 'type' && <TypeMode key="type" />}
      </AnimatePresence>
    </main>
  );
}
