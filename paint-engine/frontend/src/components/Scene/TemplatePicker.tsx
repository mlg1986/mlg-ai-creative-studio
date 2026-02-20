import { useState, useRef, useEffect } from 'react';
import { SceneTemplate } from '../../types';
import { TemplateModal } from './TemplateModal';

interface Props {
  templates: SceneTemplate[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  onTemplatesChange: () => void;
}

type MenuTarget = 'header' | string | null;

const HOVER_PREVIEW_DELAY_MS = 300;

export function TemplatePicker({ templates, selected, onSelect, onTemplatesChange }: Props) {
  const [menuOpen, setMenuOpen] = useState<MenuTarget>(null);
  const [modalTemplate, setModalTemplate] = useState<SceneTemplate | null>(null);
  const [modalMode, setModalMode] = useState<'create' | 'view' | 'edit'>('view');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (pickerRef.current?.contains(e.target as Node)) return;
      setMenuOpen(null);
    }
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  useEffect(() => () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
  }, []);

  const openView = (tpl: SceneTemplate) => {
    setModalTemplate(tpl);
    setModalMode('view');
    setMenuOpen(null);
  };
  const openEdit = (tpl: SceneTemplate) => {
    setModalTemplate(tpl);
    setModalMode('edit');
    setMenuOpen(null);
  };
  const openCreate = () => {
    setModalTemplate(null);
    setModalMode('create');
    setMenuOpen(null);
  };
  const closeModal = () => {
    setModalTemplate(null);
    setModalMode('view');
  };

  return (
    <div ref={pickerRef}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="label-uppercase">Scene Template</h3>
        <div className="relative">
          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              setMenuOpen(prev => (prev === 'header' ? null : 'header'));
            }}
            className="w-8 h-8 rounded-lg border border-white/10 flex items-center justify-center text-gray-400 hover:text-white hover:border-purple-400/30"
            aria-label="Template-Optionen"
          >
            ⋮
          </button>
          {menuOpen === 'header' && (
            <div className="absolute right-0 top-full mt-1 py-1 min-w-[180px] bg-[#1a1a2e] border border-white/10 rounded-lg shadow-xl z-10">
              <button
                type="button"
                onClick={openCreate}
                className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-white/10"
              >
                + Neues Template anlegen
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {templates.map(tpl => (
          <div
            key={tpl.id}
            className={`relative text-left p-2.5 rounded-xl border transition-all ${
              selected === tpl.id
                ? 'border-purple-500 bg-purple-500/10'
                : 'border-white/10 bg-gray-900/50 hover:border-purple-400/30'
            }`}
            onMouseEnter={() => {
              if (!tpl.preview_image_path) return;
              if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
              hoverTimeoutRef.current = setTimeout(() => setHoveredId(tpl.id), HOVER_PREVIEW_DELAY_MS);
            }}
            onMouseLeave={() => {
              if (hoverTimeoutRef.current) {
                clearTimeout(hoverTimeoutRef.current);
                hoverTimeoutRef.current = null;
              }
              setHoveredId(null);
            }}
          >
            {tpl.preview_image_path && hoveredId === tpl.id && (
              <div
                className="absolute left-0 bottom-full mb-1 z-30 rounded-lg overflow-hidden border border-white/20 shadow-xl bg-gray-900"
                style={{ maxWidth: 280, maxHeight: 200 }}
              >
                <img
                  src={tpl.preview_image_path}
                  alt=""
                  className="w-full h-full object-contain"
                  style={{ maxWidth: 280, maxHeight: 200 }}
                />
              </div>
            )}
            <button
              type="button"
              onClick={() => onSelect(selected === tpl.id ? null : tpl.id)}
              className="block w-full text-left pr-8"
            >
              <div className="text-base mb-0.5">{tpl.icon}</div>
              <div className="text-xs font-medium truncate">{tpl.name}</div>
              <div className="text-[10px] text-gray-500 truncate">{tpl.typical_use}</div>
            </button>
            <div className="absolute top-2 right-2">
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  setMenuOpen(prev => (prev === tpl.id ? null : tpl.id));
                }}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10"
                aria-label={`Optionen für ${tpl.name}`}
              >
                ⋮
              </button>
              {menuOpen === tpl.id && (
                <div className="absolute right-0 top-full mt-0.5 py-1 min-w-[160px] bg-[#1a1a2e] border border-white/10 rounded-lg shadow-xl z-20">
                  <button
                    type="button"
                    onClick={() => openView(tpl)}
                    className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-white/10"
                  >
                    Prompt anzeigen
                  </button>
                  <button
                    type="button"
                    onClick={() => openEdit(tpl)}
                    className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-white/10"
                  >
                    Prompt bearbeiten
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <TemplateModal
        open={modalTemplate !== null || modalMode === 'create'}
        onClose={closeModal}
        template={modalTemplate}
        mode={modalMode}
        onSaved={onTemplatesChange}
      />
    </div>
  );
}