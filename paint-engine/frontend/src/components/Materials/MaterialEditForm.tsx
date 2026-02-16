import { useState, useEffect } from 'react';
import { Material, MaterialImage, MaterialCategory, CATEGORY_LABELS, PERSPECTIVES } from '../../types';
import { api } from '../../services/api';

interface Props {
  material: Material;
  onClose: () => void;
  onSaved: () => void;
}

export function MaterialEditForm({ material, onClose, onSaved }: Props) {
  const [name, setName] = useState(material.name);
  const [category, setCategory] = useState<MaterialCategory>(material.category as MaterialCategory);
  const [description, setDescription] = useState(material.description || '');
  const [materialType, setMaterialType] = useState(material.material_type || '');
  const [dimensions, setDimensions] = useState(material.dimensions || '');
  const [surface, setSurface] = useState(material.surface || '');
  const [weight, setWeight] = useState(material.weight || '');
  const [color, setColor] = useState(material.color || '');
  const [formatCode, setFormatCode] = useState(material.format_code || '');
  const [size, setSize] = useState(material.size || '');
  const [frameOption, setFrameOption] = useState(material.frame_option || '');

  // Existing images from DB
  const [existingImages, setExistingImages] = useState<MaterialImage[]>(material.images || []);
  // New files to upload
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [newPerspectives, setNewPerspectives] = useState<string[]>([]);

  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'details' | 'images'>('details');

  // Refresh images when material changes
  useEffect(() => {
    setExistingImages(material.images || []);
  }, [material]);

  const MAX_IMAGES = 14;
  const totalImages = existingImages.length + newFiles.length;

  const handleNewFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const remaining = MAX_IMAGES - totalImages;
    const toAdd = files.slice(0, remaining);
    if (toAdd.length === 0) return;
    setNewFiles(prev => [...prev, ...toAdd]);
    setNewPerspectives(prev => [...prev, ...toAdd.map(() => 'front')]);
  };

  const removeNewFile = (index: number) => {
    setNewFiles(prev => prev.filter((_, i) => i !== index));
    setNewPerspectives(prev => prev.filter((_, i) => i !== index));
  };

  const deleteExistingImage = async (imageId: string) => {
    try {
      await api.materials.deleteImage(material.id, imageId);
      setExistingImages(prev => prev.filter(img => img.id !== imageId));
    } catch { /* toast shown */ }
  };

  const saveMetadata = async () => {
    if (!name.trim()) return;
    setSaving(true);

    try {
      // 1. Update metadata
      await api.materials.update(material.id, {
        name,
        category,
        description: description || undefined,
        material_type: materialType || undefined,
        dimensions: dimensions || undefined,
        surface: surface || undefined,
        weight: weight || undefined,
        color: color || undefined,
        format_code: category === 'mnz_motif' ? formatCode || undefined : undefined,
        size: category === 'mnz_motif' ? size || undefined : undefined,
        frame_option: category === 'mnz_motif' ? frameOption || undefined : undefined,
      });

      // 2. Upload new images if any
      if (newFiles.length > 0) {
        const formData = new FormData();
        newFiles.forEach(f => formData.append('images', f));
        formData.append('perspectives', JSON.stringify(newPerspectives));
        await api.materials.addImages(material.id, formData);
        setNewFiles([]);
        setNewPerspectives([]);
      }

      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const inputClass = 'w-full bg-gray-800/50 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500';

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 overflow-y-auto p-4" onClick={onClose}>
      <div className="bg-[#1a1a2e] rounded-xl border border-white/10 p-6 w-full max-w-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Material bearbeiten</h2>
          <span className={`text-[10px] px-2 py-0.5 rounded-full ${
            material.status === 'engaged' ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'
          }`}>
            {material.status.toUpperCase()}
          </span>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 bg-gray-800/30 rounded-lg p-1">
          <button
            onClick={() => setActiveTab('details')}
            className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-all ${
              activeTab === 'details' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            Details & Metadaten
          </button>
          <button
            onClick={() => setActiveTab('images')}
            className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-all ${
              activeTab === 'images' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            Referenzbilder ({existingImages.length + newFiles.length})
          </button>
        </div>

        {activeTab === 'details' && (
          <div className="space-y-3">
            <div>
              <label className="label-uppercase block mb-1">Name *</label>
              <input value={name} onChange={e => setName(e.target.value)} className={inputClass} placeholder="z.B. Acryl-Farbtopf (3ml)" />
            </div>

            <div>
              <label className="label-uppercase block mb-1">Kategorie *</label>
              <select value={category} onChange={e => setCategory(e.target.value as MaterialCategory)} className={inputClass}>
                {Object.entries(CATEGORY_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="label-uppercase block mb-1">Beschreibung</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)}
                className={`${inputClass} resize-none h-16`}
                placeholder="Optionale Beschreibung..." />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label-uppercase block mb-1">Material-Typ</label>
                <input value={materialType} onChange={e => setMaterialType(e.target.value)} className={inputClass} placeholder="z.B. Plastik (PP)" />
              </div>
              <div>
                <label className="label-uppercase block mb-1">Maße</label>
                <input value={dimensions} onChange={e => setDimensions(e.target.value)} className={inputClass} placeholder="z.B. Ø 20mm × 15mm" />
              </div>
              <div>
                <label className="label-uppercase block mb-1">Oberfläche</label>
                <input value={surface} onChange={e => setSurface(e.target.value)} className={inputClass} placeholder="z.B. Glatt, glänzend" />
              </div>
              <div>
                <label className="label-uppercase block mb-1">Gewicht</label>
                <input value={weight} onChange={e => setWeight(e.target.value)} className={inputClass} placeholder="z.B. ~8g" />
              </div>
            </div>

            <div>
              <label className="label-uppercase block mb-1">Farbe</label>
              <input value={color} onChange={e => setColor(e.target.value)} className={inputClass} placeholder="z.B. Inhalt variabel, Deckel weiß" />
            </div>

            {category === 'mnz_motif' && (
              <div className="p-3 bg-purple-500/5 rounded-lg border border-purple-500/20">
                <div className="label-uppercase mb-2 text-purple-400">MNZ-spezifische Felder</div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="label-uppercase block mb-1">Format</label>
                    <select value={formatCode} onChange={e => setFormatCode(e.target.value)}
                      className={`${inputClass} text-xs`}>
                      <option value="">-</option>
                      <option value="1TK">1TK (Klassik 3:2)</option>
                      <option value="1TP">1TP (Panorama 2:1)</option>
                      <option value="1TQ">1TQ (Quadrat 1:1)</option>
                    </select>
                  </div>
                  <div>
                    <label className="label-uppercase block mb-1">Größe</label>
                    <input value={size} onChange={e => setSize(e.target.value)} placeholder="60x40"
                      className={`${inputClass} text-xs`} />
                  </div>
                  <div>
                    <label className="label-uppercase block mb-1">Rahmen</label>
                    <select value={frameOption} onChange={e => setFrameOption(e.target.value)}
                      className={`${inputClass} text-xs`}>
                      <option value="">-</option>
                      <option value="OR">Vorlage (OR)</option>
                      <option value="R">Gerahmt (R)</option>
                      <option value="DIYR">Ausmalen (DIYR)</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'images' && (
          <div className="space-y-3">
            {/* Info box about reference images */}
            <div className="p-3 bg-blue-500/5 rounded-lg border border-blue-500/20 text-xs text-blue-300">
              <strong>Hinweis:</strong> Referenzbilder zeigen der KI, wie dieses Material physisch aussieht (Form, Oberfläche, Proportionen).
              Die KI nutzt sie als Orientierung – nicht als 1:1 Kopiervorlage.
              {category === 'mnz_motif' && (
                <span className="block mt-1 text-purple-300">
                  <strong>MNZ-Motive:</strong> Die hochgeladenen Bilder dienen nur als Beispiel für Format und Aussehen.
                  Die KI generiert ein eigenes Motiv in der Szene.
                </span>
              )}
              {category === 'paint_pots' && (
                <span className="block mt-1 text-purple-300">
                  <strong>Farbtöpfe:</strong> Die KI wird Farbnummern-Labels auf den Deckeln generieren.
                </span>
              )}
            </div>

            {/* Existing images */}
            {existingImages.length > 0 && (
              <div>
                <label className="label-uppercase block mb-2">Vorhandene Bilder</label>
                <div className="grid grid-cols-3 gap-2">
                  {existingImages.map(img => (
                    <div key={img.id} className="relative group rounded-xl overflow-hidden border border-white/10">
                      <img src={img.image_path} alt={img.perspective} className="w-full aspect-square object-cover" />
                      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 p-1.5 flex items-center justify-between">
                        <span className="text-[10px] text-gray-300">{img.perspective}</span>
                        {img.is_primary ? (
                          <span className="text-[10px] text-purple-400">Primary</span>
                        ) : null}
                      </div>
                      <button
                        onClick={() => deleteExistingImage(img.id)}
                        className="absolute top-1 right-1 bg-red-600/80 hover:bg-red-600 rounded-full w-5 h-5 flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Upload new images */}
            <div>
              <label className="label-uppercase block mb-2">Neue Bilder hinzufügen</label>
              <div className="flex items-center gap-2">
                <input type="file" accept="image/*" multiple onChange={handleNewFiles}
                  disabled={totalImages >= MAX_IMAGES}
                  className="flex-1 text-sm text-gray-400 file:mr-4 file:py-1.5 file:px-4 file:rounded-lg file:border-0 file:text-sm file:bg-purple-600 file:text-white hover:file:bg-purple-700 disabled:opacity-40" />
                <span className={`text-xs whitespace-nowrap ${totalImages >= MAX_IMAGES ? 'text-red-400' : 'text-gray-500'}`}>
                  {totalImages}/{MAX_IMAGES}
                </span>
              </div>

              {newFiles.length > 0 && (
                <div className="mt-2 space-y-2">
                  {newFiles.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 bg-gray-800/30 rounded-lg p-2">
                      <img src={URL.createObjectURL(f)} alt="" className="w-10 h-10 rounded object-cover" />
                      <span className="text-xs flex-1 truncate">{f.name}</span>
                      <select value={newPerspectives[i]} onChange={e => {
                        const np = [...newPerspectives]; np[i] = e.target.value; setNewPerspectives(np);
                      }} className="bg-gray-800 border border-white/10 rounded px-2 py-1 text-xs">
                        {PERSPECTIVES.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                      <button onClick={() => removeNewFile(i)} className="text-red-400 text-xs px-1">✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 mt-6">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-white/10 text-sm hover:bg-white/5">
            Abbrechen
          </button>
          <button onClick={saveMetadata} disabled={saving || !name.trim()}
            className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-purple-700 text-sm font-medium disabled:opacity-50 hover:from-purple-700 hover:to-purple-800">
            {saving ? 'Speichern...' : 'Änderungen speichern'}
          </button>
        </div>
      </div>
    </div>
  );
}
