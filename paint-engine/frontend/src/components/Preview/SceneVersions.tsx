import { useState, useEffect } from 'react';
import { api } from '../../services/api';

interface SceneVersion {
    id: string;
    scene_id: string;
    image_path: string;
    prompt?: string;
    version_number: number;
    created_at: string;
    feedback_notes?: string;
}

interface Props {
    sceneId: string;
    currentVersionTimestamp?: string; // To trigger refresh
    onRestore: () => void;
}

export function SceneVersions({ sceneId, currentVersionTimestamp, onRestore }: Props) {
    const [versions, setVersions] = useState<SceneVersion[]>([]);
    const [loading, setLoading] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const [restoringId, setRestoringId] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    useEffect(() => {
        // Load versions on mount or when timestamp changes
        loadVersions();
    }, [sceneId, currentVersionTimestamp]);

    // Auto-expand if versions exist and not yet expanded (optional, but good for visibility)
    useEffect(() => {
        if (versions.length > 0 && !expanded) {
            setExpanded(true);
        }
    }, [versions.length]);

    const loadVersions = async () => {
        setLoading(true);
        try {
            const res = await fetch(`http://localhost:3001/api/scenes/${sceneId}/versions`);
            if (res.ok) {
                const data = await res.json();
                setVersions(data);
            }
        } catch (err) {
            console.error('Failed to load versions', err);
        } finally {
            setLoading(false);
        }
    };

    const handleRestore = async (version: SceneVersion) => {
        if (!window.confirm(`Version v${version.version_number} öffnen?`)) return;

        setRestoringId(version.id);
        try {
            const res = await fetch(`http://localhost:3001/api/scenes/${sceneId}/versions/${version.id}/restore`, {
                method: 'POST'
            });
            if (res.ok) {
                onRestore(); // Trigger parent refresh
                setExpanded(false); // Close history
            } else {
                alert('Wiederherstellung fehlgeschlagen');
            }
        } catch (err) {
            console.error('Restore failed', err);
            alert('Fehler beim Öffnen');
        } finally {
            setRestoringId(null);
        }
    };

    const handleDelete = async (version: SceneVersion) => {
        if (!window.confirm(`Version v${version.version_number} wirklich löschen? Das Bild wird dauerhaft entfernt.`)) return;

        setDeletingId(version.id);
        try {
            await api.scenes.deleteVersion(sceneId, version.id);
            await loadVersions();
        } catch (err) {
            console.error('Delete version failed', err);
            alert('Löschen fehlgeschlagen');
        } finally {
            setDeletingId(null);
        }
    };

    if (!sceneId) return null;

    if (versions.length === 0) return null; // Don't show if no versions? Or show "0 versions"? Let's show it but maybe auto-collapse.

    return (
        <div className="border-t border-white/5 bg-black/20 mx-4 mb-4 rounded-xl overflow-hidden border border-white/5">
            <button
                onClick={() => setExpanded(!expanded)}
                className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-white/[0.05] transition-colors"
            >
                <div className="flex items-center gap-2">
                    <span className="text-base">🕘</span>
                    <span className="text-xs uppercase tracking-wider text-purple-300 font-bold">
                        Version History
                    </span>
                    <span className="bg-purple-500/20 text-purple-300 text-[10px] px-1.5 py-0.5 rounded-full border border-purple-500/30">
                        {versions.length}
                    </span>
                </div>
                <span className="text-gray-500 text-xs">{expanded ? '▲' : '▼'}</span>
            </button>

            {expanded && (
                <div className="px-4 pb-4 animate-in slide-in-from-top-2 duration-200">
                    {loading && versions.length === 0 ? (
                        <div className="text-center py-4 text-xs text-gray-500">Lade Versionen...</div>
                    ) : versions.length === 0 ? (
                        <div className="text-center py-4 text-xs text-gray-500 italic">Keine früheren Versionen gefunden.</div>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            {versions.map((ver) => (
                                <div key={ver.id} className="relative group rounded-lg overflow-hidden border border-white/10 bg-black/30">
                                    <div className="aspect-[3/2] overflow-hidden">
                                        <img
                                            src={ver.image_path}
                                            alt={`v${ver.version_number}`}
                                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                        />
                                    </div>
                                    <div className="p-2">
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="text-xs font-bold text-gray-200">v{ver.version_number}</span>
                                            <span className="text-[9px] text-gray-500">
                                                {new Date(ver.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                        {ver.prompt && (
                                            <p className="text-[9px] text-gray-600 line-clamp-2 leading-tight mb-2" title={ver.prompt}>
                                                {ver.prompt}
                                            </p>
                                        )}
                                        <div className="flex gap-1.5">
                                            <button
                                                onClick={() => handleRestore(ver)}
                                                disabled={!!restoringId || !!deletingId}
                                                className="flex-1 py-1 rounded bg-white/5 hover:bg-purple-600/20 text-[10px] text-gray-400 hover:text-purple-300 border border-white/5 hover:border-purple-500/30 transition-all uppercase tracking-wide font-medium"
                                            >
                                                {restoringId === ver.id ? 'Lädt...' : 'Öffnen'}
                                            </button>
                                            <button
                                                onClick={() => handleDelete(ver)}
                                                disabled={!!restoringId || !!deletingId}
                                                className="py-1 px-2 rounded bg-white/5 hover:bg-red-600/20 text-[10px] text-gray-400 hover:text-red-300 border border-white/5 hover:border-red-500/30 transition-all uppercase tracking-wide font-medium"
                                                title="Version löschen"
                                            >
                                                {deletingId === ver.id ? '…' : 'Löschen'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
