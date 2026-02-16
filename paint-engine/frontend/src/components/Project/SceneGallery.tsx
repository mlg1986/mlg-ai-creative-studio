import { useState, useEffect } from 'react';
import { Scene } from '../../types';
import { api } from '../../services/api';

interface Props {
  projectId: string;
  onSelectScene: (scene: Scene) => void;
  onDelete?: (sceneId: string) => void | Promise<void>;
}

export function SceneGallery({ projectId, onSelectScene, onDelete }: Props) {
  const [scenes, setScenes] = useState<Scene[]>([]);

  useEffect(() => {
    api.scenes.getAll(projectId).then(setScenes).catch(() => { });
  }, [projectId]);

  const handleOpen = async (scene: Scene) => {
    try {
      const full = await api.scenes.get(scene.id);
      onSelectScene(full);
    } catch {
      onSelectScene(scene);
    }
  };

  const handleDelete = (e: React.MouseEvent, sceneId: string) => {
    e.stopPropagation();
    if (!window.confirm('Szene wirklich löschen? Das Bild wird dauerhaft entfernt.')) return;
    onDelete?.(sceneId);
  };

  if (scenes.length === 0) return null;

  return (
    <div>
      <h3 className="label-uppercase mb-3">Scene Gallery</h3>
      <div className="grid grid-cols-3 gap-2">
        {scenes.map(scene => (
          <div
            key={scene.id}
            className={`relative rounded-xl overflow-hidden border transition-all aspect-video group ${scene.image_status === 'failed'
              ? 'border-red-500/50 bg-red-500/5'
              : 'border-white/10 hover:border-purple-400/30'
            }`}
          >
            <button
              type="button"
              onClick={() => handleOpen(scene)}
              disabled={scene.image_status === 'generating'}
              className="absolute inset-0 w-full h-full text-left"
            >
              {scene.image_path ? (
                <img
                  src={scene.image_path}
                  alt={scene.name}
                  className={`w-full h-full object-cover ${scene.image_status === 'generating' ? 'opacity-50 grayscale' : ''}`}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-white/5">
                  {scene.image_status === 'failed' ? (
                    <span className="text-red-400 text-xl">⚠️</span>
                  ) : (
                    <span className="text-white/20 text-xl">🖼️</span>
                  )}
                </div>
              )}
            </button>

            {scene.image_status === 'generating' && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 pointer-events-none">
                <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {scene.video_status === 'done' && !onDelete && (
              <div className="absolute top-1 right-1 bg-purple-600 rounded-full w-5 h-5 flex items-center justify-center text-[10px] pointer-events-none">
                🎬
              </div>
            )}

            {/* Löschen-Button – immer sichtbar (besonders wichtig für kaputte Einträge) */}
            {onDelete && (
              <button
                type="button"
                onClick={(e) => handleDelete(e, scene.id)}
                disabled={scene.image_status === 'generating'}
                className={`absolute top-1 right-1 z-10 p-1 rounded-md text-white text-xs transition-colors ${
                  scene.image_status === 'failed' || !scene.image_path
                    ? 'bg-red-500/70 hover:bg-red-600 border border-red-400/50'
                    : 'bg-black/60 hover:bg-red-500/80 border border-white/10'
                }`}
                title="Szene löschen"
                aria-label="Szene löschen"
              >
                🗑
              </button>
            )}

            {/* Öffnen-Button bei Hover */}
            <div className="absolute top-1 left-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={() => handleOpen(scene)}
                disabled={scene.image_status === 'generating'}
                className="px-2 py-1 rounded-md bg-purple-600 hover:bg-purple-700 text-[10px] font-bold uppercase tracking-wider text-white shadow-lg"
              >
                Öffnen
              </button>
            </div>

            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 p-1.5 text-left pointer-events-none">
              <div className="flex items-center gap-1">
                <div className="text-[10px] font-medium truncate flex-1">
                  {scene.image_status === 'failed' && <span className="text-red-400 mr-1">!</span>}
                  {scene.name}
                </div>
                {scene.review_notes && scene.review_notes.trim() && (
                  <span className="flex-shrink-0 text-[10px] text-purple-400" title="Feedback gespeichert">💬</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
