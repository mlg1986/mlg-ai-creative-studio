export interface MaterialImage {
  id: string;
  material_id: string;
  image_path: string;
  perspective: string;
  is_primary: number;
  created_at: string;
}

export interface Material {
  id: string;
  name: string;
  category: string;
  description?: string;
  material_type?: string;
  dimensions?: string;
  surface?: string;
  weight?: string;
  color?: string;
  format_code?: string;
  size?: string;
  frame_option?: string;
  status: 'idle' | 'engaged';
  created_at: string;
  updated_at: string;
  images: MaterialImage[];
}

export interface SceneTemplate {
  id: string;
  name: string;
  icon: string;
  description: string;
  prompt_template: string;
  typical_use: string;
  is_builtin: number;
}

export interface VerificationIssue {
  materialId?: string;
  materialName?: string;
  issueType: 'label' | 'orientation' | 'material' | 'proportion' | 'color' | 'other';
  description: string;
  severity: 'critical' | 'major' | 'minor';
}

export interface Scene {
  id: string;
  project_id: string;
  name: string;
  order_index: number;
  template_id?: string;
  scene_description?: string;
  prompt_tags?: string | null; // JSON array of tag IDs
  enriched_prompt?: string;
  format?: string;
  export_preset?: string;
  target_width?: number | null;
  target_height?: number | null;
  blueprint_image_path?: string;
  motif_image_path?: string;
  /** JSON array of motif image paths when multiple are uploaded (max 4). */
  motif_image_paths?: string | null;
  /** JSON array of extra reference image paths (person, objects, etc.). */
  extra_reference_paths?: string | null;
  image_path?: string;
  image_status: 'draft' | 'generating' | 'done' | 'failed';
  video_prompt?: string;
  video_style?: string;
  video_duration: number;
  video_path?: string;
  video_status: 'none' | 'generating' | 'done' | 'failed';
  review_notes?: string | null;
  review_rating?: number | null;
  last_refinement_prompt?: string | null;
  last_refinement_materials?: string | null;
  last_error_message?: string | null;
  verification_score?: number | null;
  verification_issues?: string | null; // JSON array of VerificationIssue
  verification_attempts?: number;
  video_verification_score?: number | null;
  materials?: Material[];
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  name: string;
  status: string;
  sceneCount?: number;
  created_at: string;
  updated_at: string;
}

export interface Toast {
  id: string;
  type: 'error' | 'success' | 'info';
  title: string;
  message: string;
  duration?: number;
}

export type MaterialCategory = 'mnz_motif' | 'paint_pots' | 'brushes' | 'canvas' | 'frame' | 'tool' | 'packaging' | 'accessory';

export const CATEGORY_LABELS: Record<MaterialCategory, string> = {
  mnz_motif: 'MNZ-Motiv',
  paint_pots: 'Farbtöpfe',
  brushes: 'Pinsel',
  canvas: 'Leinwand',
  frame: 'Rahmen',
  tool: 'Werkzeug',
  packaging: 'Verpackung',
  accessory: 'Zubehör',
};

export const PERSPECTIVES = ['front', 'side', 'top', 'detail', 'open', 'packaged'] as const;

export interface ExportPreset {
  id: string;
  name: string;
  width: number;
  height: number;
  is_builtin: number;
  created_at: string;
}

// Fallback hardcoded presets (used if API not loaded yet)
export const DEFAULT_EXPORT_PRESETS = [
  { value: 'facebook_banner', label: 'Facebook Banner 1640x624' },
  { value: 'instagram_post', label: 'Instagram Post 1080x1080' },
  { value: 'instagram_story', label: 'Instagram Story 1080x1920' },
  { value: 'youtube_thumbnail', label: 'YouTube Thumbnail 1280x720' },
  { value: 'free', label: 'Freies Format' },
];

export const VIDEO_STYLES = [
  { value: 'cinematic', label: 'Cinematic', icon: '🎬' },
  { value: 'energetic', label: 'Energetic', icon: '⚡' },
  { value: 'minimal', label: 'Minimal', icon: '✨' },
  { value: 'cozy', label: 'Cozy/Lifestyle', icon: '🕯️' },
];

export const PROMPT_TAG_CATEGORIES = [
  {
    id: 'context',
    name: 'Zweck / Kontext',
    tags: [
      { id: 'tag-shop-banner-desktop', label: 'Shop Banner Desktop', prompt: 'Banner for a new product launch on a high-end e-commerce website (desktop version).' },
      { id: 'tag-shop-banner-mobile', label: 'Shop Banner Mobile', prompt: 'Vertical banner for a new product launch on a high-end e-commerce website (mobile version).' },
      { id: 'tag-social-post', label: 'Social Media Post', prompt: 'Eye-catching social media post optimized for engagement.' },
      { id: 'tag-product-pres', label: 'Produkt-Präsentation', prompt: 'Professional product presentation for a catalog or lookbook.' },
    ]
  },
  {
    id: 'lifestyle',
    name: 'Akteure & Lifestyle',
    tags: [
      { id: 'tag-person-painting', label: 'Person malt', prompt: 'A person is actively painting the canvas, creating a creative and focused atmosphere.' },
      { id: 'tag-hands-focus', label: 'Hände im Fokus', prompt: 'Close-up on hands artistically applying paint to the canvas.' },
      { id: 'tag-no-person', label: 'Keine Personen', prompt: 'A clean scene without any people, focusing solely on the objects.' },
      { id: 'tag-creative-mess', label: 'Künstlerisches Chaos', prompt: 'A lively, creative workspace with some artistic mess, used brushes, and open paint pots.' },
    ]
  },
  {
    id: 'lighting',
    name: 'Licht & Stimmung',
    tags: [
      { id: 'tag-natural-daylight', label: 'Natürliches Tageslicht', prompt: 'Bright, natural daylight coming from a large window.' },
      { id: 'tag-warm-window', label: 'Warmes Fensterlicht', prompt: 'Warm sunrays from a window during golden hour, creating soft shadows.' },
      { id: 'tag-clean-studio', label: 'Studio-Beleuchtung', prompt: 'Clean, professional studio lighting with minimal shadows.' },
      { id: 'tag-cozy-evening', label: 'Abendstimmung', prompt: 'Cozy, warm evening atmosphere with soft ambient indoor lighting.' },
    ]
  },
  {
    id: 'composition',
    name: 'Komposition',
    tags: [
      { id: 'tag-close-up', label: 'Nahaufnahme', prompt: 'A detailed close-up shot focusing on specific textures and materials.' },
      { id: 'tag-flat-lay', label: 'Flat Lay', prompt: 'An overhead flat-lay shot with all materials artfully arranged on a flat surface.' },
      { id: 'tag-lifestyle-room', label: 'Lifestyle (im Raum)', prompt: 'Wide shot showing the products within a stylish, modern living space or atelier.' },
      { id: 'tag-detail-focus', label: 'Fokus auf Details', prompt: 'Shallow depth of field concentrating on the fine details of the brushes and paint.' },
      { id: 'tag-partially-unpainted', label: 'Teils unausgemalt', prompt: 'The canvas shows a work-in-progress state with some areas still as raw paint-by-numbers template.' },
    ]
  }
];
