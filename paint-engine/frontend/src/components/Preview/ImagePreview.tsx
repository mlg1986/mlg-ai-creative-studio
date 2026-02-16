import { useState, useEffect, useRef } from 'react';
import { Scene, ExportPreset, Material } from '../../types';
import { api, showToast } from '../../services/api';
import { SceneVersions } from './SceneVersions';

const MAX_REFINEMENT_EXTRA_REFS = 4;

interface Props {
  scene: Scene | null;
  generating: boolean;
  onRegenerate: () => void;
  onGenerateVideo: () => void;
  onGenerateVariant?: (presetId: string) => void;
  presets?: ExportPreset[];
  onSceneUpdated?: (scene: Scene) => void;
  onRegenerateWithFeedback?: (materialIds?: string[], promptAddendum?: string, extraReferencePaths?: string[]) => void;
  onPrepareRefinement?: (materialIds?: string[], hasExtensionImage?: boolean) => Promise<string | null>;
  onVisionCorrection?: () => void;
  onDelete?: () => void;
  allMaterials?: Material[];
  /** IDs of materials selected for current scene (from sidebar) */
  sceneMaterialIds?: string[];
}

export function ImagePreview({ scene, generating, onRegenerate, onGenerateVideo, onGenerateVariant, presets, onSceneUpdated, onRegenerateWithFeedback, onPrepareRefinement, onVisionCorrection, onDelete, allMaterials = [], sceneMaterialIds }: Props) {
  const [showVariantPicker, setShowVariantPicker] = useState(false);
  const [reviewNotes, setReviewNotes] = useState('');
  const [reviewRating, setReviewRating] = useState<number | ''>('');
  const [savingFeedback, setSavingFeedback] = useState(false);
  const [showRefinementDetails, setShowRefinementDetails] = useState(false);
  const [showRefinementSetup, setShowRefinementSetup] = useState(false);
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<string[]>([]);
  const [tempAddendum, setTempAddendum] = useState('');
  const [preparingRefinement, setPreparingRefinement] = useState(false);
  const [refinementExtraPaths, setRefinementExtraPaths] = useState<string[]>([]);
  const [refinementExtraUploading, setRefinementExtraUploading] = useState(false);
  const refinementExtraInputRef = useRef<HTMLInputElement>(null);

  // Materials selected for refinement – prefer sceneMaterialIds (sidebar selection) over status field
  const engagedMaterials = sceneMaterialIds
    ? allMaterials.filter(m => sceneMaterialIds.includes(m.id))
    : allMaterials.filter(m => m.status === 'engaged');
  const engagedIdsKey = engagedMaterials.map(m => m.id).sort().join(',');

  useEffect(() => {
    if (scene?.review_notes !== undefined) setReviewNotes(scene.review_notes ?? '');
    if (scene?.review_rating !== undefined) setReviewRating(scene.review_rating ?? '');
  }, [scene?.id, scene?.review_notes, scene?.review_rating]);

  // Sync selected materials whenever the set of engaged materials changes (e.g. IDLE -> AUSGEWAEHLT)
  useEffect(() => {
    setSelectedMaterialIds(engagedMaterials.map(m => m.id));
  }, [scene?.id, engagedIdsKey]);

  const toggleMaterial = (id: string) => {
    setSelectedMaterialIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleSaveFeedback = async () => {
    if (!scene) return;
    setSavingFeedback(true);
    try {
      const updated = await api.scenes.update(scene.id, {
        review_notes: reviewNotes.trim() || null,
        review_rating: reviewRating === '' ? null : Number(reviewRating),
      });
      onSceneUpdated?.(updated);
    } finally {
      setSavingFeedback(false);
    }
  };

  const handlePrepareRefinement = async () => {
    if (!onPrepareRefinement) return;
    setPreparingRefinement(true);
    try {
      const hasExt = refinementExtraPaths.length > 0;
      const addendum = await onPrepareRefinement(
        selectedMaterialIds.length > 0 ? selectedMaterialIds : undefined,
        hasExt || undefined
      );
      if (addendum) setTempAddendum(addendum);
    } finally {
      setPreparingRefinement(false);
    }
  };

  const handleRefinement = () => {
    const idsToSend = [...new Set([...selectedMaterialIds, ...engagedMaterials.map(m => m.id)])];
    onRegenerateWithFeedback?.(
      idsToSend,
      tempAddendum.trim() || undefined,
      refinementExtraPaths.length > 0 ? refinementExtraPaths : undefined
    );
    setShowRefinementSetup(false);
  };

  const handleRefinementExtraFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    e.target.value = '';
    const toAdd = Math.min(files.length, MAX_REFINEMENT_EXTRA_REFS - refinementExtraPaths.length);
    if (toAdd <= 0) return;
    setRefinementExtraUploading(true);
    try {
      const formData = new FormData();
      for (let i = 0; i < toAdd; i++) formData.append('extraRef', files[i]);
      const result = await api.scenes.uploadExtraReference(formData);
      const paths = result.paths || [];
      setRefinementExtraPaths(prev => [...prev, ...paths].slice(0, MAX_REFINEMENT_EXTRA_REFS));
      showToast({ type: 'success', title: 'Referenzbild hochgeladen', message: `${paths.length} Bild(er) für diese Verfeinerung hinzugefügt.` });
    } catch (err: any) {
      const msg = err?.message || err?.error?.message || 'Upload fehlgeschlagen';
      showToast({ type: 'error', title: 'Upload fehlgeschlagen', message: String(msg) });
    } finally {
      setRefinementExtraUploading(false);
    }
  };

  if (!scene) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-900/30 rounded-2xl border border-white/5">
        <div className="text-center">
          <div className="text-5xl mb-3 opacity-30">📸</div>
          <div className="text-gray-500 text-sm font-medium">READY FOR INITIALIZATION</div>
          <div className="text-gray-600 text-xs mt-1">Select materials and generate an image</div>
        </div>
      </div>
    );
  }

  if (scene.image_status === 'generating' || generating) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-900/30 rounded-2xl border border-white/5">
        <div className="text-center">
          <div className="relative w-16 h-16 mx-auto mb-4">
            <div className="absolute inset-0 rounded-full border-2 border-purple-500/20" />
            <div className="absolute inset-0 rounded-full border-2 border-purple-500 border-t-transparent animate-spin" />
          </div>
          <div className="text-purple-400 text-sm font-medium">GENERATING IMAGE...</div>
          <div className="text-gray-500 text-xs mt-1">This may take 15-30 seconds</div>
        </div>
      </div>
    );
  }

  if (scene.image_status === 'failed') {
    const errorMsg = scene.last_error_message || 'Unknown error';
    const isApiKeyIssue = /api.key|apikey|authenticate|unauthorized|forbidden|invalid.*key/i.test(errorMsg);
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-900/30 rounded-2xl border border-red-500/20">
        <div className="text-center max-w-md px-6">
          <div className="text-4xl mb-3">❌</div>
          <div className="text-red-400 text-sm font-medium">GENERATION FAILED</div>
          <div className="text-gray-400 text-xs mt-2 mb-1 bg-red-500/5 border border-red-500/10 rounded-lg p-3 text-left font-mono leading-relaxed max-h-32 overflow-y-auto">
            {errorMsg}
          </div>
          {isApiKeyIssue && (
            <div className="text-amber-400/80 text-[10px] mt-1 mb-2">Prüfe deinen API-Key in den Einstellungen (⚙️)</div>
          )}
          <button onClick={onRegenerate}
            className="mt-3 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-sm font-medium">
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Show preview with refinement whenever there is an image (done, draft, or other) and we're not generating/failed
  const hasImage = !!(scene.image_path && scene.image_status !== 'generating' && !generating && scene.image_status !== 'failed');
  if (hasImage) {
    const hasFeedback = !!(scene.review_notes && scene.review_notes.trim());
    const materialIdsToSend = [...new Set([...selectedMaterialIds, ...engagedMaterials.map(m => m.id)])];
    const selectedMaterials = engagedMaterials.filter(m => selectedMaterialIds.includes(m.id));
    const totalRefImages = selectedMaterials.reduce((sum, m) => sum + (m.images?.length || 0), 0);
    const motifCount = (() => {
      try {
        const p = scene.motif_image_paths;
        if (p) {
          const arr = typeof p === 'string' ? JSON.parse(p) : p;
          return Array.isArray(arr) ? arr.length : 0;
        }
        return scene.motif_image_path ? 1 : 0;
      } catch {
        return scene.motif_image_path ? 1 : 0;
      }
    })();
    const sceneExtraRefCount = (() => {
      try {
        const p = scene.extra_reference_paths;
        if (!p) return 0;
        const arr = typeof p === 'string' ? JSON.parse(p) : p;
        return Array.isArray(arr) ? arr.length : 0;
      } catch {
        return 0;
      }
    })();
    const extraRefCount = sceneExtraRefCount + refinementExtraPaths.length;

    return (
      <div className="w-full flex-shrink-0 flex flex-col bg-gray-900/30 rounded-2xl border border-white/5 shadow-2xl relative">
        <div className="flex-1 relative min-h-0 bg-black/20 group">
          <img
            src={`${scene.image_path}?t=${new Date(scene.updated_at).getTime()}`}
            alt="Generated scene"
            className="w-full h-full object-contain p-4 transition-transform duration-500 group-hover:scale-[1.02]"
          />
          <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => window.open(scene.image_path!, '_blank')}
              className="p-2 rounded-lg bg-black/50 text-white hover:bg-black/70 border border-white/10 text-xs backdrop-blur-sm"
              title="In neuem Tab öffnen"
            >
              ↗️ Vollbild
            </button>
          </div>
        </div>

        {/* Bewertung & Feedback */}
        <div className="p-4 border-t border-white/5 bg-white/[0.02]">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] uppercase tracking-wider text-gray-500 font-medium">Bewertung & Feedback</div>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map(star => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setReviewRating(prev => (prev === star ? '' : star))}
                  className={`text-base leading-none ${reviewRating !== '' && star <= (reviewRating as number) ? 'text-amber-400' : 'text-gray-600 hover:text-gray-400'}`}
                  aria-label={`${star} Sterne`}
                >
                  ★
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-3">
            <textarea
              value={reviewNotes}
              onChange={e => setReviewNotes(e.target.value)}
              placeholder="Was hat nicht gepasst? (z. B. Farbtöpfe zu klein, Zahlen auf Leinwand nicht sichtbar)"
              className="flex-1 h-14 px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-sm text-gray-200 placeholder-gray-500 focus:border-purple-500/50 focus:outline-none resize-none transition-all focus:h-24"
            />
            <button
              onClick={handleSaveFeedback}
              disabled={savingFeedback}
              className="self-end px-4 py-2 rounded-lg bg-white/10 text-xs font-semibold hover:bg-white/15 disabled:opacity-50 transition-colors h-10"
            >
              {savingFeedback ? '...' : 'Speichern'}
            </button>
          </div>
        </div>

        {/* Refinement Setup – Material Selection & Data Preview */}
        {onRegenerateWithFeedback && (
          <div className="border-t border-white/5 bg-purple-500/[0.02]">
            <button
              onClick={() => setShowRefinementSetup(prev => !prev)}
              className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-white/[0.03] transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">🎛️</span>
                <span className="text-[11px] uppercase tracking-[0.2em] text-purple-400 font-bold">Verfeinerung konfigurieren</span>
              </div>
              <span className={`text-gray-500 text-xs transition-transform duration-300 ${showRefinementSetup ? 'rotate-180' : ''}`}>▼</span>
            </button>

            {showRefinementSetup && (
              <div className="px-4 pb-6 animate-in slide-in-from-top-2 duration-300">
                <div className="bg-black/40 rounded-xl border border-white/5 overflow-hidden flex flex-col max-h-[500px]">
                  <div className="p-4 space-y-5 overflow-y-auto custom-scrollbar flex-1">
                    {/* Source Image Indicator */}
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-green-500/5 border border-green-500/10">
                      <div className="w-10 h-10 rounded-md overflow-hidden border border-white/10 flex-shrink-0">
                        <img src={scene.image_path} alt="Source" className="w-full h-full object-cover opacity-80" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-green-400 text-xs font-bold font-mono">OK</span>
                          <span className="text-[11px] text-gray-200 font-semibold">Hauptbild wird als Referenz gesendet</span>
                        </div>
                      </div>
                    </div>

                    {/* Material Picker */}
                    {engagedMaterials.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
                            Materialien auswählen ({selectedMaterialIds.length})
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setSelectedMaterialIds(engagedMaterials.map(m => m.id))}
                              className="text-[9px] text-purple-400 font-bold uppercase hover:text-purple-300 transition-colors"
                            >
                              Alle
                            </button>
                            <button
                              onClick={() => setSelectedMaterialIds([])}
                              className="text-[9px] text-gray-500 font-bold uppercase hover:text-gray-400 transition-colors"
                            >
                              Keine
                            </button>
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          {engagedMaterials.map(mat => {
                            const isSelected = selectedMaterialIds.includes(mat.id);
                            const imgCount = mat.images?.length || 0;
                            return (
                              <button
                                key={mat.id}
                                onClick={() => toggleMaterial(mat.id)}
                                className={`w-full flex items-center gap-3 p-2 rounded-lg border text-left transition-all ${isSelected
                                  ? 'border-purple-500/30 bg-purple-500/10 shadow-[0_0_15px_rgba(168,85,247,0.05)]'
                                  : 'border-white/5 bg-white/[0.01] opacity-60 hover:opacity-100'
                                  }`}
                              >
                                <div className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center text-[10px] ${isSelected ? 'bg-purple-600 border-purple-600 text-white' : 'border-gray-600'
                                  }`}>
                                  {isSelected && '✓'}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="text-xs text-gray-200 font-medium truncate">{mat.name}</div>
                                  <div className="text-[9px] text-gray-500 uppercase tracking-tighter">{mat.category} · {imgCount} Referenz{imgCount !== 1 ? 'en' : ''}</div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Zusätzliches Bild für diese Verfeinerung */}
                    <div className="space-y-2">
                      <div className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
                        Zusätzliches Bild für diese Verfeinerung
                      </div>
                      <p className="text-[10px] text-gray-500">
                        Optional: Bild wird mitgeschickt. In den Korrektur-Anweisungen beschreiben, was damit passieren soll (z. B. „Person hinzufügen“, „Bild einbauen“). Max. {MAX_REFINEMENT_EXTRA_REFS} Bilder.
                      </p>
                      {refinementExtraPaths.length > 0 && (
                        <div className="space-y-1.5">
                          {refinementExtraPaths.map((path, index) => (
                            <div key={path} className="flex items-center gap-2 p-2 rounded-lg border border-purple-500/20 bg-black/30">
                              <div className="w-14 h-14 flex-shrink-0 rounded overflow-hidden border border-white/10 bg-gray-900/50">
                                <img src={path} alt={`Referenz ${index + 1}`} className="w-full h-full object-contain" />
                              </div>
                              <div className="flex-1 min-w-0 text-[10px] text-gray-400">Referenzbild {index + 1}</div>
                              <button
                                type="button"
                                onClick={() => setRefinementExtraPaths(prev => prev.filter((_, i) => i !== index))}
                                className="p-1.5 rounded-full bg-red-500/20 hover:bg-red-500/40 text-red-400 text-xs"
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                          {refinementExtraUploading && (
                            <div className="flex items-center gap-2 text-[10px] text-purple-400">
                              <div className="w-3 h-3 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                              Lade hoch...
                            </div>
                          )}
                        </div>
                      )}
                      {refinementExtraPaths.length < MAX_REFINEMENT_EXTRA_REFS && (
                        <label className="flex flex-col items-center justify-center border-2 border-dashed border-purple-500/20 rounded-lg p-3 cursor-pointer hover:border-purple-500/40 transition-colors">
                          <span className="text-sm text-gray-400">📎 Referenzbild(er) hochladen</span>
                          <input
                            ref={refinementExtraInputRef}
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={handleRefinementExtraFile}
                            disabled={refinementExtraUploading}
                            className="hidden"
                            aria-label="Referenzbild für Verfeinerung hochladen"
                          />
                        </label>
                      )}
                    </div>

                    {/* AI Instructions */}
                    <div className="space-y-3 pt-2">
                      <div className="flex items-center justify-between">
                        <div className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
                          Korrektur-Anweisungen
                        </div>
                        {!tempAddendum && hasFeedback && (
                          <button
                            onClick={handlePrepareRefinement}
                            disabled={preparingRefinement}
                            className="px-2 py-1 rounded bg-purple-600/20 text-purple-400 text-[10px] font-bold uppercase border border-purple-500/30 hover:bg-purple-600/30 transition-all disabled:opacity-50"
                          >
                            {preparingRefinement ? 'Wird erstellt...' : '⚡ KI-Prompt generieren'}
                          </button>
                        )}
                      </div>

                      <div className="space-y-2">
                        <textarea
                          value={tempAddendum}
                          onChange={e => setTempAddendum(e.target.value)}
                          placeholder={hasFeedback
                            ? 'Korrektur-Anweisungen eingeben oder „KI-Prompt generieren“ nutzen …'
                            : 'Korrektur-Anweisungen eingeben (oder oben unter „Bewertung & Feedback“ eintragen und Speichern, dann „KI-Prompt generieren“) …'}
                          className="w-full h-32 px-3 py-2 rounded-lg bg-black/60 border border-purple-500/30 text-[11px] text-gray-200 focus:border-purple-500 focus:outline-none resize-none font-mono leading-relaxed placeholder-gray-500"
                        />
                        {tempAddendum ? (
                          <div className="flex justify-between items-center px-1">
                            <span className="text-[9px] text-gray-500 italic">Du kannst den Prompt manuell anpassen</span>
                            <button onClick={() => setTempAddendum('')} className="text-[9px] text-red-400/70 hover:text-red-400 font-bold uppercase transition-colors">Abbrechen</button>
                          </div>
                        ) : (
                          <div className="text-[11px] text-gray-500 italic leading-relaxed">
                            {preparingRefinement
                              ? 'KI analysiert Feedback und Materialien...'
                              : hasFeedback
                                ? 'Optional: „KI-Prompt generieren“ nutzen, um aus deinem Feedback einen präzisen Prompt zu erzeugen.'
                                : 'Optional: Oben unter „Bewertung & Feedback“ eintragen und Speichern, dann hier „KI-Prompt generieren“ nutzen.'}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Final Summary Card – bei Verfeinerung: zu bearbeitendes Bild + Motive + Materialien (wenn ausgewählt) */}
                    <div className="mt-4 p-3 rounded-xl bg-purple-500/5 border border-purple-500/10 space-y-2">
                      <div className="text-[9px] uppercase tracking-[0.2em] text-purple-400 font-bold mb-1 underline decoration-purple-500/30 underline-offset-4">
                        Payload-Vorschau
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[10px]">
                        <div className="text-gray-500">Zu bearbeitendes Bild: <span className="text-green-400 font-mono">SEND</span></div>
                        <div className="text-gray-500 text-right">Materialien: <span className="text-gray-200">{materialIdsToSend.length}</span> {materialIdsToSend.length > 0 ? '(Referenzen mitgesendet)' : ''}</div>
                        <div className="text-gray-500">Motive: <span className="text-gray-200">{motifCount}</span> {motifCount > 0 ? '(mitgesendet)' : ''}</div>
                        <div className="text-gray-500 text-right truncate">Feedback: {scene.review_notes?.trim() ? `${scene.review_notes.slice(0, 18)}…` : '–'}</div>
                        {extraRefCount > 0 && (
                          <div className="text-gray-500 col-span-2">Zusatzreferenzen: <span className="text-gray-200">{extraRefCount}</span> (mitgesendet)</div>
                        )}
                        {scene.target_width != null && scene.target_height != null && (
                          <div className="text-gray-500 col-span-2">
                            Format: <span className="text-gray-200 font-mono">{scene.target_width} × {scene.target_height} px</span>
                            <span className="text-gray-500 ml-1">(Seitenverhältnis wird bei Verfeinerung beibehalten)</span>
                          </div>
                        )}
                        <div className="text-gray-500 col-span-2 text-right font-mono text-[9px]">v1.4-refine</div>
                      </div>
                    </div>
                  </div>

                  {/* Steady Refine Button at the bottom of the card */}
                  <div className="p-4 border-t border-white/5 bg-white/[0.02]">
                    {!(tempAddendum.trim() || hasFeedback) && (
                      <p className="text-[10px] text-gray-500 italic mb-2">Korrektur-Anweisungen eingeben oder oben Feedback eintragen (und speichern).</p>
                    )}
                    <button
                      onClick={handleRefinement}
                      disabled={generating || (!tempAddendum.trim() && !hasFeedback)}
                      title={!(tempAddendum.trim() || hasFeedback) ? 'Korrektur-Anweisungen eingeben oder oben Feedback eintragen (und speichern).' : undefined}
                      className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-xs font-black uppercase tracking-[0.2em] shadow-[0_0_20px_rgba(147,51,234,0.3)] hover:shadow-[0_0_30px_rgba(147,51,234,0.5)] hover:scale-[1.01] active:scale-[0.98] transition-all disabled:opacity-50"
                    >
                      🚀 Verfeinerung starten
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Refinement Details – Transparenz: welche Bilder & Prompt an die KI gesendet wurden */}
        {scene.last_refinement_prompt && (
          <div className="border-t border-white/5">
            <button
              onClick={() => setShowRefinementDetails(prev => !prev)}
              className="w-full px-4 py-2.5 flex items-center justify-between text-left hover:bg-white/[0.03] transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm">🔍</span>
                <span className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">Letzte Verfeinerung – Details</span>
              </div>
              <span className="text-gray-500 text-xs">{showRefinementDetails ? '▲' : '▼'}</span>
            </button>
            {showRefinementDetails && (
              <div className="px-4 pb-4 space-y-3">
                {/* Source Image sent indicator */}
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <span className="text-green-400">✓</span>
                  <span>Hauptbild wurde als Source Image mitgesendet</span>
                </div>

                {/* Material Images sent to AI */}
                {(() => {
                  let refinementMaterials: { materialName: string; category: string; imagePaths: string[] }[] = [];
                  try {
                    refinementMaterials = JSON.parse(scene.last_refinement_materials || '[]');
                  } catch { /* ignore */ }
                  if (refinementMaterials.length === 0) return null;
                  return (
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-gray-500 font-medium mb-2">
                        Mitgesendete Material-Bilder
                      </div>
                      <div className="space-y-2">
                        {refinementMaterials.map((mat, idx) => (
                          <div key={idx} className="flex items-start gap-3">
                            <div className="min-w-[100px]">
                              <span className="text-xs text-gray-300 font-medium">{mat.materialName}</span>
                              <span className="text-[10px] text-gray-500 ml-1">({mat.category})</span>
                            </div>
                            <div className="flex gap-1.5 flex-wrap">
                              {mat.imagePaths.map((imgPath, imgIdx) => (
                                <img
                                  key={imgIdx}
                                  src={imgPath}
                                  alt={`${mat.materialName} ${imgIdx + 1}`}
                                  className="w-12 h-12 object-cover rounded-md border border-white/10 hover:border-purple-400/50 hover:scale-110 transition-all cursor-pointer"
                                  onClick={() => window.open(imgPath, '_blank')}
                                />
                              ))}
                              {mat.imagePaths.length === 0 && (
                                <span className="text-[10px] text-gray-600 italic">Keine Bilder</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* AI Refinement Prompt */}
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-gray-500 font-medium mb-2">
                    KI-Korrektur Prompt
                  </div>
                  <pre className="text-[11px] text-gray-400 bg-black/30 border border-white/5 rounded-lg p-3 max-h-48 overflow-y-auto whitespace-pre-wrap font-mono leading-relaxed">
                    {scene.last_refinement_prompt}
                  </pre>
                </div>
              </div>
            )}
          </div>
        )}
        {/* Version History */}
        <SceneVersions
          sceneId={scene.id}
          currentVersionTimestamp={scene.updated_at}
          onRestore={async () => {
            try {
              const updated = await api.scenes.get(scene.id);
              onSceneUpdated?.(updated);
            } catch (e) {
              console.error('Failed to refresh scene', e);
            }
          }}
        />


        <div className="flex flex-wrap gap-2 p-4 border-t border-white/5 bg-white/[0.02]">
          <a
            href={scene.image_path}
            download={`scene-${scene.id}.png`}
            className="px-6 py-2 rounded-xl border border-white/10 text-xs font-bold uppercase tracking-wider hover:bg-white/5 transition-all"
          >
            Download PNG
          </a>
          <button onClick={onRegenerate}
            className="px-6 py-2 rounded-xl border border-white/10 text-xs font-bold uppercase tracking-wider hover:bg-white/5 transition-all">
            Regenerate
          </button>
          {onVisionCorrection && (
            <button
              onClick={onVisionCorrection}
              className="px-6 py-2 rounded-xl border border-blue-500/30 text-xs font-bold uppercase tracking-wider text-blue-400 hover:bg-blue-500/10 transition-all"
              title="KI analysiert das Bild auf Fehler (labels, Proportionen etc.) und korrigiert es automatisch"
            >
              Vision Correction
            </button>
          )}
          {onGenerateVariant && presets && presets.length > 0 && (
            <div className="relative flex-1 min-w-[100px]">
              <button
                onClick={() => setShowVariantPicker(!showVariantPicker)}
                className="w-full px-4 py-2 rounded-lg border border-purple-500/30 text-sm hover:bg-purple-500/10 text-purple-400"
              >
                Format-Variante
              </button>
              {showVariantPicker && (
                <div className="absolute bottom-full mb-1 left-0 right-0 bg-[#1a1a2e] border border-white/10 rounded-xl shadow-xl z-10 max-h-48 overflow-y-auto">
                  {presets
                    .filter(p => p.id !== scene.export_preset)
                    .map(p => (
                      <button
                        key={p.id}
                        onClick={() => {
                          onGenerateVariant(p.id);
                          setShowVariantPicker(false);
                        }}
                        className="w-full px-3 py-2 text-left text-xs hover:bg-purple-500/10 border-b border-white/5 last:border-0"
                      >
                        <span className="text-gray-200">{p.name}</span>
                        <span className="text-gray-500 ml-1">{p.width}x{p.height}</span>
                      </button>
                    ))}
                </div>
              )}
            </div>
          )}
          <button onClick={onGenerateVideo}
            className="flex-1 min-w-[100px] px-4 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-purple-700 text-sm font-medium hover:from-purple-700 hover:to-purple-800">
            Generate Video
          </button>
          {onDelete && (
            <button
              onClick={() => window.confirm('Szene wirklich löschen? Das Bild wird dauerhaft entfernt.') && onDelete()}
              className="px-4 py-2 rounded-lg border border-red-500/30 text-sm text-red-400 hover:bg-red-500/10"
            >
              Löschen
            </button>
          )}
        </div>
      </div>
    );
  }

  return null;
}
