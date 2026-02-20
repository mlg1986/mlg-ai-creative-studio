import { useState } from 'react';

export interface PromptPreviewData {
  enrichedPrompt: string;
  imagePrompt: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  data: PromptPreviewData | null;
  loading?: boolean;
  onGenerateImage?: () => void;
  showGenerateButton?: boolean;
}

type Tab = 'enriched' | 'full';

export function PromptPreviewModal({
  open,
  onClose,
  data,
  loading = false,
  onGenerateImage,
  showGenerateButton = false,
}: Props) {
  const [tab, setTab] = useState<Tab>('enriched');
  const [copied, setCopied] = useState(false);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (!open) return null;

  const text = data
    ? tab === 'enriched'
      ? data.enrichedPrompt
      : data.imagePrompt
    : '';

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-[#1a1a2e] rounded-xl border border-white/10 w-full max-w-2xl max-h-[85vh] flex flex-col shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-4 border-b border-white/10 flex items-center justify-between flex-shrink-0">
          <h2 className="text-lg font-semibold text-gray-100">Prompt-Vorschau</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg border border-white/10 text-gray-400 hover:text-white hover:bg-white/5"
            aria-label="Schließen"
          >
            ✕
          </button>
        </div>

        <div className="flex border-b border-white/5 flex-shrink-0">
          <button
            type="button"
            onClick={() => setTab('enriched')}
            className={`px-4 py-2.5 text-sm font-medium ${tab === 'enriched' ? 'text-purple-400 border-b-2 border-purple-500 bg-white/5' : 'text-gray-400 hover:text-gray-200'}`}
          >
            Szenen-Prompt (KI)
          </button>
          <button
            type="button"
            onClick={() => setTab('full')}
            className={`px-4 py-2.5 text-sm font-medium ${tab === 'full' ? 'text-purple-400 border-b-2 border-purple-500 bg-white/5' : 'text-gray-400 hover:text-gray-200'}`}
          >
            Vollständiger Bild-Prompt
          </button>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col min-h-0 p-4">
          {loading && !data ? (
            <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
              Prompt wird generiert…
            </div>
          ) : data ? (
            <>
              <div className="flex items-center justify-end gap-2 mb-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => copyToClipboard(text)}
                  className="px-3 py-1.5 rounded-lg border border-white/10 text-xs text-gray-300 hover:bg-white/5"
                >
                  {copied ? 'Kopiert!' : 'Kopieren'}
                </button>
              </div>
              <pre className="flex-1 overflow-auto rounded-lg bg-gray-900/50 border border-white/5 p-4 text-xs text-gray-300 whitespace-pre-wrap font-sans">
                {text}
              </pre>
            </>
          ) : null}
        </div>

        <div className="p-4 border-t border-white/10 flex gap-2 flex-shrink-0">
          {showGenerateButton && onGenerateImage ? (
            <>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2.5 rounded-lg border border-white/10 text-sm hover:bg-white/5"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={() => {
                  onGenerateImage();
                  onClose();
                }}
                className="flex-1 px-4 py-2.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-sm font-medium"
              >
                Bild generieren
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="w-full px-4 py-2.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-sm font-medium"
            >
              Schließen
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
