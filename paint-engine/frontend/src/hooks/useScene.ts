import { useState, useCallback, useRef, useEffect } from 'react';
import { Scene } from '../types';
import { api } from '../services/api';

export function useScene() {
  const [currentScene, setCurrentScene] = useState<Scene | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generatedFromNew, setGeneratedFromNew] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // When no scene is selected, we're not in "edit from gallery" mode
  useEffect(() => {
    if (!currentScene) setGeneratedFromNew(false);
  }, [currentScene]);

  const selectScene = useCallback((scene: Scene | null) => {
    setCurrentScene(scene);
    setGeneratedFromNew(false);
  }, []);

  const generateImage = useCallback(async (data: {
    projectId?: string;
    templateId?: string;
    sceneDescription?: string;
    materialIds?: string[];
    format?: string;
    exportPreset?: string;
    promptTags?: string[];
    blueprintImagePath?: string;
    motifImagePath?: string;
    motifImagePaths?: string[];
  }) => {
    setGenerating(true);
    try {
      const result = await api.scenes.create(data);
      setGeneratedFromNew(true);
      setCurrentScene({ id: result.id, image_status: 'generating' } as Scene);

      // Start polling
      pollRef.current = setInterval(async () => {
        try {
          const scene = await api.scenes.get(result.id);
          setCurrentScene(scene);
          if (scene.image_status === 'done' || scene.image_status === 'failed') {
            if (pollRef.current) clearInterval(pollRef.current);
            setGenerating(false);
          }
        } catch {
          // Keep polling
        }
      }, 3000);
    } catch {
      setGenerating(false);
    }
  }, []);

  const regenerate = useCallback(async () => {
    if (!currentScene) return;
    setGenerating(true);
    try {
      await api.scenes.regenerate(currentScene.id);
      setCurrentScene(prev => prev ? { ...prev, image_status: 'generating' } : null);

      pollRef.current = setInterval(async () => {
        try {
          const scene = await api.scenes.get(currentScene.id);
          setCurrentScene(scene);
          if (scene.image_status === 'done' || scene.image_status === 'failed') {
            if (pollRef.current) clearInterval(pollRef.current);
            setGenerating(false);
          }
        } catch { /* keep polling */ }
      }, 3000);
    } catch {
      setGenerating(false);
    }
  }, [currentScene]);

  const generateVideo = useCallback(async (data: {
    videoStyle: string;
    videoPrompt?: string;
    durationSeconds: number;
  }) => {
    if (!currentScene) return;
    try {
      await api.scenes.generateVideo(currentScene.id, data);
      setCurrentScene(prev => prev ? { ...prev, video_status: 'generating' } : null);

      const videoPoll = setInterval(async () => {
        try {
          const status = await api.scenes.videoStatus(currentScene.id);
          if (status.video_status === 'done' || status.video_status === 'failed') {
            clearInterval(videoPoll);
            const scene = await api.scenes.get(currentScene.id);
            setCurrentScene(scene);
          }
        } catch { /* keep polling */ }
      }, 5000);
    } catch { /* toast shown */ }
  }, [currentScene]);

  const generateVariant = useCallback(async (sceneId: string, exportPreset: string) => {
    setGenerating(true);
    try {
      const result = await api.scenes.createVariant(sceneId, exportPreset);
      setCurrentScene({ id: result.id, image_status: 'generating' } as Scene);

      pollRef.current = setInterval(async () => {
        try {
          const scene = await api.scenes.get(result.id);
          setCurrentScene(scene);
          if (scene.image_status === 'done' || scene.image_status === 'failed') {
            if (pollRef.current) clearInterval(pollRef.current);
            setGenerating(false);
          }
        } catch { /* keep polling */ }
      }, 3000);
    } catch {
      setGenerating(false);
    }
  }, []);

  const prepareRefinement = useCallback(async (materialIds?: string[], hasExtensionImage?: boolean) => {
    if (!currentScene) return null;
    try {
      const response = await api.scenes.prepareRefinement(currentScene.id, materialIds, hasExtensionImage);
      return response.promptAddendum;
    } catch (err) {
      console.error('Failed to prepare refinement:', err);
      return null;
    }
  }, [currentScene]);

  const regenerateWithFeedback = useCallback(async (materialIds?: string[], promptAddendum?: string, extraReferencePaths?: string[]) => {
    if (!currentScene) return;
    setGenerating(true);
    try {
      await api.scenes.regenerateWithFeedback(currentScene.id, materialIds, promptAddendum, extraReferencePaths);
      setCurrentScene(prev => prev ? { ...prev, image_status: 'generating' } : null);

      pollRef.current = setInterval(async () => {
        try {
          const scene = await api.scenes.get(currentScene.id);
          setCurrentScene(scene);
          if (scene.image_status === 'done' || scene.image_status === 'failed') {
            if (pollRef.current) clearInterval(pollRef.current);
            setGenerating(false);
          }
        } catch { /* keep polling */ }
      }, 3000);
    } catch {
      setGenerating(false);
    }
  }, [currentScene]);

  const visionCorrection = useCallback(async () => {
    if (!currentScene) return;
    setGenerating(true);
    try {
      await api.scenes.visionCorrection(currentScene.id);
      setCurrentScene(prev => prev ? { ...prev, image_status: 'generating' } : null);

      pollRef.current = setInterval(async () => {
        try {
          const scene = await api.scenes.get(currentScene.id);
          setCurrentScene(scene);
          if (scene.image_status === 'done' || scene.image_status === 'failed') {
            if (pollRef.current) clearInterval(pollRef.current);
            setGenerating(false);
          }
        } catch { /* keep polling */ }
      }, 3000);
    } catch {
      setGenerating(false);
    }
  }, [currentScene]);

  return {
    currentScene,
    generating,
    generatedFromNew,
    generateImage,
    regenerate,
    regenerateWithFeedback,
    prepareRefinement,
    visionCorrection,
    generateVideo,
    generateVariant,
    setCurrentScene,
    selectScene,
  };
}
