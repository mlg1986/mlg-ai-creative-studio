import { useRef, useState } from 'react';

interface Props {
  onUpload: (path: string | null) => void;
}

export function BlueprintUpload({ onUpload }: Props) {
  const [preview, setPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreview(URL.createObjectURL(file));
    onUpload(null); // Blueprint upload handled separately if needed
  };

  return (
    <div>
      <h3 className="label-uppercase mb-2">Layout Reference (Optional)</h3>
      {preview ? (
        <div className="relative rounded-xl overflow-hidden border border-white/10">
          <img src={preview} alt="Blueprint" className="w-full h-24 object-cover" />
          <button
            onClick={() => { setPreview(null); onUpload(null); }}
            className="absolute top-1 right-1 bg-black/60 rounded-full w-5 h-5 flex items-center justify-center text-xs"
          >
            ✕
          </button>
        </div>
      ) : (
        <div className="relative block border-2 border-dashed border-white/10 rounded-xl p-4 text-center cursor-pointer hover:border-purple-400/30">
          <div className="text-xl mb-1">📷</div>
          <div className="text-xs text-gray-400">Upload room photo for perspective reference</div>
          <input ref={inputRef} type="file" accept="image/*" onChange={handleFile} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" aria-label="Layout-Referenz hochladen" />
        </div>
      )}
    </div>
  );
}
