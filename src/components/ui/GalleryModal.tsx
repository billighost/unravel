'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Images, X, Trash2 } from 'lucide-react';
import { getGalleryItems, deleteGalleryItem, GalleryItem, SavedGridData } from '@/lib/storage';
import { soundEngine } from '@/lib/audio/soundEngine';
import { t } from '@/lib/i18n/strings';

interface GalleryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectGridData: (gridData: SavedGridData) => void;
}

export const GalleryModal: React.FC<GalleryModalProps> = ({
  isOpen,
  onClose,
  onSelectGridData,
}) => {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadGallery = async () => {
    setLoading(true);
    const data = await getGalleryItems();
    // Reverse to show newest creations first
    setItems(data.reverse());
    setLoading(false);
  };

  useEffect(() => {
    if (isOpen) {
      loadGallery();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleClose = () => {
    soundEngine.playUIClick();
    onClose();
  };

  const handleSelect = (item: GalleryItem) => {
    soundEngine.playUIClick();
    onSelectGridData(item.gridData);
    onClose();
  };

  const handleDelete = async (e: React.MouseEvent, id?: number) => {
    e.stopPropagation();
    if (id === undefined) return;
    soundEngine.playUIClick();
    await deleteGalleryItem(id);
    await loadGallery();
  };

  return (
    <AnimatePresence>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(0, 0, 0, 0.4)',
          padding: '1.5rem',
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
            padding: '2rem',
            maxWidth: '560px',
            width: '100%',
            maxHeight: '80vh',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Close Button */}
          <button
            onClick={handleClose}
            aria-label="Close Gallery"
            style={{
              position: 'absolute',
              top: '1rem',
              right: '1rem',
              backgroundColor: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--ink)',
            }}
          >
            <X size={20} />
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Images size={24} color="var(--ink)" />
            <h2 className="font-heading" style={{ fontSize: '1.15rem', color: 'var(--ink)' }}>
              {t('LOCAL_GALLERY')}
            </h2>
          </div>

          {loading ? (
            <div style={{ padding: '3rem 0', textAlign: 'center', color: 'var(--text-secondary)' }}>
              Loading gallery...
            </div>
          ) : items.length === 0 ? (
            <div style={{ padding: '3rem 0', textAlign: 'center', color: 'var(--text-secondary)' }}>
              No saved creations yet. Turn an image, sketch, or text into cubes to save it here!
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                gap: '1rem',
                overflowY: 'auto',
                paddingRight: '0.5rem',
                maxHeight: '420px',
              }}
            >
              {items.map((item) => (
                <div
                  key={item.id}
                  onClick={() => handleSelect(item)}
                  style={{
                    backgroundColor: 'var(--surface)',
                    border: '2px solid var(--ink)',
                    boxShadow: '3px 3px 0 var(--ink)',
                    cursor: 'pointer',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    position: 'relative',
                  }}
                >
                  <div
                    style={{
                      width: '100%',
                      height: '100px',
                      backgroundColor: '#000000',
                      backgroundImage: `url(${item.thumbnail})`,
                      backgroundSize: 'contain',
                      backgroundPosition: 'center',
                      backgroundRepeat: 'no-repeat',
                    }}
                  />
                  <div
                    style={{
                      padding: '0.4rem 0.5rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      borderTop: '2px solid var(--ink)',
                      backgroundColor: 'var(--bg)',
                    }}
                  >
                    <span className="font-heading" style={{ fontSize: '0.65rem', color: 'var(--ink)' }}>
                      {item.gridData.cols}x{item.gridData.rows}
                    </span>
                    <button
                      onClick={(e) => handleDelete(e, item.id)}
                      aria-label="Delete Creation"
                      style={{
                        backgroundColor: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--ink)',
                        padding: 0,
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
