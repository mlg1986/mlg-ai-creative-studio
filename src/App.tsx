import React, { useState, useEffect } from 'react';
import { ProductEntity } from './types';
import { ProductManager } from './components/ProductStudio/ProductManager';
import { SceneGenerator } from './components/SceneStudio/SceneGenerator';
import { VideoComposer } from './components/VideoStudio/VideoComposer';
import JSZip from "jszip";

// --- GLOBAL INTERFACE --- //
declare global {
    interface AIStudio {
        hasSelectedApiKey: () => Promise<boolean>;
        openSelectKey: () => Promise<void>;
    }
    interface Window {
        aistudio: AIStudio;
    }
}

// --- ICONS --- //
const ArchiveIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
    </svg>
);

const RestoreIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
    </svg>
);

const DatabaseIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
    </svg>
);

// --- HEADER COMPONENT --- //
const Header: React.FC = () => (
    <header className="text-center p-6 md:p-8">
        <div className="inline-block px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded-full text-xs font-bold text-indigo-400 mb-4 uppercase tracking-[0.2em]">Malen nach Zahlen Spezialist</div>
        <h1 className="text-5xl md:text-6xl font-black tracking-tight text-white leading-tight">
            PAINT <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-indigo-400">ENGINE</span>
        </h1>
        <p className="mt-4 text-lg text-gray-400 max-w-xl mx-auto font-medium">Professional visualization for Paint-by-Numbers marketing. From raw motifs to premium product scenes & videos.</p>
    </header>
);


// --- API HELPERS --- //
const API_BASE = 'http://localhost:3001/api';

export default function App() {
    const [hasKey, setHasKey] = useState<boolean>(false);
    const [products, setProducts] = useState<ProductEntity[]>([]);
    const [generatedImage, setGeneratedImage] = useState<string | null>(null);
    const [showSettings, setShowSettings] = useState(false);
    const [apiKeyInput, setApiKeyInput] = useState("");

    const [isAuthenticating, setIsAuthenticating] = useState(false);
    const [authError, setAuthError] = useState<string | null>(null);

    // Initial Load
    useEffect(() => {
        // Check Key
        fetch(`${API_BASE}/config/key`)
            .then(r => r.json())
            .then(data => {
                if (data.hasKey) {
                    setHasKey(true);
                    if (data.key) { process.env.API_KEY = data.key; }
                }
            })
            .catch(err => {
                console.error("Backend unreachable", err);
                setAuthError("Backend offline. Please run start-app.command");
            });

        // Load Products
        fetch(`${API_BASE}/products`)
            .then(r => r.json())
            .then(setProducts)
            .catch(e => console.error("Products fetch failed", e));
    }, []);

    const handleSaveProject = async () => {
        try {
            const zip = new JSZip();
            zip.file("project_state.json", JSON.stringify({ products, generatedImage }));
            const blob = await zip.generateAsync({ type: "blob" });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = `PaintStudio_Project_${new Date().toISOString().split('T')[0]}.zip`;
            link.click();
        } catch (e) { console.error("Archive failed", e); }
    };

    const saveKey = async () => {
        if (!apiKeyInput) return;
        setIsAuthenticating(true);
        setAuthError(null);
        try {
            const res = await fetch(`${API_BASE}/config/key`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: apiKeyInput })
            });
            if (!res.ok) throw new Error("Server rejected key");
            process.env.API_KEY = apiKeyInput;
            setHasKey(true);
            setShowSettings(false);
        } catch (e) {
            console.error(e);
            setAuthError("Failed to connect to backend. Is the server running?");
        } finally {
            setIsAuthenticating(false);
        }
    };

    // Product Handlers
    const handleAddProduct = async (name: string, specs: string, files: File[]) => {
        const b64s = await Promise.all(files.map(file => new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result as string);
        })));

        const newProduct = { id: Math.random().toString(36).substr(2, 9), name, specs, images: b64s, selected: true };

        // Optimistic UI
        setProducts(prev => [...prev, newProduct]);

        // API Call
        await fetch(`${API_BASE}/products`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newProduct)
        });
    };

    const handleUpdateProduct = async (p: ProductEntity) => {
        setProducts(prev => prev.map(x => x.id === p.id ? p : x));
        await fetch(`${API_BASE}/products`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(p)
        });
    };

    const handleRemoveProduct = async (id: string) => {
        setProducts(prev => prev.filter(x => x.id !== id));
        await fetch(`${API_BASE}/products/${id}`, { method: 'DELETE' });
    };

    const handleToggleProduct = async (id: string) => {
        const product = products.find(p => p.id === id);
        if (product) {
            handleUpdateProduct({ ...product, selected: !product.selected });
        }
    };

    if (!hasKey) {
        return (
            <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center p-8 text-white">
                <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mb-8 border border-emerald-500/20"><DatabaseIcon /></div>
                <h1 className="text-4xl font-black mb-6 uppercase tracking-widest">Studio Locked</h1>

                <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 w-full max-w-md space-y-4 shadow-2xl">
                    <label className="block text-xs uppercase font-bold text-gray-500">Enter Gemini API Key</label>
                    <input
                        type="password"
                        value={apiKeyInput}
                        onChange={(e) => setApiKeyInput(e.target.value)}
                        className={`w-full bg-gray-900 border ${authError ? 'border-red-500/50' : 'border-gray-600'} rounded-lg p-3 text-white focus:border-emerald-500 outline-none transition-all`}
                        placeholder="AIzaSy..."
                        disabled={isAuthenticating}
                    />
                    {authError && <p className="text-[10px] text-red-400 font-bold uppercase tracking-wider animate-pulse">{authError}</p>}
                    <button
                        onClick={saveKey}
                        disabled={isAuthenticating || !apiKeyInput}
                        className="w-full py-3 bg-emerald-600 text-white rounded-lg font-black text-xs uppercase tracking-widest hover:bg-emerald-500 transition-all shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {isAuthenticating ? (
                            <><div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div> Connecting...</>
                        ) : "Authenticate & Initialize DB"}
                    </button>
                    <p className="text-[10px] text-gray-500 text-center">Key will be stored locally in studio.db</p>
                </div>

            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#0a0a0a] text-white selection:bg-indigo-500 selection:text-white font-sans overflow-x-hidden relative">
            <div className="container mx-auto px-6 py-12 max-w-[1600px]">
                <Header />

                <div className="mt-16 grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">

                    {/* Controls Sidebar */}
                    <aside className="lg:col-span-4 space-y-8 h-fit lg:sticky lg:top-8">
                        {/* Archive Toolbar */}
                        <div className="bg-gray-800/60 p-5 rounded-[2rem] border border-white/10 shadow-2xl backdrop-blur-xl flex gap-3">
                            <button onClick={handleSaveProject} className="flex-1 flex items-center justify-center gap-2 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"><ArchiveIcon /> Archive Project</button>
                            <label className="flex-1 flex items-center justify-center gap-2 py-3 bg-white/5 border border-white/10 hover:bg-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer"><RestoreIcon /> Restore<input type="file" accept=".zip" className="sr-only" onChange={async (e) => {
                                const file = e.target.files?.[0]; if (!file) return;
                                const zip = new JSZip(); const content = await zip.loadAsync(file);
                                const stateFile = content.file("project_state.json");
                                if (stateFile) {
                                    const data = JSON.parse(await stateFile.async("string"));
                                    if (data.products) setProducts(data.products); // Note: This overwrites specific project state, maybe not DB? For now fine.
                                    if (data.generatedImage) setGeneratedImage(data.generatedImage);
                                }
                            }} /></label>
                        </div>

                        {/* Product Manager */}
                        <ProductManager
                            products={products}
                            onAddProduct={handleAddProduct}
                            onUpdateProduct={handleUpdateProduct}
                            onRemoveProduct={handleRemoveProduct}
                            onToggleProduct={handleToggleProduct}
                        />

                        {/* Scene Generator Controls */}
                        <SceneGenerator
                            products={products}
                            onImageGenerated={setGeneratedImage}
                        />

                    </aside>

                    {/* Main Stage */}
                    <main className="lg:col-span-8 space-y-8">
                        {/* Studio Viewport */}
                        <div className="w-full h-full bg-black/40 rounded-[2.5rem] flex flex-col items-center justify-center p-6 min-h-[600px] shadow-[0_0_100px_rgba(0,0,0,0.5)] relative border border-white/5 overflow-hidden">
                            {generatedImage ? (
                                <div className="relative group w-full max-w-5xl animate-in zoom-in duration-500">
                                    <img src={generatedImage} alt="Studio Render" className="w-full h-auto rounded-3xl shadow-2xl border border-white/10" />
                                    <div className="mt-8 flex justify-center"><a href={generatedImage} download="paint-engine-export.png" className="bg-white text-black px-12 py-4 rounded-full font-black text-xs uppercase tracking-widest shadow-2xl hover:scale-105 transition-all">Download Render (2K)</a></div>
                                </div>
                            ) : (
                                <div className="text-center"><div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6 border border-white/10 opacity-40"><svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" strokeWidth="1.5"></path></svg></div><h3 className="text-xl font-black text-white uppercase tracking-widest opacity-50">Ready for Initialization</h3></div>
                            )}
                        </div>

                        {/* Video Studio */}
                        <VideoComposer products={products} sourceImage={generatedImage} />

                    </main>

                </div>
            </div>

            {/* Settings Button (Corner) */}
            <button onClick={() => { setHasKey(false); }} className="fixed bottom-4 right-4 bg-gray-800 text-gray-500 p-2 rounded-full text-[10px] hover:text-white transition-colors">Key Settings</button>
        </div>
    );
}

