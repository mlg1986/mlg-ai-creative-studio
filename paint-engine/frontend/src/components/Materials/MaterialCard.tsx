import { Material, CATEGORY_LABELS, MaterialCategory } from '../../types';

interface Props {
  material: Material;
  onToggleStatus: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (material: Material) => void;
  /** In scene-edit mode: override selected state and toggle handler */
  isSelected?: boolean;
  onToggle?: () => void;
}

export function MaterialCard({ material, onToggleStatus, onDelete, onEdit, isSelected, onToggle }: Props) {
  const primaryImage = material.images.find(i => i.is_primary) || material.images[0];
  const shortInfo = [material.material_type, material.dimensions, material.weight]
    .filter(Boolean).join(' · ');
  const selected = isSelected !== undefined ? isSelected : material.status === 'engaged';
  const handleClick = onToggle ?? (() => onToggleStatus(material.id));

  return (
    <div
      className={`bg-gray-900/50 border rounded-xl p-3 cursor-pointer transition-all hover:border-purple-400/30 ${
        selected ? 'border-purple-500/40' : 'border-white/10'
      }`}
      onClick={handleClick}
    >
      <div className="flex gap-3">
        {/* Thumbnail */}
        <div className="w-14 h-14 rounded-lg bg-gray-800 overflow-hidden flex-shrink-0">
          {primaryImage ? (
            <img src={primaryImage.image_path} alt={material.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-600 text-xl">📦</div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-medium truncate">{material.name}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
              selected ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'
            }`}>
              {selected ? 'AUSGEWÄHLT' : 'IDLE'}
            </span>
          </div>
          <div className="text-[10px] text-purple-400 mb-0.5">
            {CATEGORY_LABELS[material.category as MaterialCategory] || material.category}
          </div>
          {shortInfo && (
            <div className="text-[10px] text-gray-500 truncate">{shortInfo}</div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-1" onClick={e => e.stopPropagation()}>
          <button onClick={() => onEdit(material)} className="text-gray-500 hover:text-white text-xs p-1" title="Bearbeiten">
            ✏️
          </button>
          <button onClick={() => onDelete(material.id)} className="text-gray-500 hover:text-red-400 text-xs p-1" title="Löschen">
            🗑️
          </button>
        </div>
      </div>
    </div>
  );
}
