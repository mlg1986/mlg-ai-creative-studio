import { useState, useEffect } from 'react';
import { api } from '../../services/api';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ApiKeyModal({ open, onClose }: Props) {
  const [apiKey, setApiKey] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [source, setSource] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      api.settings.getApiKeyStatus().then(s => {
        setHasKey(s.hasApiKey);
        setSource(s.source);
      });
    }
  }, [open]);

  const save = async () => {
    setSaving(true);
    try {
      await api.settings.setApiKey(apiKey);
      setHasKey(true);
      setSource('database');
      setApiKey('');
      onClose();
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-[#1a1a2e] rounded-xl border border-white/10 p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-4">API Key Settings</h2>

        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <div className={`w-2 h-2 rounded-full ${hasKey ? 'bg-green-400' : 'bg-red-400'}`} />
            <span className="text-sm text-gray-300">
              {hasKey ? `API Key gesetzt (${source})` : 'Kein API Key konfiguriert'}
            </span>
          </div>
        </div>

        <div className="mb-4">
          <label className="label-uppercase block mb-2">Gemini API Key</label>
          <input
            type="password"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder="AIza..."
            className="w-full bg-gray-800/50 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
          />
          <p className="text-xs text-gray-500 mt-1">Der Key wird in der Datenbank gespeichert und überschreibt den .env-Wert.</p>
        </div>

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg border border-white/10 text-sm hover:bg-white/5">
            Abbrechen
          </button>
          <button onClick={save} disabled={saving || !apiKey.trim()}
            className="flex-1 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-sm font-medium disabled:opacity-50">
            {saving ? 'Speichern...' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  );
}
