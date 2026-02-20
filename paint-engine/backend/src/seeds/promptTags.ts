export interface BuiltinPromptTag {
  id: string;
  category_id: string;
  label: string;
  prompt: string;
  order_index: number;
}

export const BUILTIN_PROMPT_TAGS: BuiltinPromptTag[] = [
  { id: 'tag-shop-banner-desktop', category_id: 'context', label: 'Shop Banner Desktop', prompt: 'Banner for a new product launch on a high-end e-commerce website (desktop version).', order_index: 0 },
  { id: 'tag-shop-banner-mobile', category_id: 'context', label: 'Shop Banner Mobile', prompt: 'Vertical banner for a new product launch on a high-end e-commerce website (mobile version).', order_index: 1 },
  { id: 'tag-social-post', category_id: 'context', label: 'Social Media Post', prompt: 'Eye-catching social media post optimized for engagement.', order_index: 2 },
  { id: 'tag-product-pres', category_id: 'context', label: 'Produkt-Präsentation', prompt: 'Professional product presentation for a catalog or lookbook.', order_index: 3 },
  { id: 'tag-person-painting', category_id: 'lifestyle', label: 'Person malt', prompt: 'A person is actively painting the canvas, creating a creative and focused atmosphere.', order_index: 0 },
  { id: 'tag-hands-focus', category_id: 'lifestyle', label: 'Hände im Fokus', prompt: 'Close-up on hands artistically applying paint to the canvas.', order_index: 1 },
  { id: 'tag-no-person', category_id: 'lifestyle', label: 'Keine Personen', prompt: 'A clean scene without any people, focusing solely on the objects.', order_index: 2 },
  { id: 'tag-creative-mess', category_id: 'lifestyle', label: 'Künstlerisches Chaos', prompt: 'A lively, creative workspace with some artistic mess, used brushes, and open paint pots.', order_index: 3 },
  { id: 'tag-natural-daylight', category_id: 'lighting', label: 'Natürliches Tageslicht', prompt: 'Bright, natural daylight coming from a large window.', order_index: 0 },
  { id: 'tag-warm-window', category_id: 'lighting', label: 'Warmes Fensterlicht', prompt: 'Warm sunrays from a window during golden hour, creating soft shadows.', order_index: 1 },
  { id: 'tag-clean-studio', category_id: 'lighting', label: 'Studio-Beleuchtung', prompt: 'Clean, professional studio lighting with minimal shadows.', order_index: 2 },
  { id: 'tag-cozy-evening', category_id: 'lighting', label: 'Abendstimmung', prompt: 'Cozy, warm evening atmosphere with soft ambient indoor lighting.', order_index: 3 },
  { id: 'tag-close-up', category_id: 'composition', label: 'Nahaufnahme', prompt: 'A detailed close-up shot focusing on specific textures and materials.', order_index: 0 },
  { id: 'tag-flat-lay', category_id: 'composition', label: 'Flat Lay', prompt: 'An overhead flat-lay shot with all materials artfully arranged on a flat surface.', order_index: 1 },
  { id: 'tag-lifestyle-room', category_id: 'composition', label: 'Lifestyle (im Raum)', prompt: 'Wide shot showing the products within a stylish, modern living space or atelier.', order_index: 2 },
  { id: 'tag-detail-focus', category_id: 'composition', label: 'Fokus auf Details', prompt: 'Shallow depth of field concentrating on the fine details of the brushes and paint.', order_index: 3 },
  { id: 'tag-partially-unpainted', category_id: 'composition', label: 'Teils unausgemalt', prompt: 'The canvas is currently being painted. Parts of the canvas are already filled with vibrant acrylic paint, while other sections are still in their raw "paint-by-numbers" template state, showing only the grey outlines and tiny printed numbers clearly visible. This creates a "work in progress" look.', order_index: 4 },
];
