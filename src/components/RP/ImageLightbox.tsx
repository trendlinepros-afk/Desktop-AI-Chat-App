import { useEffect } from 'react';

// Full-screen in-app image viewer (replaces window.open, which renders a
// blank window for data URLs in Electron). Click anywhere or Escape closes.
export function ImageLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const save = (e: React.MouseEvent) => {
    e.stopPropagation();
    const a = document.createElement('a');
    a.href = src;
    a.download = `wicked-image-${Date.now()}.png`;
    a.click();
  };

  return (
    <div
      data-rp-modal
      onClick={onClose}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/95 p-4"
    >
      <img src={src} alt="" className="max-h-[92vh] max-w-[95vw] rounded-lg object-contain" />
      <div className="absolute right-4 top-4 flex gap-2" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={save}
          className="rounded-lg bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/20"
        >
          ⬇ Save
        </button>
        <button
          onClick={onClose}
          className="rounded-lg bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/20"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
