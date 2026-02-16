import { useState, useRef } from 'react';
import { api, showToast } from '../../services/api';

/** Max motif uploads (Gemini allows 14 ref images total; material refs + blueprint use the rest, motifs fill remaining). */
const MAX_MOTIF_IMAGES = 14;

interface Props {
  value: string[];
  onChange: (paths: string[]) => void;
  visible: boolean;
}

export function MotifUpload({ value, onChange, visible }: Props) {
  const [uploading, setUploading] = useState(false);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [imageLoadErrors, setImageLoadErrors] = useState<Record<number, boolean>>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelUploadRef = useRef(false);

  if (!visible) return null;

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    
    // Clear input immediately after capturing files in array
    e.target.value = '';

    const toAdd = Math.min(files.length, MAX_MOTIF_IMAGES - value.length);
    if (toAdd <= 0) return;

    cancelUploadRef.current = false;
    setUploading(true);
    const newPreviews: string[] = [];
    for (let i = 0; i < toAdd; i++) newPreviews.push(URL.createObjectURL(files[i]));
    setPreviewUrls(newPreviews);

    try {
      const formData = new FormData();
      for (let i = 0; i < toAdd; i++) {
        formData.append('motif', files[i]);
      }
      const result = await api.scenes.uploadMotif(formData);
      const paths = result.paths || (result.path ? [result.path] : []);
      
      newPreviews.forEach(url => URL.revokeObjectURL(url));
      setPreviewUrls([]);
      
      if (!cancelUploadRef.current) {
        setImageLoadErrors({});
        const next = [...value, ...paths].slice(0, MAX_MOTIF_IMAGES);
        onChange(next);
        showToast({ type: 'success', title: 'Motiv hochgeladen', message: `${paths.length} Bild(er) wurden hinzugefügt.` });
      }
    } catch (err: any) {
      newPreviews.forEach(url => URL.revokeObjectURL(url));
      setPreviewUrls([]);
      const msg = err?.message || err?.error?.message || err?.code || 'Upload fehlgeschlagen';
      console.error('[MotifUpload]', msg, err);
      showToast({ type: 'error', title: 'Motiv-Upload fehlgeschlagen', message: String(msg) });
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = (index: number) => {
    setImageLoadErrors(prev => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
    onChange(value.filter((_, i) => i !== index));
  };

  const handleRemovePreview = () => {
    cancelUploadRef.current = true;
    setPreviewUrls([]);
  };

  const handleRemoveAll = () => {
    cancelUploadRef.current = true;
    setPreviewUrls([]);
    setImageLoadErrors({});
    onChange([]);
  };

  const list: { path: string | null; preview: string | null }[] = [
    ...value.map(p => ({ path: p, preview: null })),
    ...previewUrls.map(url => ({ path: null, preview: url })),
  ];

  // In dev Vite proxies /uploads to backend; path is already /uploads/...
  const imageSrc = (path: string | null, preview: string | null) => path || preview || '';

  return (
    <div>
      <h3 className="label-uppercase mb-2">
        Motiv für Leinwand
        {value.length > 0 && <span className="ml-1.5 text-purple-400">({value.length})</span>}
      </h3>
      <div className="p-2 bg-purple-500/5 rounded-lg border border-purple-500/20 mb-2">
        <p className="text-[10px] text-purple-300">
          Optional bis zu {MAX_MOTIF_IMAGES} Grafiken. Referenzbilder (Material + Blueprint) werden zuerst gesendet, Motive füllen die restlichen Slots (max. 14 Bilder gesamt).
        </p>
      </div>

      {list.length > 0 && (
        <div className="space-y-2 mb-2">
          {list.map((item, index) => (
            <div key={item.path || item.preview || `preview-${index}`} className="relative rounded-xl overflow-hidden border border-purple-500/30 flex items-center gap-2">
              <div className="w-20 h-20 flex-shrink-0 bg-gray-900/50 rounded-lg overflow-hidden flex items-center justify-center">
                {imageLoadErrors[index] ? (
                  <span className="text-[10px] text-gray-500">Bild</span>
                ) : (
                  <img
                    src={imageSrc(item.path, item.preview)}
                    alt={`Motiv ${index + 1}`}
                    className="w-full h-full object-contain"
                    onError={() => setImageLoadErrors(prev => ({ ...prev, [index]: true }))}
                  />
                )}
              </div>
              <div className="flex-1 min-w-0 text-[10px] text-gray-500">
                {item.path ? 'Hochgeladen' : 'Wird hochgeladen…'}
              </div>
              <button
                type="button"
                onClick={() => item.path ? handleRemove(index) : handleRemovePreview()}
                className="flex-shrink-0 m-1 w-6 h-6 rounded-full bg-black/60 hover:bg-red-600/80 flex items-center justify-center text-xs transition-colors"
              >
                ✕
              </button>
            </div>
          ))}
          {uploading && (
            <div className="flex items-center gap-2 text-[10px] text-purple-400">
              <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
              Lade hoch…
            </div>
          )}
          {value.length > 0 && !uploading && (
            <button
              type="button"
              onClick={handleRemoveAll}
              className="text-[10px] text-gray-500 hover:text-red-400"
            >
              Alle entfernen
            </button>
          )}
        </div>
      )}

      {value.length < MAX_MOTIF_IMAGES && (
        <div className="relative block border-2 border-dashed border-purple-500/20 rounded-xl p-3 text-center cursor-pointer hover:border-purple-400/40 transition-colors">
          <div className="text-lg mb-0.5">🎨</div>
          <div className="text-xs text-gray-400">
            {value.length === 0 ? 'Motiv-Grafik(en) hochladen' : `Noch ${MAX_MOTIF_IMAGES - value.length} weitere (max. ${MAX_MOTIF_IMAGES})`}
          </div>
          <div className="text-[10px] text-gray-500 mt-0.5">PNG, JPG – werden auf die Leinwand platziert</div>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFile}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            aria-label="Motiv-Grafik(en) hochladen"
          />
        </div>
      )}
    </div>
  );
}
