import { AlertCircle, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

interface VerificationIssue {
  materialId?: string;
  materialName?: string;
  issueType: 'label' | 'orientation' | 'material' | 'proportion' | 'color' | 'other';
  description: string;
  severity: 'critical' | 'major' | 'minor';
}

interface VerificationReportProps {
  score: number;
  issues: VerificationIssue[];
  onAutoFix?: () => void;
  onManualRefine?: () => void;
}

const SCORE_COLORS = {
  excellent: 'text-green-600 bg-green-50 border-green-200',
  good: 'text-blue-600 bg-blue-50 border-blue-200',
  acceptable: 'text-yellow-600 bg-yellow-50 border-yellow-200',
  poor: 'text-orange-600 bg-orange-50 border-orange-200',
  failed: 'text-red-600 bg-red-50 border-red-200',
};

const SEVERITY_ICONS = {
  critical: <XCircle className="w-4 h-4 text-red-500" />,
  major: <AlertCircle className="w-4 h-4 text-orange-500" />,
  minor: <AlertTriangle className="w-4 h-4 text-yellow-500" />,
};

const ISSUE_TYPE_LABELS = {
  label: 'Label Accuracy',
  orientation: 'Orientation',
  material: 'Material Texture',
  proportion: 'Scale Proportion',
  color: 'Color Accuracy',
  other: 'Other',
};

export default function VerificationReport({
  score,
  issues,
  onAutoFix,
  onManualRefine,
}: VerificationReportProps) {
  const getScoreCategory = (s: number): keyof typeof SCORE_COLORS => {
    if (s >= 90) return 'excellent';
    if (s >= 80) return 'good';
    if (s >= 70) return 'acceptable';
    if (s >= 60) return 'poor';
    return 'failed';
  };

  const category = getScoreCategory(score);
  const criticalCount = issues.filter(i => i.severity === 'critical').length;
  const majorCount = issues.filter(i => i.severity === 'major').length;
  const minorCount = issues.filter(i => i.severity === 'minor').length;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mt-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Material Verification</h3>
        {score >= 80 ? (
          <CheckCircle className="w-6 h-6 text-green-500" />
        ) : (
          <AlertCircle className="w-6 h-6 text-orange-500" />
        )}
      </div>

      {/* Score Badge */}
      <div className={`inline-flex items-center px-4 py-2 rounded-lg border ${SCORE_COLORS[category]} font-semibold text-lg mb-4`}>
        Score: {score}/100
      </div>

      {/* Score Description */}
      <p className="text-sm text-gray-600 mb-4">
        {score >= 90 && 'Excellent material fidelity. All references accurately reproduced.'}
        {score >= 80 && score < 90 && 'Good fidelity with minor issues. Most materials are accurate.'}
        {score >= 70 && score < 80 && 'Acceptable quality. Some noticeable issues present.'}
        {score >= 60 && score < 70 && 'Poor quality. Significant material inaccuracies detected.'}
        {score < 60 && 'Failed verification. Major discrepancies from reference materials.'}
      </p>

      {/* Issues Summary */}
      {issues.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-4 text-sm">
            {criticalCount > 0 && (
              <span className="flex items-center gap-1 text-red-600">
                <XCircle className="w-4 h-4" />
                {criticalCount} Critical
              </span>
            )}
            {majorCount > 0 && (
              <span className="flex items-center gap-1 text-orange-600">
                <AlertCircle className="w-4 h-4" />
                {majorCount} Major
              </span>
            )}
            {minorCount > 0 && (
              <span className="flex items-center gap-1 text-yellow-600">
                <AlertTriangle className="w-4 h-4" />
                {minorCount} Minor
              </span>
            )}
          </div>
        </div>
      )}

      {/* Issues List */}
      {issues.length > 0 && (
        <div className="space-y-2 mb-4">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Issues Detected:</h4>
          {issues.map((issue, idx) => (
            <div
              key={idx}
              className="flex items-start gap-2 p-3 bg-gray-50 rounded border border-gray-200"
            >
              <div className="mt-0.5">{SEVERITY_ICONS[issue.severity]}</div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium text-gray-500 uppercase">
                    {ISSUE_TYPE_LABELS[issue.issueType]}
                  </span>
                  {issue.materialName && (
                    <span className="text-xs text-gray-400">• {issue.materialName}</span>
                  )}
                </div>
                <p className="text-sm text-gray-700">{issue.description}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Action Buttons */}
      {score < 80 && (
        <div className="flex gap-2 pt-4 border-t border-gray-200">
          {onAutoFix && criticalCount > 0 && (
            <button
              onClick={onAutoFix}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium"
            >
              Auto-Fix Issues
            </button>
          )}
          {onManualRefine && (
            <button
              onClick={onManualRefine}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition text-sm font-medium"
            >
              Manual Refine
            </button>
          )}
        </div>
      )}

      {/* Success Message */}
      {score >= 80 && issues.length === 0 && (
        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
          <CheckCircle className="w-5 h-5 text-green-600" />
          <span className="text-sm text-green-700 font-medium">
            All materials verified successfully!
          </span>
        </div>
      )}
    </div>
  );
}
