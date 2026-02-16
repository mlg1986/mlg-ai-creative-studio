import { useState } from 'react';
import { MaterialCategory, CATEGORY_LABELS, PERSPECTIVES } from '../../types';
import { api } from '../../services/api';

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

export function MaterialForm({ onClose, onCreated }: Props) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<MaterialCategory>('paint_pots');
  const [description, setDescription] = useState('');
  const [materialType, setMaterialType] = useState('');
  const [dimensions, setDimensions] = useState('');
  const [surface, setSurface] = useState('');
  const [weight, setWeight] = useState('');
  const [color, setColor] = useState('');
  const [formatCode, setFormatCode] = useState('');
  const [size, setSize] = useState('');
  const [frameOption, setFrameOption] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [perspectives, setPerspectives] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const MAX_IMAGES = 14;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = Array.from(e.target.files || []);
    const remaining = MAX_IMAGES - files.length;
    const toAdd = newFiles.slice(0, remaining);
    if (toAdd.length === 0) return;
    setFiles(prev => [...prev, ...toAdd]);
    setPerspectives(prev => [...prev, ...toAdd.map(() => 'front')]);
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
    setPerspectives(prev => prev.filter((_, i) => i !== index));
  };

  const submit = async () => {
    if (!name.trim()) return;
    setSaving(true);

    const formData = new FormData();
    formData.append('name', name);
    formData.append('category', category);
    if (description) formData.append('description', description);
    if (materialType) formData.append('material_type', materialType);
    if (dimensions) formData.append('dimensions', dimensions);
    if (surface) formData.append('surface', surface);
    if (weight) formData.append('weight', weight);
    if (color) formData.append('color', color);
    if (category === 'mnz_motif') {
      if (formatCode) formData.append('format_code', formatCode);
      if (size) formData.append('size', size);
      if (frameOption) formData.append('frame_option', frameOption);
    }

    files.forEach(f => formData.append('images', f));
    formData.append('images_perspectives', JSON.stringify(perspectives));

    try {
      await api.materials.create(formData);
      onCreated();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 overflow-y-auto p-4" onClick={onClose}>
      <div className="bg-[#1a1a2e] rounded-xl border border-white/10 p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-4">Material hinzufügen</h2>

        <div className="space-y-3">
          <div>
            <label className="label-uppercase block mb-1">Name *</label>
            <input value={name} onChange={e => setName(e.target.value)}
              className="w-full bg-gray-800/50 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500" placeholder="z.B. Acryl-Farbtopf (3ml)" />
          </div>

          <div>
            <label className="label-uppercase block mb-1">Kategorie *</label>
            <select value={category} onChange={e => setCategory(e.target.value as MaterialCategory)}
              className="w-full bg-gray-800/50 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500">
              {Object.entries(CATEGORY_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label-uppercase block mb-1">Beschreibung</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)}
              className="w-full bg-gray-800/50 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500 resize-none h-16"
              placeholder="Optionale Beschreibung..." />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label-uppercase block mb-1">Material-Typ</label>
              <input value={materialType} onChange={e => setMaterialType(e.target.value)}
                className="w-full bg-gray-800/50 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500" placeholder="z.B. Plastik (PP)" />
            </div>
            <div>
              <label className="label-uppercase block mb-1">Maße</label>
              <input value={dimensions} onChange={e => setDimensions(e.target.value)}
                className="w-full bg-gray-800/50 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500" placeholder="z.B. Ø 20mm × 15mm" />
            </div>
            <div>
              <label className="label-uppercase block mb-1">Oberfläche</label>
              <input value={surface} onChange={e => setSurface(e.target.value)}
                className="w-full bg-gray-800/50 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500" placeholder="z.B. Glatt, glänzend" />
            </div>
            <div>
              <label className="label-uppercase block mb-1">Gewicht</label>
              <input value={weight} onChange={e => setWeight(e.target.value)}
                className="w-full bg-gray-800/50 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500" placeholder="z.B. ~8g" />
            </div>
          </div>

          <div>
            <label className="label-uppercase block mb-1">Farbe</label>
            <input value={color} onChange={e => setColor(e.target.value)}
              className="w-full bg-gray-800/50 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500" placeholder="z.B. Inhalt variabel, Deckel weiß" />
          </div>

          {category === 'mnz_motif' && (
            <div className="grid grid-cols-3 gap-3 p-3 bg-purple-500/5 rounded-lg border border-purple-500/20">
              <div>
                <label className="label-uppercase block mb-1">Format</label>
                <select value={formatCode} onChange={e => setFormatCode(e.target.value)}
                  className="w-full bg-gray-800/50 border border-white/10 rounded-lg px-2 py-1.5 text-sm">
                  <option value="">-</option>
                  <option value="1TK">1TK (Klassik 3:2)</option>
                  <option value="1TP">1TP (Panorama 2:1)</option>
                  <option value="1TQ">1TQ (Quadrat 1:1)</option>
                </select>
              </div>
              <div>
                <label className="label-uppercase block mb-1">Größe</label>
                <input value={size} onChange={e => setSize(e.target.value)} placeholder="60x40"
                  className="w-full bg-gray-800/50 border border-white/10 rounded-lg px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="label-uppercase block mb-1">Rahmen</label>
                <select value={frameOption} onChange={e => setFrameOption(e.target.value)}
                  className="w-full bg-gray-800/50 border border-white/10 rounded-lg px-2 py-1.5 text-sm">
                  <option value="">-</option>
                  <option value="OR">Vorlage (OR)</option>
                  <option value="R">Gerahmt (R)</option>
                  <option value="DIYR">Ausmalen (DIYR)</option>
                </select>
              </div>
            </div>
          )}

          {/* Image Upload */}
          <div>
            <label className="label-uppercase block mb-2">Referenzbilder</label>
            {/* Context-aware info */}
            <div className="mb-2 p-2.5 bg-blue-500/5 rounded-lg border border-blue-500/20 text-xs text-blue-300">
              <strong>Hinweis:</strong> Referenzbilder zeigen der KI die physische Form und Oberfläche.
              {category === 'mnz_motif' && (
                <span className="block mt-1 text-purple-300">
                  <strong>MNZ-Motive:</strong> Bilder dienen nur als Beispiel für Format/Aussehen.
                  Die KI generiert ein eigenes Motiv.
                </span>
              )}
              {category === 'paint_pots' && (
                <span className="block mt-1 text-purple-300">
                  <strong>Farbtöpfe:</strong> Die KI generiert Farbnummern-Labels auf den Deckeln.
                  Lade ein Beispielfoto der generellen Form hoch.
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <input type="file" accept="image/*" multiple onChange={handleFileChange}
                disabled={files.length >= MAX_IMAGES}
                className="flex-1 text-sm text-gray-400 file:mr-4 file:py-1.5 file:px-4 file:rounded-lg file:border-0 file:text-sm file:bg-purple-600 file:text-white hover:file:bg-purple-700 disabled:opacity-40" />
              <span className={`text-xs whitespace-nowrap ${files.length >= MAX_IMAGES ? 'text-red-400' : 'text-gray-500'}`}>
                {files.length}/{MAX_IMAGES}
              </span>
            </div>

            {files.length > 0 && (
              <div className="mt-2 space-y-2">
                {files.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 bg-gray-800/30 rounded-lg p-2">
                    <img src={URL.createObjectURL(f)} alt="" className="w-10 h-10 rounded object-cover" />
                    <span className="text-xs flex-1 truncate">{f.name}</span>
                    <select value={perspectives[i]} onChange={e => {
                      const np = [...perspectives]; np[i] = e.target.value; setPerspectives(np);
                    }} className="bg-gray-800 border border-white/10 rounded px-2 py-1 text-xs">
                      {PERSPECTIVES.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <button onClick={() => removeFile(i)} className="text-red-400 text-xs px-1">✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-2 mt-6">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-white/10 text-sm hover:bg-white/5">
            Abbrechen
          </button>
          <button onClick={submit} disabled={saving || !name.trim()}
            className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-purple-700 text-sm font-medium disabled:opacity-50 hover:from-purple-700 hover:to-purple-800">
            {saving ? 'Speichern...' : 'Material erstellen'}
          </button>
        </div>
      </div>
    </div>
  );
}
