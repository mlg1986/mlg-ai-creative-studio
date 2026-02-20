import { useState, useCallback, useRef, useEffect } from 'react';
import { Scene } from '../types';
import { api } from '../services/api';

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_MS = 15 * 60 * 1000; // 15 min – stop polling so UI doesn't loop forever if backend never finishes

export function useScene() {
  const [currentScene, setCurrentScene] = useState<Scene | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generatedFromNew, setGeneratedFromNew] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clear any existing poll when starting a new one, and on unmount
  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => {
    return stopPolling;
  }, [stopPolling]);

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

      stopPolling();
      const pollStart = Date.now();
      pollRef.current = setInterval(async () => {
        if (Date.now() - pollStart > MAX_POLL_MS) {
          stopPolling();
          setGenerating(false);
          return;
        }
        try {
          const scene = await api.scenes.get(result.id);
          setCurrentScene(scene);
          if (scene.image_status === 'done' || scene.image_status === 'failed') {
            stopPolling();
            setGenerating(false);
          }
        } catch {
          // Keep polling
        }
      }, POLL_INTERVAL_MS);
    } catch {
      setGenerating(false);
    }
  }, [stopPolling]);

  const regenerate = useCallback(async () => {
    if (!currentScene) return;
    setGenerating(true);
    try {
      await api.scenes.regenerate(currentScene.id);
      setCurrentScene(prev => prev ? { ...prev, image_status: 'generating' } : null);

      stopPolling();
      const pollStart = Date.now();
      const sceneId = currentScene.id;
      pollRef.current = setInterval(async () => {
        if (Date.now() - pollStart > MAX_POLL_MS) {
          stopPolling();
          setGenerating(false);
          return;
        }
        try {
          const scene = await api.scenes.get(sceneId);
          setCurrentScene(scene);
          if (scene.image_status === 'done' || scene.image_status === 'failed') {
            stopPolling();
            setGenerating(false);
          }
        } catch { /* keep polling */ }
      }, POLL_INTERVAL_MS);
    } catch {
      setGenerating(false);
    }
  }, [currentScene, stopPolling]);

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

      stopPolling();
      const pollStart = Date.now();
      const variantSceneId = result.id;
      pollRef.current = setInterval(async () => {
        if (Date.now() - pollStart > MAX_POLL_MS) {
          stopPolling();
          setGenerating(false);
          return;
        }
        try {
          const scene = await api.scenes.get(variantSceneId);
          setCurrentScene(scene);
          if (scene.image_status === 'done' || scene.image_status === 'failed') {
            stopPolling();
            setGenerating(false);
          }
        } catch { /* keep polling */ }
      }, POLL_INTERVAL_MS);
    } catch {
      setGenerating(false);
    }
  }, [stopPolling]);

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

      stopPolling();
      const pollStart = Date.now();
      const sceneId = currentScene.id;
      pollRef.current = setInterval(async () => {
        if (Date.now() - pollStart > MAX_POLL_MS) {
          stopPolling();
          setGenerating(false);
          return;
        }
        try {
          const scene = await api.scenes.get(sceneId);
          setCurrentScene(scene);
          if (scene.image_status === 'done' || scene.image_status === 'failed') {
            stopPolling();
            setGenerating(false);
          }
        } catch { /* keep polling */ }
      }, POLL_INTERVAL_MS);
    } catch {
      setGenerating(false);
    }
  }, [currentScene, stopPolling]);

  const visionCorrection = useCallback(async () => {
    if (!currentScene) return;
    setGenerating(true);
    try {
      await api.scenes.visionCorrection(currentScene.id);
      setCurrentScene(prev => prev ? { ...prev, image_status: 'generating' } : null);

      stopPolling();
      const pollStart = Date.now();
      const sceneId = currentScene.id;
      pollRef.current = setInterval(async () => {
        if (Date.now() - pollStart > MAX_POLL_MS) {
          stopPolling();
          setGenerating(false);
          return;
        }
        try {
          const scene = await api.scenes.get(sceneId);
          setCurrentScene(scene);
          if (scene.image_status === 'done' || scene.image_status === 'failed') {
            stopPolling();
            setGenerating(false);
          }
        } catch { /* keep polling */ }
      }, POLL_INTERVAL_MS);
    } catch {
      setGenerating(false);
    }
  }, [currentScene, stopPolling]);

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
