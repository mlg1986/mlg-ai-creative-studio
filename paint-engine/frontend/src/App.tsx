import { useState, useEffect, useRef } from 'react';
import { ToastContainer } from './components/Toast';
import { MaterialLibrary } from './components/Materials/MaterialLibrary';
import { TemplatePicker } from './components/Scene/TemplatePicker';
import { SceneDescription } from './components/Scene/SceneDescription';
import { FormatSelector } from './components/Scene/FormatSelector';
import { ExportPresets } from './components/Scene/ExportPresets';
import { BlueprintUpload } from './components/Scene/BlueprintUpload';
import { MotifUpload } from './components/Scene/MotifUpload';
import { MaterialSelector } from './components/Scene/MaterialSelector';
import { ImagePreview } from './components/Preview/ImagePreview';
import { VideoPanel } from './components/Video/VideoPanel';
import { SceneGallery } from './components/Project/SceneGallery';
import { ApiKeyModal } from './components/Settings/ApiKeyModal';
import { PromptTags } from './components/Scene/PromptTags';
import { useMaterials } from './hooks/useMaterials';
import { useTemplates } from './hooks/useTemplates';
import { useScene } from './hooks/useScene';
import { usePresets } from './hooks/usePresets';
import { api } from './services/api';

export default function App() {
  const { materials, engagedMaterials, loading, refresh, toggleStatus, deleteMaterial } = useMaterials();
  const { templates, refresh: refreshTemplates } = useTemplates();
  const { currentScene, generating, generateImage, regenerate, regenerateWithFeedback, prepareRefinement, generateVideo, generateVariant, visionCorrection, setCurrentScene } = useScene();
  const { presets, createPreset, deletePreset } = usePresets();

  const [galleryKey, setGalleryKey] = useState(0);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [sceneDescription, setSceneDescription] = useState('');
  const [format, setFormat] = useState('vorlage');
  const [exportPreset, setExportPreset] = useState('');
  const [blueprintPath, setBlueprintPath] = useState<string | null>(null);
  const [motifPaths, setMotifPaths] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [showVideoPanel, setShowVideoPanel] = useState(false);
  const [sceneMaterialIds, setSceneMaterialIds] = useState<string[]>([]);
  const [savingScene, setSavingScene] = useState(false);
  const lastSyncedSceneIdRef = useRef<string | null>(null);

  // Set default export preset to Instagram Story (9:16) when presets are loaded
  useEffect(() => {
    if (presets.length > 0 && !exportPreset) {
      const instagramStory = presets.find(p => p.id === 'instagram_story');
      if (instagramStory) {
        setExportPreset(instagramStory.id);
      } else {
        setExportPreset(presets[0].id);
      }
    }
  }, [presets, exportPreset]);

  // When editing a scene: fill sidebar from scene data (only when scene id changes, so we don't overwrite user edits)
  useEffect(() => {
    if (!currentScene) {
      lastSyncedSceneIdRef.current = null;
      setSceneMaterialIds([]);
      return;
    }
    if (lastSyncedSceneIdRef.current === currentScene.id) return;
    lastSyncedSceneIdRef.current = currentScene.id;

    setSelectedTemplate(currentScene.template_id ?? null);
    setSceneDescription(currentScene.scene_description ?? '');
    setFormat(currentScene.format || 'vorlage');
    setExportPreset(currentScene.export_preset || '');
    setBlueprintPath(currentScene.blueprint_image_path ?? null);
    let paths: string[] = [];
    if (currentScene.motif_image_paths) {
      try {
        const parsed = JSON.parse(currentScene.motif_image_paths as unknown as string);
        paths = Array.isArray(parsed) ? parsed.filter(Boolean) : [];
      } catch {
        paths = [];
      }
    }
    if (paths.length === 0 && currentScene.motif_image_path) {
      paths = [currentScene.motif_image_path];
    }
    setMotifPaths(paths);
    if (currentScene.prompt_tags) {
      try {
        const parsed = typeof currentScene.prompt_tags === 'string'
          ? JSON.parse(currentScene.prompt_tags) : currentScene.prompt_tags;
        setSelectedTags(Array.isArray(parsed) ? parsed : []);
      } catch {
        setSelectedTags([]);
      }
    } else {
      setSelectedTags([]);
    }
    setSceneMaterialIds(currentScene.materials?.map(m => m.id) ?? []);
  }, [currentScene?.id]);

  // Fill scene description with template prompt when a template is selected (only when not editing a scene)
  useEffect(() => {
    if (currentScene) return;
    if (selectedTemplate && templates.length > 0) {
      const template = templates.find(t => t.id === selectedTemplate);
      if (template?.prompt_template) setSceneDescription(template.prompt_template);
    } else if (!selectedTemplate) {
      setSceneDescription('');
    }
  }, [currentScene, selectedTemplate, templates]);

  const toggleTag = (id: string) => {
    setSelectedTags(prev =>
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    );
  };

  const hasMnzMotif = (currentScene ? materials.filter(m => sceneMaterialIds.includes(m.id)) : engagedMaterials).some(m => m.category === 'mnz_motif');
  const costEstimate = (0.04 + 0.01).toFixed(2); // Scene Intelligence + Image

  const handleSaveScene = async () => {
    if (!currentScene) return;
    setSavingScene(true);
    try {
      const updated = await api.scenes.update(currentScene.id, {
        name: currentScene.name,
        template_id: selectedTemplate || null,
        scene_description: sceneDescription || null,
        prompt_tags: selectedTags.length > 0 ? selectedTags : null,
        format: hasMnzMotif ? format : null,
        export_preset: exportPreset || null,
        blueprint_image_path: blueprintPath || null,
        motif_image_paths: motifPaths.length > 0 ? motifPaths : null,
        materialIds: sceneMaterialIds,
      });
      setCurrentScene(updated);
      setGalleryKey(k => k + 1);
    } finally {
      setSavingScene(false);
    }
  };

  const handleGenerate = () => {
    // Don't generate if no export preset is selected yet
    if (!exportPreset) {
      console.warn('[App] No export preset selected yet, waiting for presets to load...');
      return;
    }

    const payload = {
      projectId: 'default',
      templateId: selectedTemplate || undefined,
      sceneDescription: sceneDescription || undefined,
      materialIds: engagedMaterials.map(m => m.id),
      format: hasMnzMotif ? format : undefined,
      exportPreset,
      promptTags: selectedTags.length > 0 ? selectedTags : undefined,
      blueprintImagePath: blueprintPath || undefined,
      motifImagePaths: motifPaths.length ? motifPaths : undefined,
    };
    console.log('[App] Generating image:', payload);
    generateImage(payload);
  };

  const handleDisengage = (id: string) => {
    toggleStatus(id);
  };

  const handleVariant = (presetId: string) => {
    if (currentScene) {
      generateVariant(currentScene.id, presetId);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      <ToastContainer />

      {/* Header */}
      <header className="border-b border-white/5 px-6 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold tracking-wider">
              <span className="text-purple-400">MLG AI</span> CREATIVE STUDIO
            </h1>
            <p className="text-[10px] text-gray-500 tracking-wider">Intelligent Product Photography</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500">My First Project</span>
            <button
              onClick={() => setShowSettings(true)}
              className="w-8 h-8 rounded-lg border border-white/10 flex items-center justify-center text-gray-400 hover:text-white hover:border-purple-400/30"
            >
              ⚙️
            </button>
          </div>
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex h-[calc(100vh-57px)]">
        {/* Sidebar */}
        <aside className="w-[360px] border-r border-white/5 overflow-y-auto p-4 space-y-6 flex-shrink-0">
          {/* Template Picker */}
          <TemplatePicker
            templates={templates}
            selected={selectedTemplate}
            onSelect={setSelectedTemplate}
            onTemplatesChange={refreshTemplates}
          />

          {/* Scene Description – top priority: what should go into the scene */}
          <SceneDescription
            value={sceneDescription}
            onChange={setSceneDescription}
            editingScene={!!currentScene}
          />

          {/* Scene Elements (Multi-Select Tags) */}
          <PromptTags
            selectedTags={selectedTags}
            onToggleTag={toggleTag}
          />

          {/* Format Selector */}
          <FormatSelector
            value={format}
            onChange={setFormat}
            visible={hasMnzMotif}
          />

          {/* Motif Upload – always visible; used when MNZ canvas is in scene */}
          <MotifUpload
            value={motifPaths}
            onChange={setMotifPaths}
            visible={true}
          />

          {/* Blueprint Upload */}
          <BlueprintUpload onUpload={setBlueprintPath} />

          {/* Export Preset */}
          <ExportPresets
            value={exportPreset}
            onChange={setExportPreset}
            presets={presets}
            onCreatePreset={createPreset}
            onDeletePreset={deletePreset}
          />

          {/* Materials – selection at bottom */}
          <MaterialLibrary
            materials={materials}
            onToggleStatus={toggleStatus}
            onDelete={deleteMaterial}
            onRefresh={refresh}
            selectedIds={currentScene ? sceneMaterialIds : undefined}
            onToggleId={currentScene ? (id) => setSceneMaterialIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]) : undefined}
          />

          {/* Selected Materials */}
          <MaterialSelector
            materials={currentScene ? materials.filter(m => sceneMaterialIds.includes(m.id)) : engagedMaterials}
            onRemove={currentScene ? (id) => setSceneMaterialIds(prev => prev.filter(x => x !== id)) : handleDisengage}
          />

          {/* Generate / Save Button */}
          <div>
            {currentScene ? (
              <button
                type="button"
                onClick={handleSaveScene}
                disabled={savingScene || !exportPreset}
                className="w-full py-3.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-sm font-bold uppercase tracking-wider disabled:opacity-40 transition-all"
              >
                {savingScene ? 'Speichern…' : 'Szene speichern'}
              </button>
            ) : (
              <>
                <button
                  onClick={handleGenerate}
                  disabled={generating || !exportPreset}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-purple-600 to-purple-700 text-sm font-bold uppercase tracking-wider disabled:opacity-40 hover:from-purple-700 hover:to-purple-800 transition-all"
                >
                  {generating ? 'GENERATING...' : !exportPreset ? 'LOADING...' : 'GENERATE IMAGE'}
                </button>
                <div className="text-center text-[10px] text-gray-500 mt-1.5">
                  ~${costEstimate} estimated
                </div>
              </>
            )}
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col p-4 gap-4 overflow-y-auto">
          {/* Image Preview */}
          <ImagePreview
            scene={currentScene}
            generating={generating}
            onRegenerate={regenerate}
            onGenerateVideo={() => setShowVideoPanel(true)}
            onGenerateVariant={handleVariant}
            presets={presets}
            onSceneUpdated={setCurrentScene}
            onRegenerateWithFeedback={regenerateWithFeedback}
            onPrepareRefinement={prepareRefinement}
            onVisionCorrection={visionCorrection}
            allMaterials={materials}
            onDelete={async () => {
              if (!currentScene) return;
              await api.scenes.delete(currentScene.id);
              setCurrentScene(null);
              setGalleryKey(k => k + 1);
            }}
          />

          {/* Video Panel */}
          {(showVideoPanel || currentScene?.video_status !== 'none') && (
            <VideoPanel
              scene={currentScene}
              onGenerate={generateVideo}
            />
          )}

          {/* Scene Gallery */}
          <SceneGallery
            key={galleryKey}
            projectId="default"
            onSelectScene={setCurrentScene}
          />
        </main>
      </div>

      {/* Settings Modal */}
      <ApiKeyModal open={showSettings} onClose={() => setShowSettings(false)} />
    </div>
  );
}
