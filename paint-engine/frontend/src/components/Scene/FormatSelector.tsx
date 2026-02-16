interface Props {
  value: string;
  onChange: (val: string) => void;
  visible: boolean;
}

export function FormatSelector({ value, onChange, visible }: Props) {
  if (!visible) return null;

  const formats = [
    { value: 'vorlage', label: 'VORLAGE' },
    { value: 'gerahmt', label: 'GERAHMT' },
    { value: 'ausmalen', label: '🎨 AUSMALEN' },
  ];

  return (
    <div>
      <h3 className="label-uppercase mb-2">Paint-by-Numbers Format</h3>
      <div className="flex gap-1">
        {formats.map(f => (
          <button
            key={f.value}
            onClick={() => onChange(f.value)}
            className={`flex-1 py-2 px-2 rounded-lg text-xs font-medium transition-all ${
              value === f.value
                ? 'bg-purple-600 text-white'
                : 'bg-gray-800/50 text-gray-400 border border-white/10 hover:border-purple-400/30'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
    </div>
  );
}
