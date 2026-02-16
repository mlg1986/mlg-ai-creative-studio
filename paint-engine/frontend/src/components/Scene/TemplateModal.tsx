import { useState, useEffect } from 'react';
import { SceneTemplate } from '../../types';
import { api, showToast } from '../../services/api';

type Mode = 'create' | 'view' | 'edit';

interface Props {
  open: boolean;
  onClose: () => void;
  template: SceneTemplate | null;
  mode: Mode;
  onSaved: () => void;
}

const emptyTemplate: Omit<SceneTemplate, 'id' | 'is_builtin'> = {
  name: '',
  icon: '📷',
  description: '',
  prompt_template: '',
  typical_use: '',
};

export function TemplateModal({ open, onClose, template, mode, onSaved }: Props) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('📷');
  const [description, setDescription] = useState('');
  const [promptTemplate, setPromptTemplate] = useState('');
  const [typicalUse, setTypicalUse] = useState('');
  const [saving, setSaving] = useState(false);
  const [savingCopy, setSavingCopy] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [effectiveMode, setEffectiveMode] = useState<Mode>(mode);
  const isBuiltin = template?.is_builtin === 1;
  const readOnly = effectiveMode === 'view';
  const isCreate = effectiveMode === 'create';

  useEffect(() => {
    if (open) setEffectiveMode(mode);
  }, [open, mode]);

  useEffect(() => {
    if (!open) return;
    if (template) {
      setName(template.name);
      setIcon(template.icon);
      setDescription(template.description || '');
      setPromptTemplate(template.prompt_template || '');
      setTypicalUse(template.typical_use || '');
    } else {
      setName(emptyTemplate.name);
      setIcon(emptyTemplate.icon);
      setDescription(emptyTemplate.description);
      setPromptTemplate(emptyTemplate.prompt_template);
      setTypicalUse(emptyTemplate.typical_use);
    }
  }, [open, template]);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (isCreate) {
        await api.templates.create({
          name: name.trim(),
          icon: icon.trim() || '📷',
          description: description.trim(),
          prompt_template: promptTemplate.trim(),
          typical_use: typicalUse.trim(),
        });
      } else if (template && !readOnly) {
        await api.templates.update(template.id, {
          name: name.trim(),
          icon: icon.trim() || '📷',
          description: description.trim(),
          prompt_template: promptTemplate.trim(),
          typical_use: typicalUse.trim(),
        });
      }
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!template || isBuiltin) return;
    if (!confirm(`Template „${template.name}" wirklich löschen?`)) return;
    setDeleting(true);
    try {
      await api.templates.delete(template.id);
      onSaved();
      onClose();
    } finally {
      setDeleting(false);
    }
  };

  const handleSaveAsCopy = async () => {
    setSavingCopy(true);
    try {
      const baseName = name.trim() || 'Vorlage';
      const existing = await api.templates.getAll();
      const copyBase = `${baseName} (Kopie)`;
      const used = new Set(existing.map(t => t.name));
      let copyName = copyBase;
      if (used.has(copyName)) {
        let n = 2;
        while (used.has(`${baseName} (Kopie ${n})`)) n++;
        copyName = `${baseName} (Kopie ${n})`;
      }
      await api.templates.create({
        name: copyName,
        icon: icon.trim() || '📷',
        description: description.trim(),
        prompt_template: promptTemplate.trim(),
        typical_use: typicalUse.trim(),
      });
      showToast({ type: 'success', title: 'Vorlage gespeichert', message: `„${copyName}" wurde als eigene Vorlage angelegt.` });
      onSaved();
      onClose();
    } finally {
      setSavingCopy(false);
    }
  };

  if (!open) return null;

  const title = isCreate ? 'Neues Scene-Template' : readOnly ? 'Prompt anzeigen' : 'Template bearbeiten';
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
            <label className="label-uppercase block mb-1">Name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              readOnly={readOnly}
              placeholder="z. B. Produktfoto"
              className={inputClass}
            />
          </div>
          <div className="flex gap-4">
            <div className="w-20">
              <label className="label-uppercase block mb-1">Icon</label>
              <input
                value={icon}
                onChange={e => setIcon(e.target.value)}
                readOnly={readOnly}
                className={readOnly ? 'w-full bg-gray-800/30 border border-white/5 rounded-lg px-2 py-2 text-lg text-center text-gray-300 cursor-default focus:outline-none' : 'w-full bg-gray-800/50 border border-white/10 rounded-lg px-2 py-2 text-lg text-center focus:outline-none focus:border-purple-500'}
              />
            </div>
            <div className="flex-1">
              <label className="label-uppercase block mb-1">Typische Nutzung</label>
              <input
                value={typicalUse}
                onChange={e => setTypicalUse(e.target.value)}
                readOnly={readOnly}
                placeholder="z. B. Shop, Social"
                className={inputClass}
              />
            </div>
          </div>
          {!isCreate && (
            <div>
              <label className="label-uppercase block mb-1">Beschreibung</label>
              <input
                value={description}
                onChange={e => setDescription(e.target.value)}
                readOnly={readOnly}
                placeholder="Optionale Beschreibung"
                className={inputClass}
              />
            </div>
          )}
          <div>
            <label className="label-uppercase block mb-1">Prompt-Template</label>
            <textarea
              value={promptTemplate}
              onChange={e => setPromptTemplate(e.target.value)}
              readOnly={readOnly}
              rows={6}
              placeholder="z. B. Professional product photography. {materials} ..."
              className={inputClass}
            />
            <p className="text-[10px] text-gray-500 mt-1">Platzhalter: {'{materials}'} wird durch die gewählten Materialien ersetzt.</p>
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
            {readOnly && template && (
              <button
                type="button"
                onClick={() => setEffectiveMode('edit')}
                className="px-4 py-2 rounded-lg border border-purple-500/50 text-purple-400 text-sm hover:bg-purple-500/10"
              >
                Bearbeiten
              </button>
            )}
            {readOnly && template && isBuiltin && (
              <button
                type="button"
                onClick={handleSaveAsCopy}
                disabled={savingCopy || !promptTemplate.trim()}
                className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-sm font-medium disabled:opacity-50"
              >
                {savingCopy ? 'Speichern…' : 'Als eigene Vorlage speichern'}
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
                disabled={saving || !name.trim() || !promptTemplate.trim()}
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
