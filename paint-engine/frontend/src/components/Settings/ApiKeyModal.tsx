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
  const [replicateApiKey, setReplicateApiKey] = useState('');
  const [hasReplicateKey, setHasReplicateKey] = useState(false);
  const [replicateSource, setReplicateSource] = useState('');
  const [openaiApiKey, setOpenaiApiKey] = useState('');
  const [hasOpenAIKey, setHasOpenAIKey] = useState(false);
  const [openaiSource, setOpenaiSource] = useState('');
  const [imageProvider, setImageProvider] = useState('gemini');
  const [replicateFluxVersion, setReplicateFluxVersion] = useState<'1' | '2pro' | 'grok'>('1');
  const [availableImageProviders, setAvailableImageProviders] = useState<string[]>(['gemini', 'replicate']);
  const [loraUrl, setLoraUrl] = useState('');
  const [loraTriggerWord, setLoraTriggerWord] = useState('');
  const [loraScale, setLoraScale] = useState(1);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      api.settings.getApiKeyStatus().then(s => {
        setHasKey(s.hasApiKey);
        setSource(s.source);
      });
      api.settings.getReplicateKeyStatus().then(s => {
        setHasReplicateKey(s.hasApiKey);
        setReplicateSource(s.source);
      });
      api.settings.getOpenAIKeyStatus().then(s => {
        setHasOpenAIKey(s.hasApiKey);
        setOpenaiSource(s.source);
      });
      api.settings.getProviders().then(p => {
        setImageProvider(p.imageProvider);
        setReplicateFluxVersion((p.replicateFluxVersion === 'grok' || p.replicateFluxVersion === '2pro' || p.replicateFluxVersion === '1') ? p.replicateFluxVersion : '2pro');
        setAvailableImageProviders(p.availableImageProviders || ['gemini', 'replicate']);
      });
      api.settings.getLoraConfig().then(c => {
        setLoraUrl(c.loraUrl || '');
        setLoraTriggerWord(c.loraTriggerWord || '');
        setLoraScale(typeof c.loraScale === 'number' ? c.loraScale : 1);
      });
    }
  }, [open]);

  const save = async () => {
    setSaving(true);
    try {
      if (apiKey.trim()) {
        await api.settings.setApiKey(apiKey);
        setHasKey(true);
        setSource('database');
        setApiKey('');
      }
      if (replicateApiKey.trim()) {
        await api.settings.setReplicateKey(replicateApiKey.trim());
        setHasReplicateKey(true);
        setReplicateSource('database');
        setReplicateApiKey('');
      }
      if (openaiApiKey.trim()) {
        await api.settings.setOpenAIKey(openaiApiKey.trim());
        setHasOpenAIKey(true);
        setOpenaiSource('database');
        setOpenaiApiKey('');
      }
      await api.settings.setImageProvider(imageProvider, imageProvider === 'replicate' ? replicateFluxVersion : undefined);
      if (imageProvider === 'replicate') {
        await api.settings.setLoraConfig({
          loraUrl: loraUrl.trim() || undefined,
          loraTriggerWord: loraTriggerWord.trim() || undefined,
          loraScale,
        });
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-[#1a1a2e] rounded-xl border border-white/10 p-6 w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-4">Einstellungen</h2>

        {/* Gemini API Key */}
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <div className={`w-2 h-2 rounded-full ${hasKey ? 'bg-green-400' : 'bg-red-400'}`} />
            <span className="text-sm text-gray-300">
              {hasKey ? `Gemini API Key gesetzt (${source})` : 'Kein Gemini API Key'}
            </span>
          </div>
          <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Gemini API Key</label>
          <input
            type="password"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder="AIza..."
            className="w-full bg-gray-800/50 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
          />
          <p className="text-xs text-gray-500 mt-1">Fuer Scene Intelligence und Bildgenerierung (Gemini).</p>
        </div>

        {/* OpenAI API Key (ChatGPT) – Alternative fuer Prompt-Generierung */}
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <div className={`w-2 h-2 rounded-full ${hasOpenAIKey ? 'bg-green-400' : 'bg-amber-400/80'}`} />
            <span className="text-sm text-gray-300">
              {hasOpenAIKey ? `OpenAI API Key gesetzt (${openaiSource})` : 'Kein OpenAI API Key'}
            </span>
          </div>
          <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">OpenAI API Key (ChatGPT)</label>
          <input
            type="password"
            value={openaiApiKey}
            onChange={e => setOpenaiApiKey(e.target.value)}
            placeholder="sk-..."
            className="w-full bg-gray-800/50 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
          />
          <p className="text-xs text-gray-500 mt-1">Optional: Wird fuer die Prompt-Generierung (Scene Intelligence) genutzt; bei beiden Keys wird zuerst Gemini genutzt, bei Fehler automatisch ChatGPT.</p>
        </div>

        {/* Test Prompt Keys */}
        <div className="mb-4">
          <button
            type="button"
            onClick={async () => {
              try {
                const r = await api.settings.testPromptKeys();
                const parts: string[] = [];
                if (r.gemini !== undefined) parts.push(`Gemini: ${r.gemini.ok ? 'OK' : r.gemini.error || 'Fehler'}`);
                if (r.openai !== undefined) parts.push(`ChatGPT: ${r.openai.ok ? 'OK' : r.openai.error || 'Fehler'}`);
                alert(parts.length ? parts.join('\n') : 'Kein API-Key fuer Prompt-Generierung gesetzt.');
              } catch (e: any) {
                const msg = e?.error?.message ?? e?.message ?? String(e);
                alert('Test fehlgeschlagen: ' + msg);
              }
            }}
            className="w-full px-3 py-2 rounded-lg border border-white/10 text-sm text-gray-300 hover:bg-white/5"
          >
            Prompt-Keys testen (Gemini / ChatGPT)
          </button>
          <p className="text-xs text-gray-500 mt-1">Prueft, ob die Keys fuer die Prompt-Generierung erreichbar sind.</p>
        </div>

        {/* Replicate API Key */}
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <div className={`w-2 h-2 rounded-full ${hasReplicateKey ? 'bg-green-400' : 'bg-red-400'}`} />
            <span className="text-sm text-gray-300">
              {hasReplicateKey ? `Replicate API Key gesetzt (${replicateSource})` : 'Kein Replicate API Key'}
            </span>
          </div>
          <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Replicate API Key</label>
          <input
            type="password"
            value={replicateApiKey}
            onChange={e => setReplicateApiKey(e.target.value)}
            placeholder="r8_..."
            className="w-full bg-gray-800/50 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
          />
          <p className="text-xs text-gray-500 mt-1">Erforderlich wenn Bild-Provider „Replicate“ gewaehlt ist.</p>
        </div>

        {/* Bild-Provider */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Bild-Provider</label>
          <select
            value={imageProvider}
            onChange={e => setImageProvider(e.target.value)}
            className="w-full bg-gray-800/50 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
          >
            {availableImageProviders.map(p => (
              <option key={p} value={p}>{p === 'gemini' ? 'Gemini' : p === 'replicate' ? 'Replicate (FLUX)' : p}</option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">Bei Replicate weniger Content-Einschraenkungen (z. B. fuer Motive).</p>
        </div>

        {/* Replicate-Modell (FLUX / Grok) */}
        {imageProvider === 'replicate' && (
          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Replicate-Modell</label>
            <select
              value={replicateFluxVersion}
              onChange={e => setReplicateFluxVersion(e.target.value as '1' | '2pro' | 'grok')}
              className="w-full bg-gray-800/50 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
            >
              <option value="1">FLUX 1.1 (LoRA)</option>
              <option value="2pro">FLUX 2 Pro (Referenzbilder)</option>
              <option value="grok">Grok (xAI)</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">
              {replicateFluxVersion === '2pro'
                ? 'Motive und Materialien werden als Referenzbilder uebergeben; LoRA wird nicht genutzt.'
                : replicateFluxVersion === 'grok'
                  ? 'Grok (xAI) ueber Replicate; bis zu 10 Referenzbilder, sofern vom Modell unterstuetzt.'
                  : 'Mit LoRA fuer Tiegel/Pinsel; Referenzbilder werden nicht an Replicate gesendet.'}
            </p>
          </div>
        )}

        {/* LoRA (nur bei Replicate + FLUX 1.1) */}
        {imageProvider === 'replicate' && replicateFluxVersion === '1' && (
          <div className="mb-4 p-3 rounded-lg bg-gray-800/30 border border-white/5">
            <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">LoRA (z. B. Tiegel)</label>
            <input
              type="text"
              value={loraUrl}
              onChange={e => setLoraUrl(e.target.value)}
              placeholder="https://replicate.com/... oder HuggingFace-URL"
              className="w-full bg-gray-800/50 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500 mb-2"
            />
            <input
              type="text"
              value={loraTriggerWord}
              onChange={e => setLoraTriggerWord(e.target.value)}
              placeholder="Trigger-Wort (z. B. mlg_tiegel)"
              className="w-full bg-gray-800/50 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500 mb-2"
            />
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-400">LoRA-Staerke:</label>
              <input
                type="number"
                min={0}
                max={2}
                step={0.1}
                value={loraScale}
                onChange={e => setLoraScale(parseFloat(e.target.value) || 1)}
                className="w-20 bg-gray-800/50 border border-white/10 rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-purple-500"
              />
            </div>
            <p className="text-xs text-gray-500 mt-2">LoRA auf replicate.com mit dem Fast Flux Trainer trainieren und URL sowie Trigger-Wort hier eintragen.</p>
          </div>
        )}

        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg border border-white/10 text-sm hover:bg-white/5">
            Abbrechen
          </button>
          <button onClick={save} disabled={saving}
            className="flex-1 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-sm font-medium disabled:opacity-50">
            {saving ? 'Speichern...' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  );
}
