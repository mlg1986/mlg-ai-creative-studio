import { Material } from '../../types';

interface Props {
  materials: Material[];
  onRemove: (id: string) => void;
}

export function MaterialSelector({ materials, onRemove }: Props) {
  if (materials.length === 0) {
    return (
      <div>
        <h3 className="label-uppercase mb-2">Selected Materials</h3>
        <div className="text-xs text-gray-500 italic">
          Klicke auf Materialien in der Liste um sie auszuwählen.
        </div>
      </div>
    );
  }

  return (
    <div>
      <h3 className="label-uppercase mb-2">Selected Materials ({materials.length})</h3>
      <div className="flex flex-wrap gap-1.5">
        {materials.map(m => {
          const shortInfo = [m.material_type, m.dimensions].filter(Boolean).join(' · ');
          return (
            <span key={m.id} className="inline-flex items-center gap-1 bg-purple-500/20 text-purple-300 rounded-full px-3 py-1 text-xs">
              {m.name}
              {shortInfo && <span className="text-purple-400/60">· {shortInfo}</span>}
              <button onClick={() => onRemove(m.id)} className="ml-0.5 hover:text-white">✕</button>
            </span>
          );
        })}
      </div>
    </div>
  );
}
