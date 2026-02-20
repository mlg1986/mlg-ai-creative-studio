interface MaterialData {
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
}

export function buildMaterialContext(material: MaterialData): string {
  let context = `Material: "${material.name}" (${material.category})\n`;
  if (material.material_type) context += `- Typ: ${material.material_type}\n`;
  if (material.dimensions) context += `- Maße: ${material.dimensions}\n`;
  if (material.surface) context += `- Oberfläche: ${material.surface}\n`;
  if (material.weight) context += `- Gewicht: ${material.weight}\n`;
  if (material.color) context += `- Farbe: ${material.color}\n`;
  if (material.description) context += `- Beschreibung: ${material.description}\n`;

  // Category-specific details
  if (material.category === 'mnz_motif') {
    if (material.format_code) context += `- Format: ${material.format_code}\n`;
    if (material.size) context += `- Größe: ${material.size} cm\n`;
    if (material.frame_option) {
      const frameLabels: Record<string, string> = {
        'OR': 'Vorlage (ungerahmt, gerollt)',
        'R': 'Gerahmt (auf Keilrahmen gespannt)',
        'DIYR': 'DIY-Keilrahmen-Set',
      };
      context += `- Rahmenoption: ${frameLabels[material.frame_option] || material.frame_option}\n`;
    }
    context += `- WICHTIG: Die Referenzbilder zeigen nur BEISPIEL-Motive für Format und Aussehen. `;
    context += `Generiere ein NEUES, eigenständiges Motiv für die Szene. `;
    context += `Übernimm NICHT das abgebildete Motiv, sondern nur die physischen Eigenschaften (Leinwand-Textur, Rahmen, Größenverhältnis).\n`;
  }

  if (material.category === 'paint_pots') {
    context += `- WICHTIG: Die Farbtöpfe haben auf ihren weißen Deckeln gut sichtbare, gedruckte Farbnummern-Labels (z.B. "A4", "X3", "Q5", "B2"). `;
    context += `Diese Labels sind kleine, aufgedruckte Zeichenfolgen auf dem Deckel (meist 2-stellig), die bei der Malen-nach-Zahlen Zuordnung helfen. `;
    context += `Die Referenzbilder zeigen das generelle Aussehen der Töpfe. Stelle sicher, dass die Farbnummern-Labels auf den Deckeln sichtbar sind.\n`;
  }

  if (material.category === 'brushes') {
    context += `- Die Referenzbilder zeigen die Pinselform und -größe als Orientierung.\n`;
  }

  return context;
}

export function buildSceneMaterialContext(materials: MaterialData[]): string {
  return materials.map((m, i) => `${i + 1}. ${buildMaterialContext(m)}`).join('\n');
}

/**
 * Returns instructions so that only selected materials (and uploaded motifs) appear.
 * Prevents generic brushes, palettes, pencils, or any object not from materials/motifs.
 */
export function buildMaterialRestrictionPrompt(materialCategories: string[]): string {
  const present = new Set(materialCategories);
  const lines: string[] = [];
  if (!present.has('paint_pots')) {
    lines.push('Do not show paint pots, paint containers, or Farbtöpfe in this scene.');
  }
  if (!present.has('brushes')) {
    lines.push('Do not show brushes or Pinsel in this scene.');
  }
  if (!present.has('canvas')) {
    lines.push('Do not show unpainted or blank canvas (unbemalte Leinwand) in this scene.');
  }
  if (!present.has('tool')) {
    lines.push('Do not show paint palettes (Malpalette), mixing palettes, or similar painting tools in this scene.');
  }
  if (!present.has('accessory')) {
    lines.push('Do not show colored pencils (Buntstifte), markers (Filzstifte), pens, or similar accessories in this scene.');
  }
  if (!present.has('frame')) {
    lines.push('Do not show frames or framing elements unless they are part of a selected material.');
  }
  if (!present.has('packaging')) {
    lines.push('Do not show packaging or packaging materials in this scene.');
  }
  lines.push('Only objects that come from the provided reference images (selected materials) or from the uploaded motif images may appear. No generic substitutes, no extra props, no foreign objects.');
  return '## Material visibility (strict):\n' + lines.join('\n');
}

/**
 * Attempts to extract a numeric value (in mm or cm) from a dimension string.
 * Returns a value in millimeters for comparison.
 */
function parseDimensionToMm(dimStr: string): number | null {
  if (!dimStr) return null;

  // Look for patterns like "20x20 mm", "60x40 cm", "13 cm", "D20 cm"
  const cleanStr = dimStr.toLowerCase().replace(',', '.');

  // Case for "WxH unit" or "Value unit"
  const match = cleanStr.match(/(\d+\.?\d*)\s*(x\s*(\d+\.?\d*))?\s*(mm|cm)/);
  if (!match) return null;

  const val1 = parseFloat(match[1]);
  const val2 = match[3] ? parseFloat(match[3]) : val1;
  const unit = match[4];

  const maxVal = Math.max(val1, val2);
  return unit === 'cm' ? maxVal * 10 : maxVal;
}

/**
 * Builds a summary of relative physical scales to help the AI maintain proportions.
 */
export function buildScaleContext(materials: MaterialData[]): string {
  const scaledMaterials = materials
    .map(m => ({
      name: m.name,
      mm: parseDimensionToMm(m.dimensions || m.size || '')
    }))
    .filter(m => m.mm !== null) as { name: string; mm: number }[];

  if (scaledMaterials.length < 2) return '';

  // Sort by size
  scaledMaterials.sort((a, b) => a.mm - b.mm);

  const smallest = scaledMaterials[0] || null;
  const largest = scaledMaterials[scaledMaterials.length - 1];

  if (!smallest || !largest || smallest === largest) return '';

  let context = `PHYSICAL SCALE REFERENCE (CRITICAL):\n`;
  context += `- The smallest object is ${smallest.name} (~${Math.round(smallest.mm / 10)} cm).\n`;
  context += `- The largest object is ${largest.name} (~${Math.round(largest.mm / 10)} cm).\n`;

  const ratio = largest.mm / smallest.mm;
  context += `- PROPORTION: The ${largest.name} is approximately ${Math.round(ratio)}x larger than the ${smallest.name}.\n`;
  context += `- VISUAL GUIDE: If a ${smallest.name} is the size of a coin, the ${largest.name} should be the size of ${ratio > 10 ? 'a large furniture piece' : 'a laptop'} in comparison.\n`;

  return context;
}

/**
 * Builds category-specific reference image instructions for the image generation prompt.
 * This tells the AI how to interpret reference images per material type.
 */
export function buildReferenceImageInstructions(materials: MaterialData[], hasMotifImage: boolean = false): string {
  const instructions: string[] = [];

  const hasMnz = materials.some(m => m.category === 'mnz_motif');
  const hasPaintPots = materials.some(m => m.category === 'paint_pots');
  const hasOther = materials.some(m => !['mnz_motif', 'paint_pots'].includes(m.category));

  if (hasMnz) {
    if (hasMotifImage) {
      instructions.push(
        `MNZ-MOTIV / LEINWAND: Use the material reference only for canvas format, frame, and texture. ` +
        `The actual motif on the canvas MUST come ONLY from the uploaded motif images (the last reference image(s)). Do not use or copy the motif from the material reference photos.`
      );
    } else {
      instructions.push(
        `MNZ-MOTIV REFERENZBILDER: Diese zeigen BEISPIEL-Leinwände. Nutze sie NUR als Referenz für Format, Rahmen und Leinwand-Textur. ` +
        `Generiere ein KOMPLETT NEUES, eigenständiges Motiv auf der Leinwand – NICHT das auf den Referenzbildern abgebildete Motiv kopieren.`
      );
    }
  }

  if (hasPaintPots) {
    instructions.push(
      `FARBTOPF REFERENZBILDER: Diese zeigen das generelle Aussehen der Acryl-Farbtöpfe. ` +
      `Achte darauf, dass jeder Farbtopf ein gut lesbares Farbnummern-Label (z.B. "A4", "X3", "Q5") auf dem weißen Deckel hat. ` +
      `Die Farbtöpfe enthalten unterschiedliche Farben – der Inhalt ist durch den transparenten Topf sichtbar. ` +
      `Die Deckel sind weiß mit aufgedruckter 2-stelliger Nummer/Buchstaben-Kombination.`
    );
  }

  if (hasOther) {
    instructions.push(
      `SONSTIGE MATERIALIEN: Die Referenzbilder zeigen das exakte Aussehen dieser Materialien. ` +
      `Übernimm ihr Erscheinungsbild, ihre Proportionen und Oberflächeneigenschaften so genau wie möglich.`
    );
  }

  return instructions.join('\n\n');
}

/**
 * NEW: Builds detailed per-image reference instructions with explicit match requirements.
 * Each reference image gets numbered instructions on how it should be interpreted.
 */
interface ReferenceImageWithContext {
  index: number;
  materialName: string;
  category: string;
  perspective?: string;
  matchType: 'EXACT_MATCH' | 'INSPIRATION_ONLY' | 'STRUCTURE_REFERENCE';
}

export function buildDetailedReferenceInstructions(
  referenceImages: ReferenceImageWithContext[]
): string {
  if (referenceImages.length === 0) return '';

  let instructions = '**REFERENCE IMAGE INTERPRETATION GUIDE:**\n\n';

  referenceImages.forEach((ref) => {
    const perspective = ref.perspective ? ` (${ref.perspective} view)` : '';

    switch (ref.matchType) {
      case 'EXACT_MATCH':
        instructions += `[REF-${ref.index}] ${ref.materialName}${perspective}:\n`;
        instructions += `  → EXACT MATCH REQUIRED\n`;
        instructions += `  → Reproduce this EXACT appearance: shape, color, labels, material texture, surface properties\n`;
        instructions += `  → If labels/text are visible, reproduce them EXACTLY as shown\n`;
        instructions += `  → Maintain same proportions and physical dimensions\n\n`;
        break;

      case 'INSPIRATION_ONLY':
        instructions += `[REF-${ref.index}] ${ref.materialName}${perspective}:\n`;
        instructions += `  → INSPIRATION ONLY - DO NOT COPY\n`;
        instructions += `  → Use ONLY for understanding format, frame type, and canvas texture\n`;
        instructions += `  → Generate NEW unique motif/content - do not reproduce the motif shown\n`;
        instructions += `  → Match canvas size and frame type EXACTLY\n\n`;
        break;

      case 'STRUCTURE_REFERENCE':
        instructions += `[REF-${ref.index}] ${ref.materialName}${perspective}:\n`;
        instructions += `  → STRUCTURE REFERENCE\n`;
        instructions += `  → Match structural elements: size, shape, frame, material type\n`;
        instructions += `  → Match surface texture and finish\n`;
        instructions += `  → DO NOT copy any motif/graphics if present\n\n`;
        break;
    }
  });

  return instructions;
}

export const SCENE_INTELLIGENCE_SYSTEM_PROMPT = `You are a professional product photographer AI for a paint-by-numbers brand called "malango".
You understand the physical properties of each material (size, weight, surface texture, material type) and use this knowledge to create photorealistic scene descriptions.

CRITICAL RULES:
- ONLY MATERIALS AND UPLOADED MOTIFS: The scene may contain ONLY (1) the exact materials listed in the user prompt and shown in the reference images, and (2) the exact motif(s) from uploaded motif images, if any. Do NOT suggest or add brushes, palettes, colored pencils, pens, or any props that are not in the provided materials list. No generic or foreign objects.
- FRAME/PRESENTATION FROM TEMPLATE ONLY: Do NOT invent or add specific frame types (e.g. shadow gap frame, floating frame, classic frame, no shadow gap, no floating). How artworks are presented (stretched canvas, unframed, on wall, etc.) must come ONLY from the "Scene Guidance" (template) and "Style Format" (vorlage = unframed template, gerahmt = stretched on wooden frame, ausmalen = artistically painted). Use exactly the wording and style from the template; do not add your own frame descriptions.
- MATERIAL FIDELITY IS NON-NEGOTIABLE: The generated image must show the EXACT materials provided in the reference images. Do NOT simplify, stylize, or replace them with generic versions.
- CORRECT RELATIVE SCALE: You MUST respect the provided dimensions. Compare the sizes of all objects (e.g., a 2cm paint pot is tiny compared to a 60cm canvas). Small items should look small, and large items should dominate the scene when appropriate.
- PROPORTIONAL ARRANGEMENT: When placing objects together (e.g., paint pots on a canvas), ensure the footprint of the smaller object matches its real-world dimensions relative to the larger one.
- Surface textures must match: glossy plastic reflects light differently than matte wood.
- Weight affects how objects rest on surfaces: heavy items sit firmly, light items can be stacked.
- Consider material interactions: glass refracts, metal reflects, fabric drapes.
- NO TEXT OR TYPOGRAPHY: Do NOT generate any text, words, or typography on the banners, products, or packaging unless explicitly requested in the user description. Banners should be visual only.
- Always describe specific lighting that enhances the material properties.

NON-NEGOTIABLE MATERIAL FIDELITY RULES:
1. **Paint pot labels**: Reproduce EXACTLY as shown in reference (alpha-numeric codes like "A4", "X3", "Q5" - usually 2 characters). Labels must be clearly visible and legible on WHITE lids.
2. **Canvas orientation**: ALWAYS show FRONT side (where motif is/would be painted). NEVER show back side with text/printing.
3. **Material textures**: Match plastic vs wood vs metal vs fabric PRECISELY. Glossy plastic has specular highlights, wood has grain patterns.
4. **Scale proportions**: Maintain exact relative sizes (e.g., 2cm pot vs 60cm canvas = 1:30 ratio). If pot looks coin-sized, canvas should look like a large frame.
5. **Color accuracy**: Match reference colors within 95% accuracy. Preserve hue, saturation, and brightness from reference images.
6. **Label typography**: If labels have specific fonts/styles in reference, reproduce them EXACTLY. Do not substitute or improvise.
7. **Surface finish**: Matte vs glossy must match reference. Check for reflections, highlights, and how light interacts with each surface.

SPECIAL MATERIAL RULES:
- MNZ-Motiv (Paint-by-Numbers Canvas): Material reference photos show EXAMPLE canvases only (for texture, frame, proportions). If a separate CANVAS MOTIF IMAGE is provided (always the last reference image), use THAT exact motif on the canvas. Otherwise, generate a NEW, original motif.
- Farbtöpfe (Paint Pots / Tiegel): These are SMALL, INDIVIDUAL PLASTIC POTS filled with acrylic paint. 
  - SIZE: They are approximately 2cm x 2cm. They should appear very small if placed next to a large canvas.
  - LID: Each pot has a WHITE PLASTIC SNAP-LID.
  - LABEL: There is a CLEARLY VISIBLE, ROUND WHITE LABEL on top of each lid with a PRINTED ALPHA-NUMERIC CODE (e.g. "A4", "X3", "Q5"). These codes are Essential and usually exactly 2 characters.
  - BODY: The pot body is TRANSPARENT or semi-transparent plastic, showing the vibrant acrylic paint color inside.
  - ARRANGEMENT: They are often connected in strips of 6 or 8, or arranged in a circular wooden holder (Tiegel-Halter).
- Pinsel (Brushes): Reference photos show brush shape/size. Render them with accurate bristle textures and handle materials (usually wood or plastic).
- All other materials: Reproduce their exact appearance from reference photos as closely as possible. If the reference shows a wooden palette for pots, render THAT specific palette.
`;

export const TAG_PROMPTS: Record<string, string> = {
  // Kontext
  'tag-shop-banner-desktop': 'Banner for a new product launch on a high-end e-commerce website (desktop version).',
  'tag-shop-banner-mobile': 'Vertical banner for a new product launch on a high-end e-commerce website (mobile version).',
  'tag-social-post': 'Eye-catching social media post optimized for engagement.',
  'tag-product-pres': 'Professional product presentation for a catalog or lookbook.',
  // Lifestyle
  'tag-person-painting': 'A person is actively painting the canvas, creating a creative and focused atmosphere.',
  'tag-hands-focus': 'Close-up on hands artistically applying paint to the canvas.',
  'tag-no-person': 'A clean scene without any people, focusing solely on the objects.',
  'tag-creative-mess': 'A lively, creative workspace with some artistic mess, used brushes, and open paint pots.',
  // Licht
  'tag-natural-daylight': 'Bright, natural daylight coming from a large window.',
  'tag-warm-window': 'Warm sunrays from a window during golden hour, creating soft shadows.',
  'tag-clean-studio': 'Clean, professional studio lighting with minimal shadows.',
  'tag-cozy-evening': 'Cozy, warm evening atmosphere with soft ambient indoor lighting.',
  // Komposition
  'tag-close-up': 'A detailed close-up shot focusing on specific textures and materials.',
  'tag-flat-lay': 'An overhead flat-lay shot with all materials artfully arranged on a flat surface.',
  'tag-lifestyle-room': 'Wide shot showing the products within a stylish, modern living space or atelier.',
  'tag-detail-focus': 'Shallow depth of field concentrating on the fine details of the brushes and paint.',
  // Leinwand Status
  'tag-partially-unpainted': 'The canvas is currently being painted. Parts of the canvas are already filled with vibrant acrylic paint, while other sections are still in their raw "paint-by-numbers" template state, showing only the grey outlines and tiny printed numbers clearly visible. This creates a "work in progress" look.',
};

/** When using FLUX 2 Pro with 8-slot order: Blueprint, ExtraRefs, Motifs, Materials. Used for explicit index instructions. */
export type Flux2ProRefIndices = { blueprintCount: number; extraRefCount: number; motifCount: number };

export function buildImageGenerationPrompt(
  enrichedPrompt: string,
  materials: MaterialData[],
  hasMotifImage: boolean = false,
  aspectRatio?: string,
  promptTags: string[] = [],
  tagPromptsMap?: Record<string, string>,
  flux2ProRefIndices?: Flux2ProRefIndices
): string {
  const refInstructions = buildReferenceImageInstructions(materials, hasMotifImage);
  const tagMap = tagPromptsMap ?? TAG_PROMPTS;

  let indexSection = '';
  if (flux2ProRefIndices && (flux2ProRefIndices.blueprintCount > 0 || flux2ProRefIndices.extraRefCount > 0 || flux2ProRefIndices.motifCount > 0)) {
    const { blueprintCount, extraRefCount, motifCount } = flux2ProRefIndices;
    let idx = 1;
    const parts: string[] = [];
    if (blueprintCount > 0) {
      parts.push(`Image ${idx} = composition blueprint`);
      idx += blueprintCount;
    }
    if (extraRefCount > 0) {
      const range = extraRefCount === 1 ? `Image ${idx}` : `Images ${idx}-${idx + extraRefCount - 1}`;
      parts.push(`${range} = reference person(s)/object(s) to include in the scene`);
      idx += extraRefCount;
    }
    if (motifCount > 0) {
      const range = motifCount === 1 ? `Image ${idx}` : `Images ${idx}-${idx + motifCount - 1}`;
      parts.push(`${range} = motif canvases – reproduce exactly, same aspect ratio and content; do not add, duplicate, or alter`);
      idx += motifCount;
    }
    if (idx <= 8) parts.push(`Images ${idx}-8 = material reference images`);
    indexSection = `\n\nREFERENCE IMAGE INDEX (use exactly as provided): ${parts.join('. ')}. Reproduce the content of each reference image faithfully. Do not add, remove, or alter elements that are not in the reference images. Do not duplicate or change the aspect ratio of motif images.\n`;
  }

  let motifSection = '';
  if (hasMotifImage) {
    motifSection = `\n\nCANVAS MOTIF IMAGES (STRICT – NO HALLUCINATION):
The LAST reference image(s) are the user's uploaded artwork. You MUST show these EXACT images on the canvas – not a variation, not an interpretation, not new artwork.
- The artwork on the wall/canvas must be a faithful reproduction of those uploaded motif image(s): same subject, same colors, same composition, same details. Do NOT re-draw or re-invent.
- ONLY these uploaded motif images may appear as canvas graphics. Do NOT add any other motifs, logos, or graphics. Do NOT generate new artwork; display the exact motif image content.
- Preserve each motif's exact aspect ratio and proportions; do not stretch, crop, or distort. Each motif appears exactly once, identical in content to its reference image.
- Render each motif as the finished artwork on canvas (content = exact copy of the reference). Use paint-by-numbers texture only if the scene description explicitly requests it.
- CRITICAL: If you cannot reproduce the motif pixel-accurately, still do not substitute a different image – keep the same subject and composition as in the reference.`;
  }

  const tagPrompts = promptTags
    .map(id => tagMap[id])
    .filter(Boolean)
    .map(p => `- ${p}`)
    .join('\n');

  const tagSection = tagPrompts ? `\n\nSCENE ELEMENTS (selected use case):\n${tagPrompts}` : '';

  const scaleContext = buildScaleContext(materials);
  const scaleSection = scaleContext ? `\n\n${scaleContext}` : '';

  const arInstruction = aspectRatio && aspectRatio !== '1:1'
    ? `\n\nIMPORTANT: The target aspect ratio for this image is ${aspectRatio}. Ensure the composition is optimized for this format.`
    : '';

  const refBlock = refInstructions.trim()
    ? refInstructions.trim()
    : 'Use the reference images in order: material references first, then motif images (last). Reproduce each faithfully; do not add, duplicate, or alter content.';

  return `STRICT SOURCE RULE – ONLY USE PROVIDED SOURCES:
Only the following may appear in this image:
1. The exact materials shown in the reference images (by the material list). No generic brushes, palettes, pencils, pens, or other objects not in the reference images.
2. The exact motif(s) from the uploaded motif images (the last reference image(s)), if any. The canvas must show these exact images – do NOT hallucinate or invent different artwork.
Do NOT add any object, prop, or graphic that is not in the provided reference images or uploaded motifs. Preserve motif aspect ratios; each motif exactly once, same content and proportions as in its reference image. Canvas artwork = exact copy of the last reference image(s); no variations.
${indexSection}
Generate a photorealistic product photograph based on this description:

${enrichedPrompt}

REFERENCE IMAGE HANDLING:
${refBlock}${motifSection}${tagSection}${scaleSection}${arInstruction}

Reminder: Preserve motif aspect ratios; only use provided sources; no adding or duplicating. Maintain correct physical proportions. The result must look like a professional product photograph.

CRITICAL: Do not add any text, writing, labels, numbers, or letters onto the image unless explicitly requested in the description above. If no text is requested, the image must contain NO visible text or writing.`;
}

/** System prompt to turn user feedback into prompt addendum instructions for image generation. */
export const FEEDBACK_ADDENDUM_SYSTEM_PROMPT = `You are a prompt engineer for "malango". Your task is to convert user feedback about a generated photo into precise, short instructions in English for image-to-image refinement.

CONTEXT PROVIDED:
1. User Feedback: What the user wants to change.
2. Original Scene Context: The background/mood of the scene.
3. Material Context: GROUND TRUTH specifications of the materials in the scene (paint pots, brushes, canvas). Use this to ensure instructions are physically accurate.
4. (Optional) EXTENSION IMAGE: If present, the user has uploaded an additional image that shows how a person/object should look. Only reference this if the section is present.
5. (Optional) MATERIALS TO INCLUDE: If present, the user wants these additional materials added to the scene. Only reference this if the section is present.

RULES:
- STRICT FIDELITY: Output ONLY instructions that directly correspond to what the user explicitly wrote in their feedback. Do NOT invent, assume, or add any details the user did not mention (e.g. clothing style, hairstyle, pose, colors, accessories). If the user says "add a person", do NOT specify what the person wears or how they look unless the user described it.
- Output ONLY the instructions as numbered bullet points, no explanations or preamble.
- Each instruction should be one clear sentence (e.g. "Ensure the paint-by-numbers labels on the lids show 'A4' and 'X3' clearly.").
- SCALE & FIDELITY: Use the material context to correct proportions (e.g. if a pot is 2cm and looks 10cm, instruct to reduce it).
- LABELS: Labels on paint pots are ALPHA-NUMERIC and usually exactly 2 characters (e.g., A4, X3, Q5). Correct them if the user mentions they are wrong or if they look like plain numbers.
- Keep language suitable for an image generation prompt.
- EXTENSION IMAGE RULE: If the context contains an "EXTENSION IMAGE" section, output exactly ONE instruction stating that the element to be added (person/object as described by the user) must match the appearance shown in the attached extension image. Do NOT invent any appearance details beyond what the user wrote and what the extension image shows.
- MATERIALS TO INCLUDE RULE: If the context contains a "MATERIALS TO INCLUDE" section listing material names, output exactly ONE instruction stating that these materials must be visibly placed in the scene and their appearance must match the attached material reference images. Use the material names from the list.`;

export const EXPORT_PRESET_TO_ASPECT_RATIO: Record<string, string> = {
  facebook_banner: '21:9',
  instagram_post: '1:1',
  instagram_story: '9:16',
  youtube_thumbnail: '16:9',
  free: '3:2',
};

// Gemini supported aspect ratios
const SUPPORTED_RATIOS = ['1:1', '3:4', '4:3', '9:16', '16:9', '2:3', '3:2', '21:9', '9:21'];

/**
 * Converts width x height to the nearest Gemini-supported aspect ratio.
 */
export function widthHeightToAspectRatio(width: number, height: number): string {
  const targetRatio = width / height;
  let bestMatch = '1:1';
  let bestDiff = Infinity;

  for (const ar of SUPPORTED_RATIOS) {
    const [w, h] = ar.split(':').map(Number);
    const ratio = w / h;
    const diff = Math.abs(ratio - targetRatio);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestMatch = ar;
    }
  }

  return bestMatch;
}
