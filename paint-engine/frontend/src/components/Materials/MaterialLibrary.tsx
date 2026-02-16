import { useState } from 'react';
import { Material } from '../../types';
import { MaterialCard } from './MaterialCard';
import { MaterialForm } from './MaterialForm';
import { MaterialEditForm } from './MaterialEditForm';

interface Props {
  materials: Material[];
  onToggleStatus: (id: string) => void;
  onDelete: (id: string) => void;
  onRefresh: () => void;
  /** Scene-edit mode: which material IDs are in the scene (overrides status for selection) */
  selectedIds?: string[];
  onToggleId?: (id: string) => void;
}

export function MaterialLibrary({ materials, onToggleStatus, onDelete, onRefresh, selectedIds, onToggleId }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [editMaterial, setEditMaterial] = useState<Material | null>(null);

  const handleDelete = (id: string) => {
    if (confirm('Material wirklich löschen? Alle Referenzbilder werden entfernt.')) {
      onDelete(id);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="label-uppercase">Materials ({materials.length})</h3>
        <button
          onClick={() => setShowForm(true)}
          className="w-7 h-7 rounded-lg bg-purple-600 hover:bg-purple-700 flex items-center justify-center text-sm font-bold"
        >
          +
        </button>
      </div>

      {materials.length === 0 ? (
        <div className="text-center py-8 text-gray-500 text-sm">
          <div className="text-2xl mb-2">📦</div>
          Keine Materialien vorhanden.
          <br />
          <button onClick={() => setShowForm(true)} className="text-purple-400 hover:text-purple-300 mt-1">
            Erstes Material hinzufügen
          </button>
        </div>
      ) : (
        <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
          {materials.map(m => (
            <MaterialCard
              key={m.id}
              material={m}
              onToggleStatus={onToggleStatus}
              onDelete={handleDelete}
              onEdit={setEditMaterial}
              isSelected={selectedIds?.includes(m.id)}
              onToggle={onToggleId ? () => onToggleId(m.id) : undefined}
            />
          ))}
        </div>
      )}

      {/* Create Form */}
      {showForm && (
        <MaterialForm onClose={() => setShowForm(false)} onCreated={onRefresh} />
      )}

      {/* Edit Form */}
      {editMaterial && (
        <MaterialEditForm
          material={editMaterial}
          onClose={() => setEditMaterial(null)}
          onSaved={onRefresh}
        />
      )}
    </div>
  );
}
