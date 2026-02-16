import { useState, useRef } from 'react';
import { api, showToast } from '../../services/api';

const MAX_EXTRA_REFS = 8;

interface Props {
  value: string[];
  onChange: (paths: string[]) => void;
}

export function ExtraReferenceUpload({ value, onChange }: Props) {
  const [uploading, setUploading] = useState(false);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [imageLoadErrors, setImageLoadErrors] = useState<Record<number, boolean>>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelUploadRef = useRef(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    e.target.value = '';

    const toAdd = Math.min(files.length, MAX_EXTRA_REFS - value.length);
    if (toAdd <= 0) return;

    cancelUploadRef.current = false;
    setUploading(true);
    const newPreviews: string[] = [];
    for (let i = 0; i < toAdd; i++) newPreviews.push(URL.createObjectURL(files[i]));
    setPreviewUrls(newPreviews);

    try {
      const formData = new FormData();
      for (let i = 0; i < toAdd; i++) {
        formData.append('extraRef', files[i]);
      }
      const result = await api.scenes.uploadExtraReference(formData);
      const paths = result.paths || [];

      newPreviews.forEach(url => URL.revokeObjectURL(url));
      setPreviewUrls([]);

      if (!cancelUploadRef.current) {
        setImageLoadErrors({});
        const next = [...value, ...paths].slice(0, MAX_EXTRA_REFS);
        onChange(next);
        showToast({ type: 'success', title: 'Referenzbild hochgeladen', message: `${paths.length} Bild(er) wurden hinzugefügt.` });
      }
    } catch (err: any) {
      newPreviews.forEach(url => URL.revokeObjectURL(url));
      setPreviewUrls([]);
      const msg = err?.message || err?.error?.message || err?.code || 'Upload fehlgeschlagen';
      console.error('[ExtraReferenceUpload]', msg, err);
      showToast({ type: 'error', title: 'Upload fehlgeschlagen', message: String(msg) });
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

  const imageSrc = (path: string | null, preview: string | null) => path || preview || '';

  return (
    <div>
      <h3 className="label-uppercase mb-2">
        Zusätzliche Referenzbilder
        {value.length > 0 && <span className="ml-1.5 text-blue-400">({value.length})</span>}
      </h3>
      <div className="p-2 bg-blue-500/5 rounded-lg border border-blue-500/20 mb-2">
        <p className="text-[10px] text-blue-300">
          Optional: Personen, Objekte oder visuelle Vorlagen. Die KI wird automatisch angewiesen, die hochgeladenen Referenzbilder in der Szene zu verwenden. Du kannst dich in der Szenen-Beschreibung zusätzlich darauf beziehen (z. B. „Die Person aus Referenzbild 1 soll links stehen"). Max. {MAX_EXTRA_REFS} Bilder.
        </p>
      </div>

      {list.length > 0 && (
        <div className="space-y-2 mb-2">
          {list.map((item, index) => (
            <div key={item.path || item.preview || `preview-${index}`} className="relative rounded-xl overflow-hidden border border-blue-500/30 flex items-center gap-2">
              <div className="w-20 h-20 flex-shrink-0 bg-gray-900/50 rounded-lg overflow-hidden flex items-center justify-center">
                {imageLoadErrors[index] ? (
                  <span className="text-[10px] text-gray-500">Bild</span>
                ) : (
                  <img
                    src={imageSrc(item.path, item.preview)}
                    alt={`Referenzbild ${index + 1}`}
                    className="w-full h-full object-contain"
                    onError={() => setImageLoadErrors(prev => ({ ...prev, [index]: true }))}
                  />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] text-gray-400 font-medium">Referenzbild {index + 1}</div>
                <div className="text-[10px] text-gray-500">{item.path ? 'Hochgeladen' : 'Wird hochgeladen...'}</div>
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
            <div className="flex items-center gap-2 text-[10px] text-blue-400">
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              Lade hoch...
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

      {value.length < MAX_EXTRA_REFS && (
        <div className="relative block border-2 border-dashed border-blue-500/20 rounded-xl p-3 text-center cursor-pointer hover:border-blue-400/40 transition-colors">
          <div className="text-lg mb-0.5">📎</div>
          <div className="text-xs text-gray-400">
            {value.length === 0 ? 'Referenzbild(er) hochladen' : `Noch ${MAX_EXTRA_REFS - value.length} weitere (max. ${MAX_EXTRA_REFS})`}
          </div>
          <div className="text-[10px] text-gray-500 mt-0.5">Person, Objekt oder visuelles Vorbild (PNG, JPG)</div>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFile}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            aria-label="Referenzbild(er) hochladen"
          />
        </div>
      )}
    </div>
  );
}
