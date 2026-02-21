import { useState, useEffect } from 'react';
import { Scene, VIDEO_STYLES } from '../../types';
import { api } from '../../services/api';

interface VideoProviderOption {
  id: string;
  label: string;
  costPerSecond: number;
}

interface Props {
  scene: Scene | null;
  onGenerate: (data: { videoStyle: string; videoPrompt?: string; durationSeconds: number; videoProvider?: string }) => void;
}

export function VideoPanel({ scene, onGenerate }: Props) {
  const [style, setStyle] = useState('cinematic');
  const [prompt, setPrompt] = useState('');
  const [duration, setDuration] = useState(8);
  const hasImage = scene?.image_status === 'done';
  const [expanded, setExpanded] = useState(true);
  const [videoProvider, setVideoProviderState] = useState('veo');
  const [availableVideoProviders, setAvailableVideoProviders] = useState<VideoProviderOption[]>([]);
  const [previewPrompt, setPreviewPrompt] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [usedPromptExpanded, setUsedPromptExpanded] = useState(false);

  useEffect(() => {
    api.settings.getProviders().then((p) => {
      setVideoProviderState(p.videoProvider || 'veo');
      setAvailableVideoProviders(p.availableVideoProviders || []);
    }).catch(() => {});
  }, []);

  const selectedOption = availableVideoProviders.find((o) => o.id === videoProvider) ?? { id: 'veo', label: 'Veo 3.1 (Google)', costPerSecond: 0.75 };
  const costEstimate = (duration * selectedOption.costPerSecond).toFixed(2);

  const handleVideoProviderChange = (id: string) => {
    setVideoProviderState(id);
    api.settings.setVideoProvider(id).catch(() => {});
  };

  const handlePreviewPrompt = async () => {
    if (!scene?.id) return;
    setPreviewLoading(true);
    setPreviewPrompt(null);
    try {
      const res = await api.scenes.previewVideoPrompt(scene.id, { videoStyle: style, videoPrompt: prompt || undefined });
      setPreviewPrompt(res.videoPrompt);
      setPreviewExpanded(true);
    } catch {
      setPreviewPrompt(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const usedPrompt = scene?.video_prompt_generated?.trim() || null;
  const showUsedPrompt = (scene?.video_status === 'done' || scene?.video_status === 'failed') && usedPrompt;

  return (
    <div className="bg-gray-900/30 rounded-2xl border border-white/5 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5"
      >
        <div className="flex items-center gap-2">
          <h3 className="label-uppercase">Video from Image</h3>
          <span className="text-[10px] bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded-full">{selectedOption.label}</span>
        </div>
        <span className="text-gray-500 text-sm">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4">
          {!hasImage && scene?.video_status !== 'generating' && scene?.video_status !== 'done' && (
            <div className="p-3 bg-amber-500/10 rounded-xl border border-amber-500/20 text-amber-200 text-sm">
              Zuerst ein Bild generieren, um ein Video zu erstellen.
            </div>
          )}
          {/* Video Status */}
          {scene?.video_status === 'generating' && (
            <div className="flex items-center gap-3 p-3 bg-purple-500/10 rounded-xl border border-purple-500/20">
              <div className="w-5 h-5 rounded-full border-2 border-purple-500 border-t-transparent animate-spin" />
              <div>
                <div className="text-sm text-purple-400 font-medium">Generating video...</div>
                <div className="text-xs text-gray-500">This may take 2-5 minutes</div>
              </div>
            </div>
          )}

          {scene?.video_status === 'done' && scene.video_path && (
            <div>
              <video src={scene.video_path} controls className="w-full rounded-xl" />
              <a
                href={scene.video_path}
                download={`scene-${scene.id}-video.mp4`}
                className="block mt-2 text-center px-4 py-2 rounded-lg border border-white/10 text-sm hover:bg-white/5"
              >
                Download Video
              </a>
            </div>
          )}

          {scene?.video_status === 'failed' && (
            <div className="p-3 bg-red-500/10 rounded-xl border border-red-500/20 text-red-400 text-sm">
              Video generation failed. Check API key and try again.
            </div>
          )}

          {/* Controls (only when no video is generating) */}
          {scene?.video_status !== 'generating' && (
            <>
              {/* Video Provider */}
              {availableVideoProviders.length > 0 && (
                <div>
                  <label className="label-uppercase block mb-2">Video-Modell</label>
                  <select
                    value={videoProvider}
                    onChange={(e) => handleVideoProviderChange(e.target.value)}
                    className="w-full bg-gray-800/50 border border-white/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
                  >
                    {availableVideoProviders.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label} · ${p.costPerSecond}/s
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {/* Style Picker */}
              <div>
                <label className="label-uppercase block mb-2">Video Style</label>
                <div className="grid grid-cols-4 gap-2">
                  {VIDEO_STYLES.map(s => (
                    <button
                      key={s.value}
                      onClick={() => setStyle(s.value)}
                      className={`p-2 rounded-xl border text-center transition-all ${
                        style === s.value
                          ? 'border-purple-500 bg-purple-500/10'
                          : 'border-white/10 hover:border-purple-400/30'
                      }`}
                    >
                      <div className="text-lg">{s.icon}</div>
                      <div className="text-[10px] font-medium mt-0.5">{s.label}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Prompt */}
              <div>
                <label className="label-uppercase block mb-2">Scene Description</label>
                <textarea
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  placeholder="Slow camera drift revealing the paint supplies, warm ambient lighting"
                  className="w-full bg-gray-800/50 border border-white/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-purple-500 resize-none h-16 placeholder:text-gray-600"
                />
                <div className="mt-2 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={handlePreviewPrompt}
                    disabled={!hasImage || previewLoading}
                    className="self-start px-3 py-1.5 rounded-lg border border-white/10 text-xs font-medium hover:bg-white/5 disabled:opacity-50"
                  >
                    {previewLoading ? '…' : 'Video-Prompt generieren'}
                  </button>
                  {previewPrompt !== null && (
                    <div className="rounded-xl border border-white/10 overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setPreviewExpanded(!previewExpanded)}
                        className="w-full flex items-center justify-between px-3 py-2 bg-gray-800/30 text-left text-xs font-medium text-gray-400"
                      >
                        Generierter Video-Prompt
                        <span>{previewExpanded ? '▲' : '▼'}</span>
                      </button>
                      {previewExpanded && (
                        <pre className="p-3 text-xs text-gray-300 whitespace-pre-wrap break-words border-t border-white/10">
                          {previewPrompt}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Verwendeter Video-Prompt (nach Generierung) */}
              {showUsedPrompt && (
                <div className="rounded-xl border border-white/10 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setUsedPromptExpanded(!usedPromptExpanded)}
                    className="w-full flex items-center justify-between px-3 py-2 bg-gray-800/30 text-left text-xs font-medium text-gray-400"
                  >
                    Verwendeter Video-Prompt
                    <span>{usedPromptExpanded ? '▲' : '▼'}</span>
                  </button>
                  {usedPromptExpanded && (
                    <pre className="p-3 text-xs text-gray-300 whitespace-pre-wrap break-words border-t border-white/10">
                      {usedPrompt}
                    </pre>
                  )}
                </div>
              )}

              {/* Duration */}
              <div>
                <label className="label-uppercase block mb-2">Dauer (Sekunden): {duration}s</label>
                <input
                  type="range"
                  min={4}
                  max={8}
                  step={2}
                  value={duration}
                  onChange={e => setDuration(Number(e.target.value))}
                  className="w-full accent-purple-500"
                />
                <div className="flex justify-between text-[10px] text-gray-500">
                  <span>4s</span><span>6s</span><span>8s</span>
                </div>
              </div>

              {/* Cost + Generate */}
              <div className="flex items-center justify-between">
                <div className="text-xs text-gray-400">
                  ~${costEstimate} <span className="text-gray-600">· {selectedOption.label} · ${selectedOption.costPerSecond}/s</span>
                </div>
              </div>

              <button
                onClick={() => onGenerate({ videoStyle: style, videoPrompt: prompt || undefined, durationSeconds: duration, videoProvider })}
                disabled={!hasImage}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 to-purple-700 text-sm font-medium uppercase tracking-wider disabled:opacity-50 hover:from-purple-700 hover:to-purple-800"
              >
                GENERATE VIDEO
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
