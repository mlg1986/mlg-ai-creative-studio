import { useState, useEffect } from 'react';
import { Scene } from '../../types';
import { api } from '../../services/api';

interface Props {
  projectId: string;
  onSelectScene: (scene: Scene) => void;
}

export function SceneGallery({ projectId, onSelectScene }: Props) {
  const [scenes, setScenes] = useState<Scene[]>([]);

  useEffect(() => {
    api.scenes.getAll(projectId).then(setScenes).catch(() => { });
  }, [projectId]);

  if (scenes.length === 0) return null;

  return (
    <div>
      <h3 className="label-uppercase mb-3">Scene Gallery</h3>
      <div className="grid grid-cols-3 gap-2">
        {scenes.map(scene => (
          <button
            key={scene.id}
            onClick={async () => {
              try {
                const full = await api.scenes.get(scene.id);
                onSelectScene(full);
              } catch {
                onSelectScene(scene);
              }
            }}
            disabled={scene.image_status === 'generating'}
            className={`relative rounded-xl overflow-hidden border transition-all aspect-video ${scene.image_status === 'failed'
                ? 'border-red-500/50 bg-red-500/5'
                : 'border-white/10 hover:border-purple-400/30'
              }`}
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

            {scene.image_status === 'generating' && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {scene.video_status === 'done' && (
              <div className="absolute top-1 right-1 bg-purple-600 rounded-full w-5 h-5 flex items-center justify-center text-[10px]">
                🎬
              </div>
            )}

            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 p-1.5 text-left">
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
          </button>
        ))}
      </div>
    </div>
  );
}
