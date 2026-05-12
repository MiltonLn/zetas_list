import { useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import type { Area } from 'react-easy-crop';

interface ImageCropModalProps {
  imageSrc: string;
  onCrop: (blob: Blob) => void;
  onCancel: () => void;
}

function createCroppedImage(imageSrc: string, crop: Area): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const size = Math.min(crop.width, crop.height);
      canvas.width = 400;
      canvas.height = 400;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('No canvas context'));

      ctx.drawImage(img, crop.x, crop.y, size, size, 0, 0, 400, 400);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Failed to create blob'))),
        'image/jpeg',
        0.9,
      );
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = imageSrc;
  });
}

export function ImageCropModal({ imageSrc, onCrop, onCancel }: ImageCropModalProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    setCroppedArea(pixels);
  }, []);

  async function handleConfirm() {
    if (!croppedArea) return;
    setSaving(true);
    try {
      const blob = await createCroppedImage(imageSrc, croppedArea);
      onCrop(blob);
    } catch {
      onCancel();
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
        display: 'flex', flexDirection: 'column', zIndex: 400,
      }}
    >
      <div style={{ flex: 1, position: 'relative' }}>
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          aspect={1}
          cropShape="round"
          showGrid={false}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
        />
      </div>

      <div style={{ padding: '12px 24px', background: '#1a1d38' }}>
        <input
          type="range"
          min={1}
          max={3}
          step={0.05}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          style={{ width: '100%', accentColor: '#3b5bdb' }}
        />
      </div>

      <div style={{ display: 'flex', gap: 10, padding: '12px 24px 20px', background: '#1a1d38' }}>
        <button
          onClick={onCancel}
          style={{
            flex: 1, padding: '12px 0', borderRadius: 10, fontSize: 14,
            background: '#141627', border: '1px solid #2a2f5a',
            color: '#7c8db5', cursor: 'pointer',
          }}
        >
          Cancelar
        </button>
        <button
          onClick={handleConfirm}
          disabled={saving}
          className="btn btn-primary"
          style={{ flex: 1, padding: '12px 0', borderRadius: 10, fontSize: 14 }}
        >
          {saving ? 'Guardando...' : 'Guardar foto'}
        </button>
      </div>
    </div>
  );
}
