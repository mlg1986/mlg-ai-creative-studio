import { Check, X } from 'lucide-react';

interface Material {
  id: string;
  name: string;
  category: string;
  images: Array<{
    image_path: string;
    perspective?: string;
  }>;
}

interface MaterialComparisonViewProps {
  materials: Material[];
  generatedImageUrl: string;
  verificationScore?: number;
  onReemphasize?: (materialId: string) => void;
}

export default function MaterialComparisonView({
  materials,
  generatedImageUrl,
  verificationScore,
  onReemphasize,
}: MaterialComparisonViewProps) {
  const getMatchStatus = (score?: number) => {
    if (!score) return 'unknown';
    if (score >= 90) return 'excellent';
    if (score >= 75) return 'good';
    return 'poor';
  };

  const matchStatus = getMatchStatus(verificationScore);

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mt-4">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Material Comparison</h3>

      {/* Generated Image */}
      <div className="mb-6">
        <h4 className="text-sm font-medium text-gray-700 mb-2">Generated Result</h4>
        <div className="border-2 border-gray-300 rounded-lg overflow-hidden">
          <img
            src={generatedImageUrl}
            alt="Generated scene"
            className="w-full h-auto"
          />
        </div>
      </div>

      {/* Materials Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {materials.map((material) => (
          <div
            key={material.id}
            className="border border-gray-200 rounded-lg overflow-hidden hover:shadow-md transition"
          >
            {/* Material Header */}
            <div className="bg-gray-50 px-3 py-2 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h5 className="text-sm font-semibold text-gray-900">{material.name}</h5>
                  <p className="text-xs text-gray-500 capitalize">{material.category.replace('_', ' ')}</p>
                </div>
                {verificationScore !== undefined && (
                  <div>
                    {matchStatus === 'excellent' && <Check className="w-5 h-5 text-green-500" />}
                    {matchStatus === 'good' && <Check className="w-5 h-5 text-yellow-500" />}
                    {matchStatus === 'poor' && <X className="w-5 h-5 text-red-500" />}
                  </div>
                )}
              </div>
            </div>

            {/* Reference Images */}
            <div className="p-3">
              {material.images && material.images.length > 0 ? (
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {material.images.slice(0, 4).map((img, idx) => (
                    <div key={idx} className="relative">
                      <img
                        src={img.image_path}
                        alt={`${material.name} - ${img.perspective || 'view'}`}
                        className="w-full h-24 object-cover rounded border border-gray-200"
                      />
                      {img.perspective && (
                        <span className="absolute bottom-1 left-1 bg-black bg-opacity-60 text-white text-xs px-1.5 py-0.5 rounded">
                          {img.perspective}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400 italic">No reference images</p>
              )}

              {/* Re-emphasize Button */}
              {onReemphasize && matchStatus === 'poor' && (
                <button
                  onClick={() => onReemphasize(material.id)}
                  className="w-full px-3 py-1.5 bg-blue-50 text-blue-700 rounded hover:bg-blue-100 transition text-xs font-medium"
                >
                  Re-emphasize Material
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Overall Match Indicator */}
      {verificationScore !== undefined && (
        <div className="mt-6 p-4 bg-gray-50 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700">Overall Material Match</p>
              <p className="text-xs text-gray-500 mt-1">
                {matchStatus === 'excellent' && 'Excellent fidelity to reference materials'}
                {matchStatus === 'good' && 'Good match with minor variations'}
                {matchStatus === 'poor' && 'Significant discrepancies detected'}
              </p>
            </div>
            <div className={`text-2xl font-bold ${
              matchStatus === 'excellent' ? 'text-green-600' :
              matchStatus === 'good' ? 'text-yellow-600' :
              'text-red-600'
            }`}>
              {verificationScore}%
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
