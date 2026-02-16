import { useState, useEffect, useCallback } from 'react';
import { ExportPreset } from '../types';
import { api } from '../services/api';

export function usePresets() {
  const [presets, setPresets] = useState<ExportPreset[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await api.presets.getAll();
      setPresets(data);
    } catch {
      // Toast already shown
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const createPreset = async (name: string, width: number, height: number) => {
    const preset = await api.presets.create({ name, width, height });
    setPresets(prev => [...prev, preset]);
    return preset;
  };

  const deletePreset = async (id: string) => {
    await api.presets.delete(id);
    setPresets(prev => prev.filter(p => p.id !== id));
  };

  return { presets, loading, refresh, createPreset, deletePreset };
}
