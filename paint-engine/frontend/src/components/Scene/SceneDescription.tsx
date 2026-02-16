interface Props {
  value: string;
  onChange: (val: string) => void;
  /** Bei true: Hinweis anzeigen, dass Änderungen mit «Szene speichern» übernommen werden */
  editingScene?: boolean;
}

export function SceneDescription({ value, onChange, editingScene }: Props) {
  return (
    <div>
      <h3 className="label-uppercase mb-2">Scene Description / Prompt</h3>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="A cozy creative corner with warm morning sunlight and paint supplies arranged on a wooden table."
        className="w-full bg-gray-800/50 border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-purple-500 resize-y min-h-20 placeholder:text-gray-600"
      />
      {editingScene && (
        <p className="text-[10px] text-gray-500 mt-1.5">
          Prompt dieser Szene. Änderungen mit «Szene speichern» übernehmen.
        </p>
      )}
    </div>
  );
}
