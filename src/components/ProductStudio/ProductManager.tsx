import React, { useState, useEffect } from 'react';
import { ProductEntity } from '../../types';

// --- ICONS --- //
const DatabaseIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
    </svg>
);

const PhotoStackIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-indigo-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
);

const EditIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
    </svg>
);

const TrashIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
);

interface ProductManagerProps {
    products: ProductEntity[];
    onAddProduct: (name: string, specs: string, files: File[]) => void;
    onRemoveProduct: (id: string) => void;
    onToggleProduct: (id: string) => void;
    onUpdateProduct: (product: ProductEntity) => void;
}

export const ProductManager: React.FC<ProductManagerProps> = ({ products, onAddProduct, onRemoveProduct, onToggleProduct, onUpdateProduct }) => {
    // --- API HELPER --- //
    const API_URL = 'http://localhost:3001/api/products';

    const [isAdding, setIsAdding] = useState(false);
    const [editingProduct, setEditingProduct] = useState<ProductEntity | null>(null);
    const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
    const [newName, setNewName] = useState("");
    const [newSpecs, setNewSpecs] = useState("");
    const [tempFiles, setTempFiles] = useState<File[]>([]);

    useEffect(() => {
        fetch(API_URL).then(res => res.json()).then(data => {
            // We need to sync with parent, but ProductManager is driving the data now.
            // Actually, products are passed as props. We should lift state or use a context, 
            // but for now let's adhere to the prop contract and just trigger the onUpdate/onAdd callbacks 
            // which will be implemented in App.tsx to call the API.
            // WAIT - The prop contract in App.tsx was generating random IDs on client.
            // Let's change the contract in App.tsx to handle the API calls, so this component stays dumb UI?
            // "Integrate Frontend with Backend API" task implies modifying App.tsx mostly.
            // Let's leave this component mostly as is, but maybe refresh the list? 
            // Actually, the prompt says "Update ProductManager to fetch".
            // Let's make ProductManager responsible for fetching its own data?
            // No, `App.tsx` holds the `products` state and passes it down.
            // So we should modify `App.tsx` to fetch/save, and pass those handlers to `ProductManager`.
            // ProductManager just calls `onAddProduct` etc.
        }).catch(err => console.error("Failed to fetch products", err));
    }, []);

    const handleAdd = () => {
        if (newName && tempFiles.length > 0) {
            onAddProduct(newName, newSpecs, tempFiles);
            setNewName("");
            setNewSpecs("");
            setTempFiles([]);
            setIsAdding(false);
        }
    };

    const handleSaveEdit = () => {
        if (editingProduct) {
            onUpdateProduct(editingProduct);
            setEditingProduct(null);
        }
    };

    const fileToBase64 = (file: File): Promise<string> => {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result as string);
        });
    };

    useEffect(() => { setIsConfirmingDelete(false); }, [editingProduct?.id]);

    return (
        <div className="bg-gray-800/40 p-5 rounded-2xl border border-gray-700/50 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center">
                    <DatabaseIcon />
                    <h2 className="text-lg font-bold ml-2 text-yellow-50">Studio Props</h2>
                </div>
                <button onClick={() => { setIsAdding(!isAdding); setEditingProduct(null); }} className="p-1.5 bg-indigo-600/30 hover:bg-indigo-600/50 rounded-lg text-indigo-400 transition-colors">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                </button>
            </div>

            {isAdding && (
                <div className="bg-gray-900/60 p-4 rounded-xl border border-gray-700 space-y-3">
                    <input className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white" placeholder="Prop Name (e.g. Acrylic Paint Pot)" value={newName} onChange={(e) => setNewName(e.target.value)} />
                    <textarea className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-xs text-gray-300 h-20 resize-none" placeholder="Technical Specs (Dimensions 20x20mm, Material: Glass, Textured Canvas etc.)" value={newSpecs} onChange={(e) => setNewSpecs(e.target.value)} />
                    <label className="block w-full text-center py-4 border-2 border-dashed border-gray-600 rounded-lg cursor-pointer hover:bg-gray-700/30 text-xs text-gray-400">
                        {tempFiles.length > 0 ? `${tempFiles.length} photos selected` : "Upload Reference Angles"}
                        <input type="file" multiple className="sr-only" onChange={(e) => e.target.files && setTempFiles(Array.from(e.target.files))} />
                    </label>
                    <button onClick={handleAdd} disabled={!newName || tempFiles.length === 0} className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-xs font-bold disabled:opacity-50 transition-all shadow-lg">Save Prop</button>
                </div>
            )}

            {editingProduct && (
                <div className="bg-indigo-900/40 p-4 rounded-xl border border-indigo-500/30 space-y-3 animate-in slide-in-from-top duration-300">
                    <div className="flex justify-between items-center">
                        <span className="text-[10px] font-black uppercase tracking-widest text-indigo-300">Prop Processing Mode</span>
                        <button onClick={() => setEditingProduct(null)} className="text-gray-400 hover:text-white transition-colors">✕</button>
                    </div>
                    <input className="w-full bg-gray-800 border border-indigo-500/50 rounded-lg px-3 py-1.5 text-xs text-white" placeholder="Name" value={editingProduct.name} onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })} />
                    <textarea className="w-full bg-gray-800 border border-indigo-500/50 rounded-lg px-3 py-1.5 text-[10px] text-gray-300 h-16 resize-none" placeholder="Specs (Dimensions, Material...)" value={editingProduct.specs} onChange={(e) => setEditingProduct({ ...editingProduct, specs: e.target.value })} />
                    <div className="grid grid-cols-4 gap-1">
                        {editingProduct.images.map((img, idx) => (
                            <div key={idx} className="relative aspect-square rounded border border-gray-700 overflow-hidden">
                                <img src={img} className="h-full w-full object-cover" />
                                <button onClick={() => setEditingProduct({ ...editingProduct, images: editingProduct.images.filter((_, i) => i !== idx) })} className="absolute top-0 right-0 bg-red-600/80 p-0.5 text-[8px]">✕</button>
                            </div>
                        ))}
                        <label className="aspect-square flex items-center justify-center border border-dashed border-indigo-500/50 rounded cursor-pointer hover:bg-indigo-500/10 transition-colors">
                            <svg className="h-4 w-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                            <input type="file" className="sr-only" onChange={async (e) => {
                                if (e.target.files && e.target.files[0]) {
                                    const b64 = await fileToBase64(e.target.files[0]);
                                    setEditingProduct({ ...editingProduct, images: [...editingProduct.images, b64] });
                                }
                            }} />
                        </label>
                    </div>
                    <button onClick={handleSaveEdit} className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all shadow-lg">Apply Changes</button>

                    <div className="pt-3 mt-3 border-t border-indigo-500/20">
                        {!isConfirmingDelete ? (
                            <button onClick={() => setIsConfirmingDelete(true)} className="w-full py-2 flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest text-red-400/50 hover:text-red-400 transition-colors group">
                                <TrashIcon /> <span>Delete Prop Instance</span>
                            </button>
                        ) : (
                            <div className="flex gap-2 animate-in fade-in zoom-in duration-200">
                                <button onClick={() => { onRemoveProduct(editingProduct.id); setEditingProduct(null); }} className="flex-1 py-2 bg-red-600 hover:bg-red-500 rounded-lg text-[10px] font-black uppercase transition-colors">Confirm Wipe</button>
                                <button onClick={() => setIsConfirmingDelete(false)} className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-[10px] font-black uppercase transition-colors">Cancel</button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <div className="space-y-2 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                {products.length === 0 && !isAdding && (
                    <p className="text-xs text-gray-500 italic text-center py-4">No studio props connected.</p>
                )}
                {products.map(product => (
                    <div key={product.id} className={`group relative flex items-center p-3 rounded-xl border transition-all cursor-pointer ${product.selected ? 'bg-indigo-600/20 border-indigo-500/50 shadow-lg' : 'bg-gray-900/40 border-gray-700 hover:border-gray-600'}`} onClick={() => { setEditingProduct(product); setIsAdding(false); }}>
                        <div className="relative h-10 w-10 shrink-0" onClick={(e) => { e.stopPropagation(); onToggleProduct(product.id); }}>
                            <img src={product.images[0]} className="h-full w-full object-cover rounded-lg border border-gray-600 shadow-sm" alt={product.name} />
                            <div className="absolute -bottom-1 -right-1 bg-gray-800 text-[8px] px-1 rounded flex items-center border border-gray-700"><PhotoStackIcon /> <span className="ml-0.5">{product.images.length}</span></div>
                        </div>
                        <div className="ml-3 flex-1 overflow-hidden">
                            <h3 className="text-xs font-bold text-gray-200 truncate flex items-center">{product.name}<span className="ml-2 opacity-0 group-hover:opacity-100 text-indigo-400 transition-opacity"><EditIcon /></span></h3>
                            <p className="text-[9px] text-gray-500 truncate leading-tight">{product.specs || 'No specs defined'}</p>
                            <p className="text-[10px] text-gray-500 uppercase tracking-tighter mt-0.5 font-bold">{product.selected ? 'Engaged' : 'Idle'}</p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
