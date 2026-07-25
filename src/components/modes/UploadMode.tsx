'use client';

import React, { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { UploadCloud, Camera, ArrowLeft } from 'lucide-react';
import { BrandLoader } from '@/components/ui/BrandLoader';
import { useAppStore } from '@/store/useAppStore';
import { Button } from '@/components/ui/Button';
import { Wordmark } from '@/components/ui/Wordmark';
import { MuteButton } from '@/components/ui/MuteButton';
import { CameraModal } from '@/components/ui/CameraModal';
import { sampleImageToGrid } from '@/lib/imageSampler';
import { soundEngine } from '@/lib/audio/soundEngine';
import { t } from '@/lib/i18n/strings';
import { showToast } from '@/components/ui/Toast';
import { announceToScreenReader } from '@/components/ui/AccessibilityAnnouncer';

export const UploadMode: React.FC = () => {
  const setMode = useAppStore((state) => state.setMode);
  const setGridData = useAppStore((state) => state.setGridData);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);

  const processFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      showToast("That file isn't an image — try a PNG or JPG", 'error');
      return;
    }

    try {
      setLoading(true);
      const sampled = await sampleImageToGrid(file, 75);
      setGridData(sampled, 'upload');
      announceToScreenReader('Photo converted to 3D cubes');
    } catch (err) {
      console.error('Image sampling failed', err);
      showToast("Couldn't process that image — try a different photo", 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const handleFileClick = () => {
    soundEngine.playUIClick();
    fileInputRef.current?.click();
  };

  const handleCameraClick = () => {
    soundEngine.playUIClick();
    setIsCameraOpen(true);
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10,
        backgroundColor: 'var(--bg)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '1rem',
        overflowY: 'auto',
      }}
    >
      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      {/* Absolute Top Bar */}
      <div style={{ position: 'absolute', top: '1rem', left: '1rem', right: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 12 }}>
        <Button variant="secondary" onClick={() => setMode('select')} aria-label="Go Back" style={{ padding: '0.6rem 1rem' }}>
          <ArrowLeft size={18} />
          <span className="btn-text-responsive" style={{ marginLeft: '0.25rem' }}>{t('BACK')}</span>
        </Button>
        <MuteButton />
      </div>

      {/* Centered Scrollable Area */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          width: '100%',
          maxWidth: '560px',
          margin: 'auto',
          paddingTop: '4.5rem',
          paddingBottom: '1.5rem',
        }}
      >
        <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
          <Wordmark size="md" />
          <h1 className="font-heading" style={{ fontSize: '1rem', marginTop: '0.75rem' }}>
            {t('UPLOAD_PHOTO')}
          </h1>
        </div>

        {loading ? (
          <div
            style={{
              width: '100%',
              maxWidth: '560px',
              height: '220px',
              backgroundColor: 'var(--surface)',
              border: '4px solid var(--ink)',
              boxShadow: '4px 4px 0 var(--ink)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '1rem',
            }}
          >
            <BrandLoader size={44} />
            <p className="font-heading" style={{ fontSize: '0.8rem' }}>
              PIXELATING...
            </p>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))',
              gap: '1.25rem',
              width: '100%',
            }}
          >
            {/* File Picker / Drop Zone */}
            <motion.div
              whileHover={{ scale: 1.02, x: -2, y: -2 }}
              whileTap={{ scale: 0.98, x: 2, y: 2 }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={handleFileClick}
              aria-label="Upload Image File"
              style={{
                backgroundColor: 'var(--surface)',
                border: '3px dashed var(--ink)',
                boxShadow: '4px 4px 0 var(--ink)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '1rem',
                cursor: 'pointer',
                padding: '2rem 1rem',
                textAlign: 'center',
              }}
            >
              <UploadCloud size={44} color="var(--ink)" />
              <div>
                <p className="font-heading" style={{ fontSize: '0.8rem' }}>
                  {t('TAP_TO_SELECT')}
                </p>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.7rem', marginTop: '0.3rem' }}>
                  or drop file here
                </p>
              </div>
            </motion.div>

            {/* Live WebRTC Camera Capture Button */}
            <motion.div
              whileHover={{ scale: 1.02, x: -2, y: -2 }}
              whileTap={{ scale: 0.98, x: 2, y: 2 }}
              onClick={handleCameraClick}
              aria-label="Take Photo with Camera"
              style={{
                backgroundColor: 'var(--surface)',
                border: '3px solid var(--ink)',
                boxShadow: '4px 4px 0 var(--ink)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '1rem',
                cursor: 'pointer',
                padding: '2rem 1rem',
                textAlign: 'center',
              }}
            >
              <Camera size={44} color="var(--accent)" />
              <div>
                <p className="font-heading" style={{ fontSize: '0.8rem' }}>
                  {t('TAKE_PHOTO')}
                </p>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.7rem', marginTop: '0.3rem' }}>
                  Use live camera viewfinder
                </p>
              </div>
            </motion.div>
          </div>
        )}
      </div>

      {/* Live WebRTC Camera Modal */}
      <CameraModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onCapture={processFile}
        onFallbackFilePicker={() => fileInputRef.current?.click()}
      />
    </motion.div>
  );
};
