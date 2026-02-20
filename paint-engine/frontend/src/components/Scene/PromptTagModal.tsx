import { useState, useEffect } from 'react';
import { PromptTag } from '../../types';
import { api, showToast } from '../../services/api';

const CATEGORY_OPTIONS: { id: string; name: string }[] = [
  { id: 'context', name: 'Zweck / Kontext' },
  { id: 'lifestyle', name: 'Akteure & Lifestyle' },
  { id: 'lighting', name: 'Licht & Stimmung' },
  { id: 'composition', name: 'Komposition' },
];

type Mode = 'create' | 'view' | 'edit';

interface Props {
  open: boolean;
  onClose: () => void;
  tag: PromptTag | null;
  mode: Mode;
  onSaved: () => void;
}

export function PromptTagModal({ open, onClose, tag, mode, onSaved }: Props) {
  const [label, setLabel] = useState('');
  const [prompt, setPrompt] = useState('');
  const [categoryId, setCategoryId] = useState('context');
  const [saving, setSaving] = useState(false);
  const [savingCopy, setSavingCopy] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [effectiveMode, setEffectiveMode] = useState<Mode>(mode);
  const isBuiltin = tag?.is_builtin === 1;
  const readOnly = effectiveMode === 'view';
  const isCreate = effectiveMode === 'create';

  useEffect(() => {
    if (open) setEffectiveMode(mode);
  }, [open, mode]);

  useEffect(() => {
    if (!open) return;
    if (tag) {
      setLabel(tag.label);
      setPrompt(tag.prompt);
      setCategoryId(tag.category_id);
    } else {
      setLabel('');
      setPrompt('');
      setCategoryId('context');
    }
  }, [open, tag]);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (isCreate) {
        await api.promptTags.create({
          category_id: categoryId,
          label: label.trim(),
          prompt: prompt.trim(),
        });
      } else if (tag && !readOnly) {
        await api.promptTags.update(tag.id, {
          category_id: categoryId,
          label: label.trim(),
          prompt: prompt.trim(),
        });
      }
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!tag || isBuiltin) return;
    if (!confirm(`Szene-Element „${tag.label}" wirklich löschen?`)) return;
    setDeleting(true);
    try {
      await api.promptTags.delete(tag.id);
      onSaved();
      onClose();
    } finally {
      setDeleting(false);
    }
  };

  const handleSaveAsCopy = async () => {
    setSavingCopy(true);
    try {
      const baseLabel = label.trim() || 'Element';
      const existing = await api.promptTags.getAll();
      const copyBase = `${baseLabel} (Kopie)`;
      const used = new Set(existing.map(t => t.label));
      let copyLabel = copyBase;
      if (used.has(copyLabel)) {
        let n = 2;
        while (used.has(`${baseLabel} (Kopie ${n})`)) n++;
        copyLabel = `${baseLabel} (Kopie ${n})`;
      }
      await api.promptTags.create({
        category_id: categoryId,
        label: copyLabel,
        prompt: prompt.trim(),
      });
      showToast({ type: 'success', title: 'Element gespeichert', message: `„${copyLabel}" wurde als eigenes Element angelegt.` });
      onSaved();
      onClose();
    } finally {
      setSavingCopy(false);
    }
  };

  if (!open) return null;

  const title = isCreate ? 'Neues Szene-Element' : readOnly ? 'Prompt anzeigen' : 'Szene-Element bearbeiten';
  const inputClass = readOnly
    ? 'w-full bg-gray-800/30 border border-white/5 rounded-lg px-3 py-2 text-sm text-gray-300 cursor-default focus:outline-none focus:ring-0 resize-none'
    : 'w-full bg-gray-800/50 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500 resize-y';

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-[#1a1a2e] rounded-xl border border-white/10 p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold mb-4">{title}</h2>

        <div className="space-y-4">
          <div>
            <label className="label-uppercase block mb-1">Label (Anzeigename)</label>
            <input
              value={label}
              onChange={e => setLabel(e.target.value)}
              readOnly={readOnly}
              placeholder="z. B. Shop Banner Desktop"
              className={inputClass}
            />
          </div>
          {(isCreate || !readOnly) && (
            <div>
              <label className="label-uppercase block mb-1">Kategorie</label>
              <select
                value={categoryId}
                onChange={e => setCategoryId(e.target.value)}
                disabled={readOnly}
                className={inputClass}
              >
                {CATEGORY_OPTIONS.map(opt => (
                  <option key={opt.id} value={opt.id}>{opt.name}</option>
                ))}
              </select>
            </div>
          )}
          {!isCreate && readOnly && (
            <div>
              <label className="label-uppercase block mb-1">Kategorie</label>
              <div className="w-full bg-gray-800/30 border border-white/5 rounded-lg px-3 py-2 text-sm text-gray-300">
                {CATEGORY_OPTIONS.find(c => c.id === categoryId)?.name ?? categoryId}
              </div>
            </div>
          )}
          <div>
            <label className="label-uppercase block mb-1">Prompt</label>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              readOnly={readOnly}
              rows={5}
              placeholder="Text für die Bildgeneration (z. B. auf Englisch)"
              className={inputClass}
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 mt-6">
          <div>
            {!isCreate && !isBuiltin && !readOnly && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="px-3 py-2 rounded-lg border border-red-500/50 text-red-400 text-sm hover:bg-red-500/10 disabled:opacity-50"
              >
                {deleting ? 'Löschen…' : 'Löschen'}
              </button>
            )}
          </div>
          <div className="flex gap-2">
            {readOnly && tag && (
              <button
                type="button"
                onClick={() => setEffectiveMode('edit')}
                className="px-4 py-2 rounded-lg border border-purple-500/50 text-purple-400 text-sm hover:bg-purple-500/10"
              >
                Bearbeiten
              </button>
            )}
            {readOnly && tag && isBuiltin && (
              <button
                type="button"
                onClick={handleSaveAsCopy}
                disabled={savingCopy || !prompt.trim()}
                className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-sm font-medium disabled:opacity-50"
              >
                {savingCopy ? 'Speichern…' : 'Als eigenes Element speichern'}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-white/10 text-sm hover:bg-white/5"
            >
              {readOnly ? 'Schließen' : 'Abbrechen'}
            </button>
            {!readOnly && (
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !label.trim() || !prompt.trim()}
                className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-sm font-medium disabled:opacity-50"
              >
                {saving ? 'Speichern…' : 'Speichern'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
