'use client';

import React, { useRef, useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { AnimatePresence, motion } from 'framer-motion';
import { RotateCcw, Download, Plus, Images, Square, Sparkles, Loader2 } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { Wordmark } from '@/components/ui/Wordmark';
import { Button } from '@/components/ui/Button';
import { MuteButton } from '@/components/ui/MuteButton';
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

  // Global Image Paste / Drag-and-Drop state
  const [isProcessingDroppedImage, setIsProcessingDroppedImage] = useState(false);

  // Disperse Cooldown state
  const [isDisperseCooling, setIsDisperseCooling] = useState(false);
  const disperseTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Global Image Paste & Drag-and-Drop Anywhere Handlers (Desktop)
  const processImageFile = async (file: File) => {
    try {
      setIsProcessingDroppedImage(true);
      soundEngine.playUIClick();
      const sampled = await sampleImageToGrid(file, 75);
      setGridData(sampled, 'upload');
      announceToScreenReader('Pasted/Dropped image pixelated into 3D physics canvas');
    } catch (err) {
      console.error('Image sampling failed on paste/drop:', err);
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
      announceToScreenReader(`Video recording started (${format.toUpperCase()}). Disturb picture and revert to complete`);
    }
  };

  const handleStopVideoRecording = async () => {
    if (!isRecording) return;
    
    window.dispatchEvent(new CustomEvent('unravel-recording-stop'));
    setIsRecording(false);

    const { blob, format } = await videoRecorder.stop((progress) => {
      setTranscodeProgress(progress);
    });

    setTranscodeProgress(null);

    if (blob) {
      const ext = format === 'mp4' ? 'mp4' : 'webm';
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = `unravel-moment-${Date.now()}.${ext}`;
      link.href = url;
      link.click();
      announceToScreenReader(`Video recording saved as ${ext.toUpperCase()} to downloads`);
    }
  };

  const handleShareNative = async () => {
    const canvas = document.querySelector('canvas') as HTMLCanvasElement;
    if (!canvas) return;

    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], `unravel-art-${Date.now()}.png`, { type: 'image/png' });
      const shared = await shareFile(file, 'My Unravel Creation');
      if (shared) {
        announceToScreenReader('Artwork shared successfully');
      }
    }, 'image/png');
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
          <Loader2 size={48} className="animate-spin" color="var(--accent)" />
          <p className="font-heading" style={{ fontSize: '1rem', color: 'var(--ink)' }}>
            PIXELATING IMAGE...
          </p>
        </div>
      )}

      {/* MP4 Transcode Overlay Modal */}
      {transcodeProgress !== null && (
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
            <Loader2 size={36} className="animate-spin" color="var(--accent)" />
            <h3 className="font-heading" style={{ fontSize: '1rem', color: 'var(--ink)' }}>
              CONVERTING TO MP4...
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Encoding video frames. Please wait a moment.
            </p>
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
            {/* Top Bar: Wordmark + Gallery + Mute Button */}
            <div style={{ pointerEvents: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Wordmark size="lg" />
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <button
                  data-ui-obstacle="true"
                  onClick={() => {
                    soundEngine.playUIClick();
                    setIsGalleryOpen(true);
                  }}
                  aria-label="Open Local Gallery"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '42px',
                    height: '42px',
                    backgroundColor: 'var(--surface)',
                    color: 'var(--ink)',
                    border: '3px solid var(--ink)',
                    boxShadow: '3px 3px 0 var(--ink)',
                    cursor: 'pointer',
                    outline: 'none',
                  }}
                >
                  <Images size={20} />
                </button>
                <MuteButton />
              </div>
            </div>

            {/* Bottom Bar: Single Start Button */}
            <div
              style={{
                pointerEvents: 'auto',
                display: 'flex',
                justifyContent: 'center',
                marginBottom: '1rem',
              }}
            >
              <Button
                variant="primary"
                onClick={() => setMode('select')}
                style={{ fontSize: '1.2rem', padding: '1.1rem 3rem' }}
              >
                {t('START')}
              </Button>
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
              padding: '2rem',
              zIndex: 5,
            }}
          >
            {/* Top Bar: Wordmark + Controls */}
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

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <button
                  data-ui-obstacle="true"
                  onClick={() => {
                    soundEngine.playUIClick();
                    setIsGalleryOpen(true);
                  }}
                  aria-label="Open Local Gallery"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '42px',
                    height: '42px',
                    backgroundColor: 'var(--surface)',
                    color: 'var(--ink)',
                    border: '3px solid var(--ink)',
                    boxShadow: '3px 3px 0 var(--ink)',
                    cursor: 'pointer',
                    outline: 'none',
                  }}
                >
                  <Images size={20} />
                </button>
                <MuteButton />
                <Button variant="secondary" onClick={() => setMode('select')}>
                  <Plus size={18} /> {t('NEW')}
                </Button>
              </div>
            </div>

            {/* Bottom Floating Bar: Revert (when disturbed), Disperse (always), Save (always) */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '1.25rem',
                width: '100%',
                pointerEvents: 'auto',
              }}
            >
              {isDisturbed && (
                <motion.div
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  <Button variant="primary" onClick={handleRevert} style={{ fontSize: '1rem', padding: '1rem 2rem' }}>
                    <RotateCcw size={20} /> {t('REVERT')}
                  </Button>
                </motion.div>
              )}

              <Button
                variant="secondary"
                onClick={handleDisperse}
                disabled={isDisperseCooling}
                style={{
                  fontSize: '0.95rem',
                  padding: '1rem 1.75rem',
                  opacity: isDisperseCooling ? 0.5 : 1,
                  cursor: isDisperseCooling ? 'not-allowed' : 'pointer',
                  transition: 'opacity 0.2s ease',
                }}
              >
                <Sparkles size={18} /> {t('DISPERSE')}
              </Button>

              <Button
                variant="secondary"
                onClick={() => setIsExportOpen(true)}
                style={{ fontSize: '0.95rem', padding: '1rem 1.75rem' }}
              >
                <Download size={18} /> {t('SAVE')}
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
