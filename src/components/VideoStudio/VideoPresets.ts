// --- VIDEO STUDIO PRESETS --- //

export type VideoAspectRatio = '16:9' | '9:16';
export type CreativeMode = 'product' | 'creative';

export interface PlatformPreset {
    id: string;
    label: string;
    platform: string;
    icon: string; // Emoji
    aspectRatio: VideoAspectRatio;
    width: number;
    height: number;
    minDuration: number;
    maxDuration: number;
    defaultDuration: number;
    category: CreativeMode;
}

export interface VideoStylePreset {
    id: string;
    label: string;
    description: string;
    promptModifier: string;
}

// --- PLATFORM PRESETS --- //

export const PRODUCT_VIDEO_PRESETS: PlatformPreset[] = [
    {
        id: 'shop-banner',
        label: 'Shop Banner',
        platform: 'E-Commerce',
        icon: '🛒',
        aspectRatio: '16:9',
        width: 1920, height: 1080,
        minDuration: 5, maxDuration: 8, defaultDuration: 5,
        category: 'product',
    },
    {
        id: 'product-page',
        label: 'Produktseite',
        platform: 'E-Commerce',
        icon: '📦',
        aspectRatio: '16:9', // Updated from 1:1
        width: 1080, height: 608,
        minDuration: 5, maxDuration: 8, defaultDuration: 5,
        category: 'product',
    },
    {
        id: 'youtube-short',
        label: 'YouTube Short',
        platform: 'YouTube',
        icon: '▶️',
        aspectRatio: '9:16',
        width: 1080, height: 1920,
        minDuration: 5, maxDuration: 8, defaultDuration: 6, // Reduced from 15s to 8s
        category: 'product',
    },
];

export const CREATIVE_PRESETS: PlatformPreset[] = [
    {
        id: 'instagram-reel',
        label: 'Instagram Reel',
        platform: 'Instagram',
        icon: '📸',
        aspectRatio: '9:16',
        width: 1080, height: 1920,
        minDuration: 5, maxDuration: 8, defaultDuration: 6, // Reduced from 15s to 8s
        category: 'creative',
    },
    {
        id: 'instagram-story',
        label: 'Instagram Story',
        platform: 'Instagram',
        icon: '📱',
        aspectRatio: '9:16',
        width: 1080, height: 1920,
        minDuration: 5, maxDuration: 8, defaultDuration: 7, // Reduced from 15s to 8s
        category: 'creative',
    },
    {
        id: 'tiktok',
        label: 'TikTok',
        platform: 'TikTok',
        icon: '🎵',
        aspectRatio: '9:16',
        width: 1080, height: 1920,
        minDuration: 5, maxDuration: 8, defaultDuration: 6, // Reduced from 15s to 8s
        category: 'creative',
    },
    {
        id: 'pinterest-pin',
        label: 'Pinterest Pin',
        platform: 'Pinterest',
        icon: '📌',
        aspectRatio: '9:16',
        width: 1000, height: 1500,
        minDuration: 5, maxDuration: 8, defaultDuration: 6, // Reduced from 10s to 8s
        category: 'creative',
    },
    {
        id: 'facebook-ad',
        label: 'Facebook Ad',
        platform: 'Facebook',
        icon: '👍',
        aspectRatio: '9:16', // Updated from 1:1
        width: 1080, height: 1920,
        minDuration: 5, maxDuration: 8, defaultDuration: 6, // Reduced from 10s to 8s
        category: 'creative',
    },
];



export const ALL_PRESETS = [...PRODUCT_VIDEO_PRESETS, ...CREATIVE_PRESETS];

// --- VIDEO STYLE PRESETS --- //

export const VIDEO_STYLES: VideoStylePreset[] = [
    {
        id: 'cinematic',
        label: 'Cinematic',
        description: 'Smooth camera drift, warm tones, premium feel',
        promptModifier: 'Cinematic slow camera movement. Warm golden-hour lighting. Shallow depth of field. Premium, high-end product photography aesthetic. Smooth dolly shot.',
    },
    {
        id: 'energetic',
        label: 'Energetic',
        description: 'Dynamic cuts, vibrant colors, trending feel',
        promptModifier: 'Dynamic, energetic camera movements. Vibrant saturated colors. Quick subtle zooms. Modern trending social media aesthetic. Eye-catching and lively.',
    },
    {
        id: 'minimal',
        label: 'Minimal',
        description: 'Clean, slow, elegant product focus',
        promptModifier: 'Ultra-clean minimalist aesthetic. Soft diffused lighting. Very slow, deliberate camera movement. White or neutral background. Focus entirely on the product.',
    },
    {
        id: 'cozy',
        label: 'Cozy / Lifestyle',
        description: 'Warm home setting, handmade feel',
        promptModifier: 'Cozy, warm home environment. Soft natural window light. Wooden desk or living room setting. Candles, plants, coffee cup nearby. Handmade crafting atmosphere.',
    },
];

// --- PROMPT BUILDERS --- //

export function buildProductVideoPrompt(
    style: VideoStylePreset,
    sceneDescription: string,
    productNames: string[],
    isFramed: boolean
): string {
    const productList = productNames.length > 0
        ? productNames.map(n => `"${n}"`).join(', ')
        : 'a paint-by-numbers canvas kit';

    let audioInstructions = "";
    if (style.id === 'cinematic') audioInstructions = "Soft, atmospheric ambient music with gentle piano notes. Subtle sounds of wind or soft brush strokes.";
    else if (style.id === 'energetic') audioInstructions = "Upbeat, rhythmical electronic beat. Short, crisp sound effects on camera movements.";
    else if (style.id === 'minimal') audioInstructions = "Clean, high-fidelity room tone. Minimalist clicks or soft digital swells.";
    else if (style.id === 'cozy') audioInstructions = "Cozy home sounds: birds chirping outside, a distant clock ticking, the soft scratch of a brush on canvas.";

    return `
PRODUCT VIDEO — Professional Paint-by-Numbers Showcase.

PRODUCT: ${isFramed
            ? 'A finished paint-by-numbers canvas, professionally stretched over a wooden frame, displayed as premium wall art.'
            : 'An unframed paint-by-numbers canvas template lying open, showing numbered zones and thin outlines. A painting kit in progress.'}

PRODUCTS SHOWN: ${productList}

SCENE: ${sceneDescription || 'A premium lifestyle setting that highlights the product.'}

STYLE: ${style.promptModifier}

AUDIO: ${audioInstructions}

INGREDIENTS:
- Use the provided reference images as visual anchors.
- Reference 1: The primary artistic motif (scene focus).
- Reference 2 & 3: High-fidelity props (Paint Pots, Brushes, or Template) that must appear physically in the scene.

REQUIREMENTS:
- The product must be the clear focal point of the video.
- Lighting must feel natural and consistent throughout the scene.
- Camera movement should be smooth and professional.
- The video should feel like a high-end e-commerce product showcase.
- Ensure the provided props (Paint Pots/Brushes) are visible on the desk/surface.
`.trim();
}


export function buildCreativePrompt(
    style: VideoStylePreset,
    platform: PlatformPreset,
    sceneDescription: string,
    productNames: string[],
    isFramed: boolean
): string {
    const productList = productNames.length > 0
        ? productNames.map(n => `"${n}"`).join(', ')
        : 'a paint-by-numbers canvas kit';

    let audioInstructions = "";
    if (style.id === 'cinematic') audioInstructions = "Cinematic orchestral swell. High-quality foley sounds of paper and canvas.";
    else if (style.id === 'energetic') audioInstructions = "Trending fast-paced social media track. Energetic bass and rhythmic glitches.";
    else if (style.id === 'minimal') audioInstructions = "Modern minimalist lo-fi beat. Airy and spacious soundscape.";
    else if (style.id === 'cozy') audioInstructions = "Warm acoustic guitar melody. ASMR sounds of opening a paint kit and mixing colors.";

    return `
SOCIAL MEDIA CREATIVE — ${platform.label} (${platform.platform})

PRODUCT: ${isFramed
            ? 'A finished paint-by-numbers canvas, professionally framed.'
            : 'An unframed paint-by-numbers canvas template with numbered zones.'}

PRODUCTS SHOWN: ${productList}

SCENE: ${sceneDescription || 'An eye-catching setting optimized for social media engagement.'}

STYLE: ${style.promptModifier}

AUDIO: ${audioInstructions}

INGREDIENTS:
- Use the provided reference images as visual anchors.
- Reference 1: The primary artistic motif.
- Reference 2 & 3: High-fidelity props (Paint Pots, Brushes, or Template) to be used as props in the social media scene.

PLATFORM-SPECIFIC:
- Optimized for ${platform.platform} ${platform.label} format (${platform.aspectRatio}).
- Content should be visually striking and stop-scrolling.
- Leave space at top and bottom for platform UI overlays (safe zones).
- The reveal of the product should feel satisfying and shareable.

REQUIREMENTS:
- Camera movement should be dynamic yet smooth.
- Colors should be vibrant and pop on mobile screens.
- The product must be clearly visible and the star of the content.
`.trim();
}



// Cost estimation
export function estimateCost(durationSeconds: number): string {
    const cost = durationSeconds * 0.75;
    return `~$${cost.toFixed(2)}`;
}
