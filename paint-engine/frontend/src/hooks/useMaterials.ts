import { useState, useEffect, useCallback } from 'react';
import { Material } from '../types';
import { api } from '../services/api';

export function useMaterials() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await api.materials.getAll();
      setMaterials(data);
    } catch {
      // Toast already shown
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const toggleStatus = async (id: string) => {
    const result = await api.materials.toggleStatus(id);
    setMaterials(prev => prev.map(m => m.id === id ? { ...m, status: result.status as any } : m));
  };

  const deleteMaterial = async (id: string) => {
    await api.materials.delete(id);
    setMaterials(prev => prev.filter(m => m.id !== id));
  };

  const engagedMaterials = materials.filter(m => m.status === 'engaged');

  return { materials, engagedMaterials, loading, refresh, toggleStatus, deleteMaterial };
}
