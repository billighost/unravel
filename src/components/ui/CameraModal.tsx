'use client';

import React, { useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, X, RefreshCw, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { soundEngine } from '@/lib/audio/soundEngine';

interface CameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
  onFallbackFilePicker: () => void;
}

export const CameraModal: React.FC<CameraModalProps> = ({
  isOpen,
  onClose,
  onCapture,
  onFallbackFilePicker,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraState, setCameraState] = useState<'initializing' | 'active' | 'error'>('initializing');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');

  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const startCamera = async (facing: 'environment' | 'user') => {
    stopStream();
    setCameraState('initializing');
    setErrorMessage('');

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setCameraState('error');
      setErrorMessage('Camera access is not supported by your browser.');
      return;
    }

    try {
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: facing,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setCameraState('active');
    } catch (err: any) {
      console.warn('Camera access failed:', err);
      // Fallback try simple video constraint if facingMode failed
      try {
        const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: true });
        streamRef.current = fallbackStream;
        if (videoRef.current) {
          videoRef.current.srcObject = fallbackStream;
          await videoRef.current.play();
        }
        setCameraState('active');
      } catch (fallbackErr: any) {
        setCameraState('error');
        setErrorMessage('Camera permission denied or camera device unavailable.');
      }
    }
  };

  useEffect(() => {
    if (isOpen) {
      startCamera(facingMode);
    } else {
      stopStream();
    }
    return () => {
      stopStream();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleClose = () => {
    soundEngine.playUIClick();
    stopStream();
    onClose();
  };

  const handleFlipCamera = () => {
    soundEngine.playUIClick();
    const nextFacing = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextFacing);
    startCamera(nextFacing);
  };

  const handleSnapPhoto = () => {
    soundEngine.playUIClick();
    const video = videoRef.current;
    if (!video || cameraState !== 'active') return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Flip horizontally if front camera ('user')
    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `unravel-camera-${Date.now()}.png`, { type: 'image/png' });
      stopStream();
      onCapture(file);
    }, 'image/png');
  };

  const handleFallback = () => {
    soundEngine.playUIClick();
    stopStream();
    onClose();
    onFallbackFilePicker();
  };

  return (
    <AnimatePresence>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 110,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(0, 0, 0, 0.65)',
          padding: '1rem',
        }}
        onClick={handleClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.12 }}
          onClick={(e) => e.stopPropagation()}
          style={{
            backgroundColor: 'var(--surface)',
            border: '4px solid var(--ink)',
            boxShadow: '8px 8px 0 var(--ink)',
            padding: '1.5rem',
            maxWidth: '580px',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '1.25rem',
            position: 'relative',
          }}
        >
          {/* Close button */}
          <button
            onClick={handleClose}
            aria-label="Close Camera Viewfinder"
            style={{
              position: 'absolute',
              top: '1rem',
              right: '1rem',
              backgroundColor: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--ink)',
              zIndex: 10,
            }}
          >
            <X size={22} />
          </button>

          <div style={{ textAlign: 'center' }}>
            <h2 className="font-heading" style={{ fontSize: '1.1rem', color: 'var(--ink)' }}>
              CAMERA VIEWFINDER
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '0.25rem' }}>
              Point your camera and take a photo
            </p>
          </div>

          {/* Video Viewfinder Container */}
          <div
            style={{
              width: '100%',
              height: '320px',
              backgroundColor: '#000000',
              border: '3px solid var(--ink)',
              position: 'relative',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                transform: facingMode === 'user' ? 'scaleX(-1)' : 'none',
                display: cameraState === 'active' ? 'block' : 'none',
              }}
            />

            {cameraState === 'initializing' && (
              <div style={{ color: '#FFFFFF', textAlign: 'center', fontFamily: 'var(--font-heading)', fontSize: '0.85rem' }}>
                STARTING CAMERA...
              </div>
            )}

            {cameraState === 'error' && (
              <div
                style={{
                  padding: '1.5rem',
                  textAlign: 'center',
                  color: '#FF3B30',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '0.75rem',
                }}
              >
                <AlertCircle size={36} color="#FF3B30" />
                <p style={{ fontFamily: 'var(--font-heading)', fontSize: '0.8rem' }}>
                  {errorMessage || 'Camera access unavailable'}
                </p>
              </div>
            )}

            {/* Viewfinder Reticle Overlay */}
            {cameraState === 'active' && (
              <div
                style={{
                  position: 'absolute',
                  inset: '20px',
                  border: '2px dashed rgba(255, 255, 255, 0.5)',
                  pointerEvents: 'none',
                }}
              />
            )}
          </div>

          {/* Action Bar */}
          <div style={{ display: 'flex', gap: '1rem', width: '100%', justifyContent: 'center' }}>
            {cameraState === 'active' ? (
              <>
                <Button variant="secondary" onClick={handleFlipCamera} style={{ padding: '0.85rem 1.25rem' }}>
                  <RefreshCw size={18} /> FLIP
                </Button>
                <Button variant="primary" onClick={handleSnapPhoto} style={{ padding: '0.85rem 2rem', fontSize: '1rem' }}>
                  <Camera size={22} /> SNAP PHOTO
                </Button>
              </>
            ) : (
              <Button variant="primary" onClick={handleFallback} style={{ padding: '0.85rem 1.5rem' }}>
                SELECT FILE INSTEAD
              </Button>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
