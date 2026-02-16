import { PROMPT_TAG_CATEGORIES } from '../../types';

interface Props {
    selectedTags: string[];
    onToggleTag: (id: string) => void;
}

export function PromptTags({ selectedTags, onToggleTag }: Props) {
    return (
        <div className="space-y-4">
            <h3 className="label-uppercase mb-2">Szene-Elemente (Multi-Select)</h3>

            {PROMPT_TAG_CATEGORIES.map(category => (
                <div key={category.id}>
                    <h4 className="text-[10px] text-gray-500 uppercase tracking-widest mb-1.5 px-1">
                        {category.name}
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                        {category.tags.map(tag => {
                            const isActive = selectedTags.includes(tag.id);
                            return (
                                <button
                                    key={tag.id}
                                    onClick={() => onToggleTag(tag.id)}
                                    className={`px-2.5 py-1 rounded-lg text-[11px] transition-all border ${isActive
                                            ? 'bg-purple-600 border-purple-400 text-white shadow-lg shadow-purple-500/20'
                                            : 'bg-gray-800/50 border-white/5 text-gray-400 hover:border-white/20 hover:text-gray-200'
                                        }`}
                                    title={tag.prompt}
                                >
                                    {tag.label}
                                </button>
                            );
                        })}
                    </div>
                </div>
            ))}

            {selectedTags.length > 0 && (
                <div className="text-[10px] text-purple-400/60 italic px-1 pt-1">
                    {selectedTags.length} Elemente ausgewählt. Diese werden den Prompt automatisch anreichern.
                </div>
            )}
        </div>
    );
}
