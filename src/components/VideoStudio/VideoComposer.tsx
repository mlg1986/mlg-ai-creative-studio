import React, { useState, useRef } from 'react';
import { GoogleGenAI } from "@google/genai";
import { ProductEntity } from '../../types';
import {
    PlatformPreset, VideoStylePreset, CreativeMode,
    PRODUCT_VIDEO_PRESETS, CREATIVE_PRESETS, ALL_PRESETS, VIDEO_STYLES,
    buildProductVideoPrompt, buildCreativePrompt, estimateCost
} from './VideoPresets';

// --- ICONS --- //
const FilmIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
    </svg>
);

const SparklesIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
    </svg>
);

const DownloadIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
);

interface VideoComposerProps {
    products: ProductEntity[];
    sourceImage?: string | null;
}

export const VideoComposer: React.FC<VideoComposerProps> = ({ products, sourceImage }) => {
    // Mode & Platform State
    const [creativeMode, setCreativeMode] = useState<CreativeMode>('product');
    const [selectedPresetId, setSelectedPresetId] = useState<string>('shop-banner');
    const [selectedStyleId, setSelectedStyleId] = useState<string>('cinematic');
    const [isFramed, setIsFramed] = useState(false);

    // Prompt State
    const [scenePrompt, setScenePrompt] = useState("Ein gemütliches Wohnzimmer mit warmem Morgenlicht und einer kreativen Malstation.");

    // Duration
    const selectedPreset = ALL_PRESETS.find(p => p.id === selectedPresetId) || ALL_PRESETS[0];
    const selectedStyle = VIDEO_STYLES.find(s => s.id === selectedStyleId) || VIDEO_STYLES[0];
    const [duration, setDuration] = useState(selectedPreset.defaultDuration);

    // Generation State
    const [isGenerating, setIsGenerating] = useState(false);
    const [generationProgress, setGenerationProgress] = useState<string | null>(null);
    const [videoUrl, setVideoUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const videoRef = useRef<HTMLVideoElement>(null);

    const activePresets = creativeMode === 'product' ? PRODUCT_VIDEO_PRESETS : CREATIVE_PRESETS;

    const handlePresetChange = (preset: PlatformPreset) => {
        setSelectedPresetId(preset.id);
        setDuration(preset.defaultDuration);
    };

    const handleModeChange = (mode: CreativeMode) => {
        setCreativeMode(mode);
        const firstPreset = mode === 'product' ? PRODUCT_VIDEO_PRESETS[0] : CREATIVE_PRESETS[0];
        setSelectedPresetId(firstPreset.id);
        setDuration(firstPreset.defaultDuration);
    };

    const handleGenerate = async () => {
        setIsGenerating(true);
        setError(null);
        setVideoUrl(null);
        setGenerationProgress("Initialisiere Veo 3.1...");

        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const selectedProducts = products.filter(p => p.selected);
            const productNames = selectedProducts.map(p => p.name);

            // Build prompt based on mode
            const prompt = creativeMode === 'product'
                ? buildProductVideoPrompt(selectedStyle, scenePrompt, productNames, isFramed)
                : buildCreativePrompt(selectedStyle, selectedPreset, scenePrompt, productNames, isFramed);

            setGenerationProgress("Sende Anfrage an Veo 3.1...");

            // Build the generateVideos request
            const videoRequest: any = {
                model: 'veo-3.1-generate-preview',
                prompt: prompt,
                config: {
                    aspectRatio: selectedPreset.aspectRatio,
                },
            };

            // Add source image if available (image-to-video)
            if (sourceImage) {
                videoRequest.image = {
                    imageBytes: sourceImage.split(',')[1],
                    mimeType: 'image/png',
                };
            }

            // Start the async video generation
            let operation = await (ai.models as any).generateVideos(videoRequest);

            setGenerationProgress("Video wird generiert... (kann 1-3 Minuten dauern)");

            // Poll until done
            let pollCount = 0;
            while (!operation.done) {
                pollCount++;
                setGenerationProgress(`Video wird generiert... (${pollCount * 10}s)`);
                await new Promise(resolve => setTimeout(resolve, 10000));
                operation = await (ai.operations as any).getVideosOperation({ operation });
            }

            setGenerationProgress("Video wird heruntergeladen...");

            // Get the generated video
            const generatedVideo = operation.response?.generatedVideos?.[0];
            if (!generatedVideo?.video) {
                throw new Error("Veo hat kein gültiges Video zurückgegeben.");
            }

            // Download as blob for browser preview
            const videoFile = generatedVideo.video;
            const downloadResponse = await (ai.files as any).download({ file: videoFile });

            // Create blob URL for preview
            let blob: Blob;
            if (downloadResponse instanceof Blob) {
                blob = downloadResponse;
            } else if (downloadResponse?.arrayBuffer) {
                const buffer = await downloadResponse.arrayBuffer();
                blob = new Blob([buffer], { type: 'video/mp4' });
            } else {
                // Fallback: try to get video URI directly
                const videoUri = videoFile.uri || videoFile.url;
                if (videoUri) {
                    const resp = await fetch(videoUri);
                    blob = await resp.blob();
                } else {
                    throw new Error("Konnte das Video nicht herunterladen.");
                }
            }

            const url = URL.createObjectURL(blob);
            setVideoUrl(url);
            setGenerationProgress(null);

        } catch (err: any) {
            console.error("Video generation failed:", err);
            setError(err.message || "Videogenerierung fehlgeschlagen.");
            setGenerationProgress(null);
        } finally {
            setIsGenerating(false);
        }
    };


    return (
        <div className="bg-gray-800/40 rounded-[2.5rem] border border-white/5 shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="p-6 pb-0">
                <div className="flex items-center justify-center gap-3 mb-6">
                    <div className="p-2 bg-purple-500/20 rounded-xl border border-purple-500/30">
                        <FilmIcon />
                    </div>
                    <div>
                        <h2 className="text-sm font-black uppercase tracking-widest text-white">Video Studio</h2>
                        <p className="text-[10px] text-gray-500 font-medium">AI-powered with Google Veo 3.1</p>
                    </div>
                </div>

                {/* Mode Toggle */}
                <div className="grid grid-cols-2 gap-2 bg-black/30 p-1.5 rounded-2xl border border-white/5">
                    <button
                        onClick={() => handleModeChange('product')}
                        className={`py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${creativeMode === 'product'
                            ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-600/30'
                            : 'text-gray-500 hover:text-white hover:bg-white/5'
                            }`}
                    >
                        🎬 Product Videos
                    </button>
                    <button
                        onClick={() => handleModeChange('creative')}
                        className={`py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${creativeMode === 'creative'
                            ? 'bg-gradient-to-r from-pink-600 to-orange-500 text-white shadow-lg shadow-pink-600/30'
                            : 'text-gray-500 hover:text-white hover:bg-white/5'
                            }`}
                    >
                        ✨ Social Creatives
                    </button>
                </div>
            </div>

            {/* Platform Picker */}
            <div className="p-6">
                <label className="block text-[9px] font-black uppercase tracking-widest text-gray-500 mb-3">
                    {creativeMode === 'product' ? 'Video Format' : 'Plattform'}
                </label>
                <div className="grid grid-cols-3 gap-2">
                    {activePresets.map(preset => (
                        <button
                            key={preset.id}
                            onClick={() => handlePresetChange(preset)}
                            className={`relative p-3 rounded-xl border transition-all text-center group ${selectedPresetId === preset.id
                                ? 'bg-white/10 border-indigo-500/50 shadow-lg shadow-indigo-500/10'
                                : 'bg-black/20 border-white/5 hover:border-white/20 hover:bg-white/5'
                                }`}
                        >
                            <span className="text-xl block mb-1">{preset.icon}</span>
                            <span className={`text-[9px] font-black uppercase tracking-wider block ${selectedPresetId === preset.id ? 'text-white' : 'text-gray-400'}`}>
                                {preset.label}
                            </span>
                            <span className="text-[8px] text-gray-600 block mt-0.5">
                                {preset.aspectRatio}
                            </span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Style Picker */}
            <div className="px-6">
                <label className="block text-[9px] font-black uppercase tracking-widest text-gray-500 mb-3">Video Style</label>
                <div className="grid grid-cols-2 gap-2">
                    {VIDEO_STYLES.map(style => (
                        <button
                            key={style.id}
                            onClick={() => setSelectedStyleId(style.id)}
                            className={`p-3 rounded-xl border transition-all text-left ${selectedStyleId === style.id
                                ? 'bg-purple-600/20 border-purple-500/40'
                                : 'bg-black/20 border-white/5 hover:border-white/15'
                                }`}
                        >
                            <span className={`text-[10px] font-black uppercase tracking-wider block ${selectedStyleId === style.id ? 'text-purple-300' : 'text-gray-400'}`}>
                                {style.label}
                            </span>
                            <span className="text-[8px] text-gray-600 block mt-0.5 leading-tight">
                                {style.description}
                            </span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Scene Prompt */}
            <div className="p-6">
                <label className="block text-[9px] font-black uppercase tracking-widest text-gray-500 mb-2">Szene beschreiben</label>
                <textarea
                    value={scenePrompt}
                    onChange={(e) => setScenePrompt(e.target.value)}
                    className="w-full bg-black/30 border border-white/10 rounded-xl p-4 text-xs font-medium h-24 outline-none focus:ring-1 ring-purple-500 transition-all resize-none text-gray-300"
                    placeholder="Beschreibe die Atmosphäre, das Setting, die Stimmung..."
                />
            </div>

            {/* Product Format Toggle */}
            <div className="px-6 mb-4">
                <div className="flex items-center justify-between bg-black/20 p-4 rounded-xl border border-white/5">
                    <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Canvas Format</span>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setIsFramed(false)}
                            className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${!isFramed ? 'bg-indigo-600 text-white' : 'bg-white/5 text-gray-500'}`}
                        >Offen</button>
                        <button
                            onClick={() => setIsFramed(true)}
                            className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${isFramed ? 'bg-indigo-600 text-white' : 'bg-white/5 text-gray-500'}`}
                        >Gerahmt</button>
                    </div>
                </div>
            </div>

            {/* Duration + Cost */}
            <div className="px-6 mb-6">
                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-black/20 p-4 rounded-xl border border-white/5">
                        <label className="text-[9px] uppercase font-bold text-gray-500 block mb-2">
                            Dauer: {duration}s
                        </label>
                        <input
                            type="range"
                            min={selectedPreset.minDuration}
                            max={selectedPreset.maxDuration}
                            step="1"
                            value={duration}
                            onChange={(e) => setDuration(parseInt(e.target.value))}
                            className="w-full accent-purple-500 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                        />
                    </div>
                    <div className="bg-black/20 p-4 rounded-xl border border-white/5 flex flex-col items-center justify-center">
                        <span className="text-[9px] uppercase font-bold text-gray-500 block mb-1">Geschätzte Kosten</span>
                        <span className="text-lg font-black text-amber-400">{estimateCost(duration)}</span>
                        <span className="text-[8px] text-gray-600">Veo 3.1 · $0.75/s</span>
                    </div>
                </div>
            </div>

            {/* Selected Products Info */}
            <div className="px-6 mb-4">
                <div className="bg-black/20 p-3 rounded-xl border border-white/5">
                    <span className="text-[9px] uppercase font-bold text-gray-500 block mb-2">Ausgewählte Produkte</span>
                    {products.filter(p => p.selected).length > 0 ? (
                        <div className="flex gap-2 flex-wrap">
                            {products.filter(p => p.selected).map(p => (
                                <div key={p.id} className="flex items-center gap-1.5 bg-white/5 px-2 py-1 rounded-lg border border-white/10">
                                    <img src={p.images[0]} className="h-5 w-5 rounded object-cover" alt={p.name} />
                                    <span className="text-[9px] font-bold text-gray-300">{p.name}</span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-[9px] text-gray-600 italic">Keine Produkte ausgewählt. Wähle Produkte in "Studio Props" aus.</p>
                    )}
                </div>
            </div>

            {/* Video Preview */}
            {videoUrl && (
                <div className="px-6 mb-6">
                    <div className="relative rounded-2xl overflow-hidden border border-white/10 shadow-2xl bg-black">
                        <video
                            ref={videoRef}
                            src={videoUrl}
                            controls
                            autoPlay
                            loop
                            className="w-full"
                            style={{ maxHeight: '400px' }}
                        />
                    </div>
                </div>
            )}

            {/* Status */}
            {(generationProgress || error) && (
                <div className="px-6 mb-4">
                    <div className={`p-4 rounded-xl border text-center ${error ? 'bg-red-900/20 border-red-500/20' : 'bg-purple-900/20 border-purple-500/20'}`}>
                        {generationProgress && (
                            <div className="flex items-center justify-center gap-3">
                                <div className="w-4 h-4 border-2 border-purple-300/30 border-t-purple-300 rounded-full animate-spin"></div>
                                <span className="text-purple-300 text-xs font-bold">{generationProgress}</span>
                            </div>
                        )}
                        {error && <p className="text-red-400 text-xs font-bold">{error}</p>}
                    </div>
                </div>
            )}

            {/* Action Buttons */}
            <div className="p-6 pt-0">
                <div className="flex gap-3">
                    <button
                        onClick={handleGenerate}
                        disabled={isGenerating}
                        className={`flex-1 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${isGenerating
                            ? 'bg-gray-700 text-gray-400 cursor-wait'
                            : creativeMode === 'product'
                                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:shadow-xl hover:shadow-purple-600/20 hover:scale-[1.02]'
                                : 'bg-gradient-to-r from-pink-600 to-orange-500 text-white hover:shadow-xl hover:shadow-pink-600/20 hover:scale-[1.02]'
                            }`}
                    >
                        <SparklesIcon />
                        {isGenerating
                            ? 'Generiere Video...'
                            : creativeMode === 'product'
                                ? 'Product Video erzeugen'
                                : `${selectedPreset.label} erstellen`
                        }
                    </button>

                    {videoUrl && (
                        <a
                            href={videoUrl}
                            download={`${selectedPreset.id}-${Date.now()}.mp4`}
                            className="px-6 py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all flex items-center gap-2 hover:scale-[1.02]"
                        >
                            <DownloadIcon /> Export
                        </a>
                    )}
                </div>

                {/* Cost Warning */}
                <p className="text-[8px] text-gray-600 text-center mt-3">
                    ⚡ Veo 3.1 · {selectedPreset.aspectRatio} · {duration}s · Kosten: {estimateCost(duration)}
                </p>
            </div>
        </div>
    );
};
