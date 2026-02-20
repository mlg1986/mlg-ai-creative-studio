import { useState, useEffect, useRef } from 'react';
import { PromptTag } from '../../types';
import { api } from '../../services/api';
import { PromptTagModal } from './PromptTagModal';

const CATEGORY_NAMES: Record<string, string> = {
  context: 'Zweck / Kontext',
  lifestyle: 'Akteure & Lifestyle',
  lighting: 'Licht & Stimmung',
  composition: 'Komposition',
};

interface Props {
  selectedTags: string[];
  onToggleTag: (id: string) => void;
  tags: PromptTag[];
  onTagsChange: () => void;
  onPreviewPrompt?: () => void;
}

type MenuTarget = 'header' | string | null;

function groupTagsByCategory(tags: PromptTag[]): { category_id: string; name: string; tags: PromptTag[] }[] {
  const byCategory = new Map<string, PromptTag[]>();
  for (const tag of tags) {
    const list = byCategory.get(tag.category_id) ?? [];
    list.push(tag);
    byCategory.set(tag.category_id, list);
  }
  const order = ['context', 'lifestyle', 'lighting', 'composition'];
  return order
    .filter(id => byCategory.has(id))
    .map(category_id => ({
      category_id,
      name: CATEGORY_NAMES[category_id] ?? category_id,
      tags: (byCategory.get(category_id) ?? []).sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)),
    }));
}

export function PromptTags({ selectedTags, onToggleTag, tags, onTagsChange, onPreviewPrompt }: Props) {
  const [menuOpen, setMenuOpen] = useState<MenuTarget>(null);
  const [modalTag, setModalTag] = useState<PromptTag | null>(null);
  const [modalMode, setModalMode] = useState<'create' | 'view' | 'edit'>('view');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current?.contains(e.target as Node)) return;
      setMenuOpen(null);
    }
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const openView = (tag: PromptTag) => {
    setModalTag(tag);
    setModalMode('view');
    setMenuOpen(null);
  };
  const openEdit = (tag: PromptTag) => {
    setModalTag(tag);
    setModalMode('edit');
    setMenuOpen(null);
  };
  const openCreate = () => {
    setModalTag(null);
    setModalMode('create');
    setMenuOpen(null);
  };
  const closeModal = () => {
    setModalTag(null);
    setModalMode('view');
  };

  const handleDelete = async (tag: PromptTag) => {
    if (tag.is_builtin) return;
    if (!confirm(`Szene-Element „${tag.label}" wirklich löschen?`)) return;
    try {
      await api.promptTags.delete(tag.id);
      onTagsChange();
    } catch (e) {
      console.error(e);
    }
    setMenuOpen(null);
  };

  const categories = groupTagsByCategory(tags);

  return (
    <div ref={containerRef} className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="label-uppercase">Szene-Elemente (Multi-Select)</h3>
        <div className="relative">
          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              setMenuOpen(prev => (prev === 'header' ? null : 'header'));
            }}
            className="w-8 h-8 rounded-lg border border-white/10 flex items-center justify-center text-gray-400 hover:text-white hover:border-purple-400/30"
            aria-label="Optionen Szene-Elemente"
          >
            ⋮
          </button>
          {menuOpen === 'header' && (
            <div className="absolute right-0 top-full mt-1 py-1 min-w-[200px] bg-[#1a1a2e] border border-white/10 rounded-lg shadow-xl z-10">
              <button
                type="button"
                onClick={openCreate}
                className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-white/10"
              >
                + Neues Element anlegen
              </button>
            </div>
          )}
        </div>
      </div>

      {categories.map(({ category_id, name, tags: categoryTags }) => (
        <div key={category_id}>
          <h4 className="text-[10px] text-gray-500 uppercase tracking-widest mb-1.5 px-1">
            {name}
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {categoryTags.map(tag => {
              const isActive = selectedTags.includes(tag.id);
              return (
                <div key={tag.id} className="relative inline-flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => onToggleTag(tag.id)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] transition-all border ${isActive
                      ? 'bg-purple-600 border-purple-400 text-white shadow-lg shadow-purple-500/20'
                      : 'bg-gray-800/50 border-white/5 text-gray-400 hover:border-white/20 hover:text-gray-200'
                    }`}
                    title={tag.prompt}
                  >
                    {tag.label}
                  </button>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        setMenuOpen(prev => (prev === tag.id ? null : tag.id));
                      }}
                      className="w-6 h-6 rounded flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 text-[10px]"
                      aria-label={`Optionen für ${tag.label}`}
                    >
                      ⋮
                    </button>
                    {menuOpen === tag.id && (
                      <div className="absolute right-0 top-full mt-0.5 py-1 min-w-[160px] bg-[#1a1a2e] border border-white/10 rounded-lg shadow-xl z-20">
                        <button
                          type="button"
                          onClick={() => openView(tag)}
                          className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-white/10"
                        >
                          Prompt anzeigen
                        </button>
                        {onPreviewPrompt && (
                          <button
                            type="button"
                            onClick={() => { onPreviewPrompt(); setMenuOpen(null); }}
                            className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-white/10"
                          >
                            Prompt generieren
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => openEdit(tag)}
                          className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-white/10"
                        >
                          Bearbeiten
                        </button>
                        {!tag.is_builtin && (
                          <button
                            type="button"
                            onClick={() => handleDelete(tag)}
                            className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-white/10"
                          >
                            Löschen
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
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

      <PromptTagModal
        open={modalTag !== null || modalMode === 'create'}
        onClose={closeModal}
        tag={modalTag}
        mode={modalMode}
        onSaved={onTagsChange}
      />
    </div>
  );
}
