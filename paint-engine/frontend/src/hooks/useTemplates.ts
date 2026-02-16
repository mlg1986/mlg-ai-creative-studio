import { useState, useEffect, useCallback } from 'react';
import { SceneTemplate } from '../types';
import { api } from '../services/api';

export function useTemplates() {
  const [templates, setTemplates] = useState<SceneTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    setLoading(true);
    api.templates.getAll()
      .then(setTemplates)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { templates, loading, refresh };
}
