import { useState } from 'react';
import { ExportPreset } from '../../types';

interface Props {
  value: string;
  onChange: (val: string) => void;
  presets: ExportPreset[];
  onCreatePreset: (name: string, width: number, height: number) => Promise<any>;
  onDeletePreset: (id: string) => Promise<void>;
  /** When true, preset cannot be changed (e.g. when editing an existing scene). */
  disabled?: boolean;
}

export function ExportPresets({ value, onChange, presets, onCreatePreset, onDeletePreset, disabled = false }: Props) {
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newWidth, setNewWidth] = useState('1920');
  const [newHeight, setNewHeight] = useState('600');
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!newName.trim() || !newWidth || !newHeight) return;
    setSaving(true);
    try {
      const preset = await onCreatePreset(newName.trim(), parseInt(newWidth), parseInt(newHeight));
      onChange(preset.id);
      setShowAdd(false);
      setNewName('');
      setNewWidth('1920');
      setNewHeight('600');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (value === id) {
      onChange('free');
    }
    await onDeletePreset(id);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="label-uppercase">Export Preset</h3>
        {!disabled && (
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="w-6 h-6 rounded-md bg-purple-600 hover:bg-purple-700 flex items-center justify-center text-xs font-bold"
          >
            +
          </button>
        )}
      </div>

      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        className={`w-full bg-gray-800/50 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500 ${disabled ? 'opacity-70 cursor-not-allowed' : ''}`}
      >
        {presets.map(p => (
          <option key={p.id} value={p.id}>
            {p.name} {p.width}x{p.height}
          </option>
        ))}
      </select>
      {disabled && (
        <p className="mt-1 text-[10px] text-gray-500 italic">Format kann bei bestehenden Szenen nicht geändert werden.</p>
      )}

      {/* Custom presets list with delete */}
      {!disabled && presets.some(p => !p.is_builtin) && (
        <div className="mt-2 space-y-1">
          {presets.filter(p => !p.is_builtin).map(p => (
            <div key={p.id} className="flex items-center justify-between bg-gray-800/30 rounded-lg px-2 py-1">
              <span className="text-xs text-gray-300">{p.name} ({p.width}x{p.height})</span>
              <button onClick={() => handleDelete(p.id)} className="text-red-400 hover:text-red-300 text-xs px-1">
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add new preset form */}
      {!disabled && showAdd && (
        <div className="mt-2 p-3 bg-purple-500/5 rounded-lg border border-purple-500/20 space-y-2">
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Name (z.B. Shop Banner Desktop)"
            className="w-full bg-gray-800/50 border border-white/10 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-purple-500"
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-gray-500 block mb-0.5">Breite (px)</label>
              <input
                type="number"
                value={newWidth}
                onChange={e => setNewWidth(e.target.value)}
                min="100"
                max="4096"
                className="w-full bg-gray-800/50 border border-white/10 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-purple-500"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 block mb-0.5">Höhe (px)</label>
              <input
                type="number"
                value={newHeight}
                onChange={e => setNewHeight(e.target.value)}
                min="100"
                max="4096"
                className="w-full bg-gray-800/50 border border-white/10 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowAdd(false)}
              className="flex-1 px-3 py-1.5 rounded-lg border border-white/10 text-xs hover:bg-white/5"
            >
              Abbrechen
            </button>
            <button
              onClick={handleCreate}
              disabled={saving || !newName.trim()}
              className="flex-1 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-xs font-medium disabled:opacity-50"
            >
              {saving ? '...' : 'Erstellen'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
