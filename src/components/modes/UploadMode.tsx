'use client';

import React, { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { UploadCloud, Camera, ArrowLeft, Loader2 } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { Button } from '@/components/ui/Button';
import { Wordmark } from '@/components/ui/Wordmark';
import { MuteButton } from '@/components/ui/MuteButton';
import { CameraModal } from '@/components/ui/CameraModal';
import { sampleImageToGrid } from '@/lib/imageSampler';
import { soundEngine } from '@/lib/audio/soundEngine';
import { t } from '@/lib/i18n/strings';

export const UploadMode: React.FC = () => {
  const setMode = useAppStore((state) => state.setMode);
  const setGridData = useAppStore((state) => state.setGridData);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);

  const processFile = async (file: File) => {
    try {
      setLoading(true);
      const sampled = await sampleImageToGrid(file, 75);
      setGridData(sampled);
    } catch (err) {
      console.error('Image sampling failed', err);
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
        justifyContent: 'center',
        padding: '2rem',
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

      <div style={{ position: 'absolute', top: '2rem', left: '2rem', right: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Button variant="secondary" onClick={() => setMode('select')}>
          <ArrowLeft size={18} /> {t('BACK')}
        </Button>
        <MuteButton />
      </div>

      <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
        <Wordmark size="md" />
        <h1 className="font-heading" style={{ fontSize: '1.2rem', marginTop: '1rem' }}>
          {t('UPLOAD_PHOTO')}
        </h1>
      </div>

      {loading ? (
        <div
          style={{
            width: '100%',
            maxWidth: '560px',
            height: '240px',
            backgroundColor: 'var(--surface)',
            border: '4px solid var(--ink)',
            boxShadow: '6px 6px 0 var(--ink)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1rem',
          }}
        >
          <Loader2 size={48} className="animate-spin" color="var(--accent)" />
          <p className="font-heading" style={{ fontSize: '0.9rem' }}>
            PIXELATING...
          </p>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '1.5rem',
            width: '100%',
            maxWidth: '560px',
          }}
        >
          {/* File Picker / Drop Zone */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={handleFileClick}
            aria-label="Upload Image File"
            style={{
              backgroundColor: 'var(--surface)',
              border: '3px dashed var(--ink)',
              boxShadow: '6px 6px 0 var(--ink)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '1rem',
              cursor: 'pointer',
              padding: '2.5rem 1.5rem',
              textAlign: 'center',
            }}
          >
            <UploadCloud size={52} color="var(--ink)" />
            <div>
              <p className="font-heading" style={{ fontSize: '0.85rem' }}>
                {t('TAP_TO_SELECT')}
              </p>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: '0.3rem' }}>
                or drop file here
              </p>
            </div>
          </div>

          {/* Live WebRTC Camera Capture Button */}
          <div
            onClick={handleCameraClick}
            aria-label="Take Photo with Camera"
            style={{
              backgroundColor: 'var(--surface)',
              border: '3px solid var(--ink)',
              boxShadow: '6px 6px 0 var(--ink)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '1rem',
              cursor: 'pointer',
              padding: '2.5rem 1.5rem',
              textAlign: 'center',
            }}
          >
            <Camera size={52} color="var(--accent)" />
            <div>
              <p className="font-heading" style={{ fontSize: '0.85rem' }}>
                {t('TAKE_PHOTO')}
              </p>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: '0.3rem' }}>
                Use live camera viewfinder
              </p>
            </div>
          </div>
        </div>
      )}

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
