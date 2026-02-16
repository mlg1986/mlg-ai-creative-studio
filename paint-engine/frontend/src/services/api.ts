import { Material, Scene, SceneTemplate, Project, Toast, ExportPreset } from '../types';

let toastListeners: ((toast: Toast) => void)[] = [];

export function onToast(listener: (toast: Toast) => void) {
  toastListeners.push(listener);
  return () => { toastListeners = toastListeners.filter(l => l !== listener); };
}

export function showToast(toast: Omit<Toast, 'id'>) {
  const id = crypto.randomUUID();
  toastListeners.forEach(l => l({ ...toast, id }));
}

interface ApiError {
  code: string;
  message: string;
  details?: any;
}

function getUserMessage(error: ApiError): string {
  const messages: Record<string, string> = {
    'AI_RATE_LIMIT': 'API-Limit erreicht. Bitte warte einen Moment und versuche es erneut.',
    'AI_SAFETY_BLOCK': 'Die KI hat die Anfrage aus Sicherheitsgründen abgelehnt. Passe die Beschreibung an.',
    'AI_TIMEOUT': 'Die KI-Generierung hat zu lange gedauert. Bitte versuche es erneut.',
    'AI_PROVIDER_ERROR': 'Fehler bei der KI-Generierung. Prüfe API-Key und versuche es erneut.',
    'MATERIAL_NOT_FOUND': 'Material nicht gefunden.',
    'VALIDATION_ERROR': error.message,
    'FILE_ERROR': 'Fehler beim Datei-Upload. Prüfe Format und Größe.',
    'INTERNAL_ERROR': 'Interner Serverfehler. Prüfe die Backend-Logs.',
  };
  return messages[error.code] || error.message || 'Ein unbekannter Fehler ist aufgetreten.';
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  try {
    const response = await fetch(`/api${url}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options?.headers },
    });

    if (!response.ok) {
      const errorBody: { error: ApiError } = await response.json().catch(() => ({
        error: { code: 'UNKNOWN', message: response.statusText },
      }));
      const userMessage = getUserMessage(errorBody.error);
      showToast({ type: 'error', title: 'Fehler', message: userMessage });
      console.error('[API Error]', { url, status: response.status, error: errorBody.error });
      throw errorBody.error;
    }

    return response.json();
  } catch (error: any) {
    if (error?.code) throw error;
    showToast({ type: 'error', title: 'Verbindungsfehler', message: 'Server nicht erreichbar. Läuft das Backend?' });
    console.error('[Network Error]', { url, error });
    throw { code: 'NETWORK_ERROR', message: error.message };
  }
}

async function apiUpload<T>(url: string, formData: FormData): Promise<T> {
  try {
    const response = await fetch(`/api${url}`, { method: 'POST', body: formData });
    const responseText = await response.text();
    if (!response.ok) {
      let errorBody: { error?: ApiError } = {};
      try {
        errorBody = JSON.parse(responseText);
      } catch {
        console.error('[API Upload]', url, response.status, responseText?.slice(0, 500));
        const message = responseText?.slice(0, 200) || response.statusText;
        showToast({ type: 'error', title: 'Upload-Fehler', message });
        throw { code: 'UNKNOWN', message };
      }
      const msg = errorBody.error ? getUserMessage(errorBody.error) : response.statusText;
      showToast({ type: 'error', title: 'Upload-Fehler', message: msg });
      throw errorBody.error ?? { code: 'UNKNOWN', message: response.statusText };
    }
    return JSON.parse(responseText) as T;
  } catch (error: any) {
    console.error('[API Upload]', url, error);
    if (error?.code) throw error;
    showToast({ type: 'error', title: 'Verbindungsfehler', message: error?.message || 'Server nicht erreichbar.' });
    throw { code: 'NETWORK_ERROR', message: error?.message };
  }
}

export const api = {
  materials: {
    getAll: () => apiFetch<Material[]>('/materials'),
    get: (id: string) => apiFetch<Material>(`/materials/${id}`),
    create: (formData: FormData) => apiUpload<Material>('/materials', formData),
    update: (id: string, data: Partial<Material>) => apiFetch<Material>(`/materials/${id}`, {
      method: 'PUT', body: JSON.stringify(data),
    }),
    delete: (id: string) => apiFetch<{ success: boolean }>(`/materials/${id}`, { method: 'DELETE' }),
    toggleStatus: (id: string) => apiFetch<{ id: string; status: string }>(`/materials/${id}/status`, { method: 'PUT' }),
    addImages: (id: string, formData: FormData) => apiUpload<any>(`/materials/${id}/images`, formData),
    deleteImage: (materialId: string, imageId: string) =>
      apiFetch<{ success: boolean }>(`/materials/${materialId}/images/${imageId}`, { method: 'DELETE' }),
  },
  templates: {
    getAll: () => apiFetch<SceneTemplate[]>('/templates'),
    create: (data: Partial<SceneTemplate>) => apiFetch<SceneTemplate>('/templates', {
      method: 'POST', body: JSON.stringify(data),
    }),
    update: (id: string, data: Partial<SceneTemplate>) => apiFetch<SceneTemplate>(`/templates/${id}`, {
      method: 'PUT', body: JSON.stringify(data),
    }),
    delete: (id: string) => apiFetch<{ success: boolean }>(`/templates/${id}`, { method: 'DELETE' }),
  },
  scenes: {
    getAll: (projectId?: string) => apiFetch<Scene[]>(`/scenes${projectId ? `?projectId=${projectId}` : ''}`),
    get: (id: string) => apiFetch<Scene>(`/scenes/${id}`),
    create: (data: any) => apiFetch<{ id: string; image_status: string }>('/scenes', {
      method: 'POST', body: JSON.stringify(data),
    }),
    update: (id: string, data: {
      review_notes?: string | null;
      review_rating?: number | null;
      name?: string | null;
      template_id?: string | null;
      scene_description?: string | null;
      prompt_tags?: string[] | null;
      format?: string | null;
      export_preset?: string | null;
      blueprint_image_path?: string | null;
      motif_image_path?: string | null;
      motif_image_paths?: string[] | null;
      materialIds?: string[];
    }) => apiFetch<Scene>(`/scenes/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string) => apiFetch<{ success: boolean }>(`/scenes/${id}`, { method: 'DELETE' }),
    regenerate: (id: string) => apiFetch<{ id: string; image_status: string }>(`/scenes/${id}/regenerate`, {
      method: 'POST',
    }),
    prepareRefinement: (id: string, materialIds?: string[]) =>
      apiFetch<{ promptAddendum: string }>(`/scenes/${id}/prepare-refinement`, {
        method: 'POST',
        body: JSON.stringify(materialIds ? { materialIds } : {}),
      }),
    regenerateWithFeedback: (id: string, materialIds?: string[], promptAddendum?: string) =>
      apiFetch<{ id: string; image_status: string }>(`/scenes/${id}/regenerate-with-feedback`, {
        method: 'POST',
        body: JSON.stringify({ materialIds, promptAddendum }),
      }),
    generateVideo: (sceneId: string, data: any) => apiFetch<any>(`/scenes/${sceneId}/video`, {
      method: 'POST', body: JSON.stringify(data),
    }),
    videoStatus: (sceneId: string) => apiFetch<any>(`/scenes/${sceneId}/video/status`),
    createVariant: (sceneId: string, exportPreset: string) => apiFetch<{ id: string; image_status: string }>(`/scenes/${sceneId}/variant`, {
      method: 'POST', body: JSON.stringify({ exportPreset }),
    }),
    uploadMotif: (formData: FormData) => apiUpload<{ paths: string[]; path?: string }>('/scenes/upload-motif', formData),
    visionCorrection: (id: string) => apiFetch<{ id: string, image_status: string, message: string, analysis?: string }>(`/scenes/${id}/vision-correction`, {
      method: 'POST',
    }),
  },
  projects: {
    getAll: () => apiFetch<Project[]>('/projects'),
    create: (name: string) => apiFetch<Project>('/projects', {
      method: 'POST', body: JSON.stringify({ name }),
    }),
    update: (id: string, name: string) => apiFetch<Project>(`/projects/${id}`, {
      method: 'PUT', body: JSON.stringify({ name }),
    }),
    delete: (id: string) => apiFetch<{ success: boolean }>(`/projects/${id}`, { method: 'DELETE' }),
  },
  presets: {
    getAll: () => apiFetch<ExportPreset[]>('/presets'),
    create: (data: { name: string; width: number; height: number }) => apiFetch<ExportPreset>('/presets', {
      method: 'POST', body: JSON.stringify(data),
    }),
    delete: (id: string) => apiFetch<{ success: boolean }>(`/presets/${id}`, { method: 'DELETE' }),
  },
  settings: {
    getApiKeyStatus: () => apiFetch<{ hasApiKey: boolean; source: string }>('/settings/api-key'),
    setApiKey: (apiKey: string) => apiFetch<{ success: boolean }>('/settings/api-key', {
      method: 'PUT', body: JSON.stringify({ apiKey }),
    }),
  },
};
