import React, { useState, ChangeEvent } from 'react';
import { GoogleGenAI } from "@google/genai";
import { ProductEntity, AspectRatio, PaintByNumbersMode, PresetDefinition } from '../../types';

interface SceneGeneratorProps {
    products: ProductEntity[];
    onImageGenerated: (url: string) => void;
}

const FORMAT_PRESETS: PresetDefinition[] = [
    { id: 'fb-banner', label: 'Facebook Banner', width: '1640', height: '624', ratio: '16:9' },
    { id: 'insta-square', label: 'Instagram Post', width: '1080', height: '1080', ratio: '1:1' },
    { id: 'insta-story', label: 'Instagram Story', width: '1080', height: '1920', ratio: '9:16' },
];

const ShieldCheckIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
);

export const SceneGenerator: React.FC<SceneGeneratorProps> = ({ products, onImageGenerated }) => {
    const [prompt, setPrompt] = useState<string>("A cozy creative corner with warm morning sunlight.");
    const [uploadedImages, setUploadedImages] = useState<string[]>([]);
    const [referenceImage, setReferenceImage] = useState<string | null>(null);
    const [blueprintAnalysis, setBlueprintAnalysis] = useState<string>("");
    const [isAnalyzingBlueprint, setIsAnalyzingBlueprint] = useState<boolean>(false);

    // UI State
    const [productMode, setProductMode] = useState<PaintByNumbersMode>('unframed');
    const [isMarketing, setIsMarketing] = useState<boolean>(false);
    const [marketingText, setMarketingText] = useState<string>("HIGH PRECISION KIT");
    const [dimensionId, setDimensionId] = useState('fb-banner');

    // Generation State
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [verificationResult, setVerificationResult] = useState<{ status: 'passed' | 'failed' | 'idle', message?: string }>({ status: 'idle' });

    const fileToBase64 = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = (error) => reject(error);
        });
    };

    const handleFilesSelected = (files: File[]) => {
        Promise.all(files.map(fileToBase64)).then(base64s => setUploadedImages(prev => [...prev, ...base64s]));
    };

    const handleReferenceSelected = async (file: File) => {
        const b64 = await fileToBase64(file);
        setReferenceImage(b64);
        analyzeBlueprint(b64);
    };

    const analyzeBlueprint = async (b64Image: string) => {
        setIsAnalyzingBlueprint(true);
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        try {
            const response = await ai.models.generateContent({
                model: 'gemini-3-pro-image-preview',
                contents: {
                    parts: [
                        { inlineData: { data: b64Image.split(',')[1], mimeType: 'image/png' } },
                        { text: "Analyze this image for a product visualization blueprint. Describe: 1. Perspective and camera angle. 2. Furniture surfaces (tables, walls). 3. Lighting direction and intensity. Be technical and concise." }
                    ]
                }
            });
            setBlueprintAnalysis(response.text || "");
        } catch (e) { console.error("Analysis failed", e); } finally { setIsAnalyzingBlueprint(false); }
    };

    const handleGenerate = async () => {
        if (uploadedImages.length === 0) { setError("Upload your motif first."); return; }
        setIsLoading(true); setError(null); setVerificationResult({ status: 'idle' });

        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        try {
            const selectedProducts = products.filter(p => p.selected);
            const artParts = uploadedImages.map(img => ({ inlineData: { data: img.split(',')[1], mimeType: 'image/png' } }));
            const refPart = referenceImage ? [{ inlineData: { data: referenceImage.split(',')[1], mimeType: 'image/png' } }] : [];
            const productParts = selectedProducts.flatMap(p => p.images.map(img => ({ inlineData: { data: img.split(',')[1], mimeType: 'image/png' } })));
            const ratio = FORMAT_PRESETS.find(p => p.id === dimensionId)?.ratio || '16:9';

            const propContext = selectedProducts.map(p => `- Prop: ${p.name} (Specs: ${p.specs || 'N/A'})`).join('\n');

            const finalPrompt = `
    SYSTEM DIRECTIVE: Professional Paint-by-Numbers Product Visualization.
    PRODUCT: ${productMode === 'unframed'
                    ? "MALEN NACH ZAHLEN (UNFRAMED). A flat canvas template lying open on a tabletop. The motif must show clear numbered zones and precise thin outlines. It looks like a kit in progress, ready to be painted."
                    : "MALEN NACH ZAHLEN (FRAMED). The motif is stretched professionally over an internal wooden frame, displayed as a finished product."}
    
    SCENE ARCHITECTURE:
    - BLUEPRINT LAYOUT: ${referenceImage ? 'Adopt the exact spatial positioning and furniture layout from the Reference Image.' : 'Generate a premium studio environment.'}
    - SCENE ANALYSIS: ${blueprintAnalysis}
    - ENVIRONMENT STYLE: ${prompt}
    - MARKETING: ${isMarketing ? `Subtle elegant typography: "${marketingText}"` : 'Minimalist lifestyle only.'}
    
    PROPS & TECHNICAL SPECS:
    ${propContext}
    
    TECHNICAL REQUIREMENTS:
    - Lighting must match across the motif and the surrounding props (paint pots, brushes, workspace items).
    - Use technical specs of props to ensure correct scale and material physics.
    - High resolution texture for the canvas fabric.
    `;

            const response = await ai.models.generateContent({
                model: 'gemini-3-pro-image-preview', // Supports aspectRatio
                contents: { parts: [...artParts, ...productParts, ...refPart, { text: finalPrompt }] },
                config: { imageConfig: { imageSize: '2K', aspectRatio: ratio as AspectRatio } },
            });

            const part = response.candidates[0].content.parts.find(p => p.inlineData);
            if (part && part.inlineData) {
                const url = `data:image/png;base64,${part.inlineData.data}`;
                onImageGenerated(url); // Callback to parent

                // Verification
                const auditResponse = await ai.models.generateContent({
                    model: 'gemini-3-pro-image-preview',
                    contents: {
                        parts: [
                            { inlineData: { data: part.inlineData.data, mimeType: 'image/png' } },
                            { text: `Evaluate the realism of this Paint-by-Numbers product shot. Check if the motif looks integrated and the lighting matches. Respond "PASSED" or "FAILED: [Reason]".` }
                        ]
                    }
                });
                const auditText = auditResponse.text || "";
                setVerificationResult({
                    status: auditText.toUpperCase().includes("PASSED") ? 'passed' : 'failed',
                    message: auditText.toUpperCase().includes("PASSED") ? undefined : auditText
                });
            } else { setError("The imaging engine did not return a valid result."); }
        } catch (err: any) { setError(err.message || "Engine Error."); }
        finally { setIsLoading(false); }
    };

    return (
        <div className="space-y-8">
            {/* Image Upload Area */}
            <div className="bg-gray-800/40 p-6 rounded-[2rem] border border-white/5 shadow-xl">
                <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-3 text-center">Motif / Painting Template</label>
                <div className="space-y-4">
                    <div className="grid grid-cols-5 gap-2">
                        {Array.from({ length: 10 }).map((_, i) => {
                            if (i < uploadedImages.length) {
                                return (
                                    <div key={`img-${i}`} className="relative aspect-square">
                                        <img src={uploadedImages[i]} className="rounded-xl object-cover h-full w-full border border-gray-700 shadow-md" alt="Motif" />
                                        <button onClick={() => setUploadedImages(prev => prev.filter((_, idx) => idx !== i))} className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] shadow-xl">✕</button>
                                    </div>
                                );
                            }
                            if (i === uploadedImages.length) {
                                return (
                                    <label key="add-img" className="aspect-square flex flex-col items-center justify-center border-2 border-dashed border-gray-700 rounded-xl cursor-pointer hover:bg-gray-800/50 hover:border-indigo-500/50 transition-all group">
                                        <span className="text-xl text-gray-500 group-hover:text-indigo-400">+</span>
                                        <input type="file" multiple className="sr-only" onChange={(e) => e.target.files && handleFilesSelected(Array.from(e.target.files))} accept="image/*" />
                                    </label>
                                );
                            }
                            return <div key={`empty-${i}`} className="aspect-square bg-gray-900/30 rounded-xl border border-gray-800/50"></div>;
                        })}
                    </div>

                    <div className="bg-gray-900/40 p-4 rounded-xl border border-gray-800">
                        <label className="block text-[10px] text-gray-500 mb-3 uppercase font-black tracking-widest text-center">Paint-by-Numbers Format</label>
                        <div className="grid grid-cols-2 gap-3">
                            <button onClick={() => setProductMode('unframed')} className={`py-2 px-3 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-all ${productMode === 'unframed' ? 'bg-indigo-600 border-indigo-400 shadow-lg shadow-indigo-600/20' : 'bg-gray-800 border-gray-700 text-gray-500 hover:text-white'}`}>Open Template</button>
                            <button onClick={() => setProductMode('framed')} className={`py-2 px-3 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-all ${productMode === 'framed' ? 'bg-indigo-600 border-indigo-400 shadow-lg shadow-indigo-600/20' : 'bg-gray-800 border-gray-700 text-gray-500 hover:text-white'}`}>With Frame</button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Prompting Area */}
            <div className="bg-gray-800/40 p-6 rounded-[2rem] border border-white/5 shadow-xl space-y-4">
                <div className="relative">
                    <div className="flex items-center justify-center mb-3 relative h-6">
                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Scene Intelligence</label>
                        {blueprintAnalysis && (
                            <div className="absolute right-0 flex items-center gap-1 bg-emerald-500/20 text-emerald-300 text-[8px] font-black px-2 py-0.5 rounded border border-emerald-500/30 backdrop-blur-md animate-in fade-in slide-in-from-right-2">
                                <ShieldCheckIcon /> BLUEPRINT LOADED
                            </div>
                        )}
                    </div>
                    <textarea className="w-full bg-gray-900/60 border border-white/10 rounded-xl p-4 text-xs font-medium h-28 outline-none ring-indigo-500 focus:ring-1 transition-all" placeholder="Describe atmosphere (lighting, specific mood)..." value={prompt} onChange={(e) => setPrompt(e.target.value)} />
                </div>
                {blueprintAnalysis && (
                    <div className="bg-indigo-900/20 p-3 rounded-xl border border-indigo-500/10">
                        <label className="block text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-1">AI Detected Blueprint Context:</label>
                        <textarea className="w-full bg-transparent border-none text-[10px] font-medium text-gray-400 h-20 outline-none resize-none" placeholder="Blueprint features details..." value={blueprintAnalysis} onChange={(e) => setBlueprintAnalysis(e.target.value)} />
                    </div>
                )}
            </div>

            {/* Reference Upload */}
            <div className="bg-gray-800/40 p-6 rounded-[2rem] border border-white/5 shadow-xl">
                <div className="w-full relative">
                    {isAnalyzingBlueprint && (
                        <div className="absolute inset-0 z-20 bg-indigo-600/20 backdrop-blur-sm rounded-2xl flex items-center justify-center border border-indigo-500/50"><div className="flex flex-col items-center"><div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin mb-2"></div><span className="text-[8px] font-black uppercase tracking-[0.2em]">Deconstructing Blueprint...</span></div></div>
                    )}
                    {referenceImage ? (
                        <div className="relative w-full h-32 rounded-2xl overflow-hidden border border-gray-700 group">
                            <img src={referenceImage} alt="Blueprint" className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex flex-col justify-end p-3"><span className="text-[10px] font-black text-white bg-emerald-600 px-2 py-1 rounded inline-block w-fit uppercase tracking-widest">Structural Blueprint</span></div>
                            <button onClick={() => { setReferenceImage(null); setBlueprintAnalysis(""); }} className="absolute top-2 right-2 bg-red-600/80 hover:bg-red-600 text-white rounded-full p-1.5 shadow-xl backdrop-blur-md transition-all"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" strokeWidth="2.5"></path></svg></button>
                        </div>
                    ) : (
                        <label className="cursor-pointer flex flex-col items-center justify-center w-full h-32 border-2 border-gray-700 border-dashed rounded-2xl bg-gray-900/40 hover:bg-gray-800 transition-all group">
                            <svg className="h-8 w-8 text-gray-600 group-hover:text-indigo-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" strokeWidth="1.5"></path></svg>
                            <span className="text-[10px] font-black mt-3 text-gray-500 uppercase tracking-widest group-hover:text-indigo-300 text-center px-4">Upload Layout Reference (Studio or Room)</span>
                            <input type="file" className="sr-only" accept="image/*" onChange={(e) => e.target.files && e.target.files[0] && handleReferenceSelected(e.target.files[0])} />
                        </label>
                    )}
                </div>
            </div>

            {/* Export Settings */}
            <div className="bg-gray-800/40 p-6 rounded-[2rem] border border-white/5 shadow-xl">
                <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-3 text-center">Export Settings</label>
                <select value={dimensionId} onChange={(e) => setDimensionId(e.target.value)} className="w-full bg-gray-900/60 border border-white/10 rounded-xl px-4 py-3 text-xs font-bold outline-none mb-4">
                    {FORMAT_PRESETS.map(p => <option key={p.id} value={p.id}>{p.label} — {p.width}x{p.height}</option>)}
                </select>
                <div className="flex items-center justify-between bg-white/5 p-4 rounded-xl border border-white/5">
                    <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Marketing Label</span>
                    <input type="checkbox" checked={isMarketing} onChange={(e) => setIsMarketing(e.target.checked)} className="rounded bg-gray-900 border-white/10 text-indigo-500" />
                </div>
                {isMarketing && <input className="w-full mt-2 bg-gray-900/60 border border-white/10 rounded-lg p-3 text-[10px] font-bold uppercase tracking-widest text-indigo-400 outline-none" value={marketingText} onChange={(e) => setMarketingText(e.target.value)} />}
            </div>

            {/* Generate Button */}
            <button onClick={handleGenerate} disabled={isLoading} className="group relative w-full py-5 rounded-[2rem] font-black text-xs uppercase tracking-[0.3em] bg-emerald-600 hover:bg-emerald-500 transition-all shadow-2xl active:scale-95 disabled:opacity-50 overflow-hidden">
                <span className="relative z-10">{isLoading ? 'Rendering Studio...' : 'Initialize Render'}</span>
                <div className="absolute inset-0 bg-gradient-to-r from-emerald-500 to-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity"></div>
            </button>

            {/* Status Display (Loading/Error) */}
            {(isLoading || error || verificationResult.status !== 'idle') && (
                <div className="mt-4 p-4 bg-gray-900/80 rounded-xl border border-white/10 text-center">
                    {isLoading && <p className="text-emerald-400 font-bold uppercase text-xs animate-pulse">Processing...</p>}
                    {error && <p className="text-red-400 font-bold text-xs">{error}</p>}
                    {verificationResult.status !== 'idle' && (
                        <div className={`mt-2 flex items-center justify-center gap-2 text-[10px] uppercase font-black ${verificationResult.status === 'passed' ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {verificationResult.status === 'passed' ? <><ShieldCheckIcon /> Verified Realistic</> : `Audit: ${verificationResult.message}`}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
