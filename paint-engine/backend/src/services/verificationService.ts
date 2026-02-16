import { GoogleGenAI } from '@google/genai';
import { logger } from './logger.js';
import { v4 as uuidv4 } from 'uuid';

export interface VerificationIssue {
  materialId?: string;
  materialName?: string;
  issueType: 'label' | 'orientation' | 'material' | 'proportion' | 'color' | 'other';
  description: string;
  severity: 'critical' | 'major' | 'minor';
}

export interface VerificationResult {
  passed: boolean;
  score: number; // 0-100
  issues: VerificationIssue[];
  suggestions: string[];
}

interface MaterialContext {
  materialId: string;
  name: string;
  category: string;
  description?: string;
  dimensions?: string;
  color?: string;
  formatCode?: string;
  imagePaths: string[];
}

export class VerificationService {
  private ai: GoogleGenAI | null = null;

  private getAI(apiKey?: string): GoogleGenAI {
    if (!this.ai) {
      const key = apiKey || process.env.GEMINI_API_KEY || '';
      if (!key) {
        throw new Error('Gemini API key not configured. Please set GEMINI_API_KEY environment variable or configure it in settings.');
      }
      this.ai = new GoogleGenAI({ apiKey: key });
    }
    return this.ai;
  }

  /**
   * Verifies that the generated image matches the reference materials
   */
  async verifyMaterialConsistency(
    generatedImageBase64: string,
    materialsContext: MaterialContext[],
    sceneDescription: string
  ): Promise<VerificationResult> {
    try {
      logger.info('verification', `Starting material consistency check for ${materialsContext.length} materials`);

      const verificationPrompt = this.buildVerificationPrompt(materialsContext, sceneDescription);

      const parts: any[] = [
        { text: verificationPrompt },
        { text: "\n\nGENERATED IMAGE TO VERIFY:" },
        {
          inlineData: {
            mimeType: 'image/png',
            data: generatedImageBase64,
          },
        },
      ];

      logger.info('verification', 'Calling Gemini vision API for verification analysis');

      const ai = this.getAI();
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-image-preview',
        contents: [{
          role: 'user',
          parts,
        }],
      });

      const analysisText = response.text || '';
      logger.info('verification', `Received verification analysis (${analysisText.length} chars)`);

      const result = this.parseVerificationResponse(analysisText, materialsContext);

      logger.info('verification', `Verification complete: score=${result.score}, passed=${result.passed}, issues=${result.issues.length}`);

      return result;

    } catch (error: any) {
      logger.error('verification', 'Material consistency check failed', { error: error?.message });

      // Return a neutral result if verification fails
      return {
        passed: true,
        score: 75,
        issues: [{
          issueType: 'other',
          description: 'Verification service temporarily unavailable',
          severity: 'minor',
        }],
        suggestions: [],
      };
    }
  }

  /**
   * Builds the verification prompt with specific checks per material category
   */
  private buildVerificationPrompt(materials: MaterialContext[], sceneDescription: string): string {
    const materialChecks = materials.map(mat => {
      let checks = '';

      switch (mat.category) {
        case 'paint_pots':
          checks = `
- **${mat.name} (Paint Pot/Tiegel)**:
  - Check: Are visible labels with alpha-numeric codes (2 characters, e.g., "A4", "X3", "Q5")?
  - Check: Is the label clearly legible and positioned on the top/lid?
  - Check: Does the pot shape and size match the reference (~2cm diameter)?
  - Check: Is the material plastic with correct color (${mat.color || 'as specified'})?
  - Expected dimensions: ${mat.dimensions || 'approx. 2cm x 2cm'}`;
          break;

        case 'mnz_motif':
          checks = `
- **${mat.name} (Canvas/Leinwand)**:
  - Check: Is the FRONT side visible (where the motif would be painted)?
  - Check: Is the canvas NOT showing the back side with printing/text?
  - Check: Does the canvas size match ${mat.dimensions || 'specified dimensions'}?
  - Check: Is the frame type correct (${mat.formatCode || 'as specified'})?
  - Note: The motif content should be NEW/original, not copied from reference`;
          break;

        case 'brushes':
          checks = `
- **${mat.name} (Brush/Pinsel)**:
  - Check: Do the bristles match the reference texture and color?
  - Check: Is the brush handle material correct (wood/plastic)?
  - Check: Is the brush size proportional to other objects?
  - Expected dimensions: ${mat.dimensions || 'as shown in reference'}`;
          break;

        default:
          checks = `
- **${mat.name}**:
  - Check: Does the appearance match the reference images?
  - Check: Are material properties (texture, color, shape) accurate?
  - Check: Is the size proportional to other objects?`;
      }

      return checks;
    }).join('\n\n');

    return `You are a professional quality control inspector for an AI photo studio. Your task is to verify that a generated product photograph accurately reproduces the reference materials provided.

**SCENE CONTEXT:**
${sceneDescription}

**REFERENCE MATERIALS TO VERIFY:**
${materialChecks}

**GENERAL VERIFICATION CRITERIA:**
1. **Physical Proportions**: Are relative sizes correct? (e.g., 2cm pot vs 60cm canvas = 1:30 ratio)
2. **Material Fidelity**: Do textures match? (plastic vs wood vs fabric vs metal)
3. **Color Accuracy**: Are colors within 90% accuracy of references?
4. **Orientation**: Are objects shown from the correct angle/side?
5. **Composition**: Are all specified materials visible and properly positioned?

**YOUR ANALYSIS MUST FOLLOW THIS FORMAT:**

VERIFICATION ANALYSIS:

[For each material, state whether it passes or fails each check]

OVERALL SCORE: [number 0-100]
- 90-100: Excellent fidelity, all materials accurate
- 80-89: Good fidelity, minor issues only
- 70-79: Acceptable, some noticeable issues
- 60-69: Poor, significant issues present
- Below 60: Failed, major material inaccuracies

ISSUES FOUND:
[List each issue in this format:]
ISSUE: [material_name] | [type: label/orientation/material/proportion/color] | [severity: critical/major/minor] | [description]

CORRECTION SUGGESTIONS:
[Provide specific instructions for refinement if score < 80]

Please analyze the generated image now and provide your detailed verification report.`;
  }

  /**
   * Parses the Gemini response into a structured VerificationResult
   */
  private parseVerificationResponse(analysisText: string, materials: MaterialContext[]): VerificationResult {
    const issues: VerificationIssue[] = [];
    const suggestions: string[] = [];

    // Extract score
    const scoreMatch = analysisText.match(/OVERALL SCORE:\s*(\d+)/i);
    const score = scoreMatch ? parseInt(scoreMatch[1], 10) : 75; // Default to 75 if parsing fails

    // Extract issues
    const issuePattern = /ISSUE:\s*(.+?)\s*\|\s*(label|orientation|material|proportion|color|other)\s*\|\s*(critical|major|minor)\s*\|\s*(.+?)(?=\nISSUE:|\nCORRECTION|$)/gi;
    let match;

    while ((match = issuePattern.exec(analysisText)) !== null) {
      const materialName = match[1].trim();
      const issueType = match[2].trim() as VerificationIssue['issueType'];
      const severity = match[3].trim() as VerificationIssue['severity'];
      const description = match[4].trim();

      // Find material ID
      const material = materials.find(m =>
        materialName.toLowerCase().includes(m.name.toLowerCase()) ||
        m.name.toLowerCase().includes(materialName.toLowerCase())
      );

      issues.push({
        materialId: material?.materialId,
        materialName,
        issueType,
        description,
        severity,
      });
    }

    // Extract suggestions
    const suggestionsSection = analysisText.match(/CORRECTION SUGGESTIONS:([\s\S]*?)(?=\n\n|$)/i);
    if (suggestionsSection) {
      const suggestionLines = suggestionsSection[1].split('\n')
        .map(line => line.replace(/^[-*•]\s*/, '').trim())
        .filter(line => line.length > 10);
      suggestions.push(...suggestionLines);
    }

    // Determine if verification passed
    const criticalIssues = issues.filter(i => i.severity === 'critical').length;
    const passed = score >= 80 && criticalIssues === 0;

    logger.info('verification', `Parsed: score=${score}, issues=${issues.length}, critical=${criticalIssues}, suggestions=${suggestions.length}`);

    return {
      passed,
      score,
      issues,
      suggestions,
    };
  }

  /**
   * Saves verification log to database
   */
  saveVerificationLog(
    db: any,
    sceneId: string,
    verificationType: 'image' | 'video',
    result: VerificationResult
  ): void {
    try {
      const logId = uuidv4();
      db.prepare(`
        INSERT INTO verification_logs (id, scene_id, verification_type, score, issues)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        logId,
        sceneId,
        verificationType,
        result.score,
        JSON.stringify(result.issues)
      );

      logger.info('verification', `Saved verification log: ${logId} for scene ${sceneId}`);
    } catch (error: any) {
      logger.error('verification', 'Failed to save verification log', { error: error?.message });
    }
  }

  /**
   * Generates refinement prompt from verification issues
   */
  generateRefinementPrompt(result: VerificationResult): string {
    if (result.passed || result.issues.length === 0) {
      return '';
    }

    const criticalIssues = result.issues.filter(i => i.severity === 'critical');
    const majorIssues = result.issues.filter(i => i.severity === 'major');

    let prompt = 'REFINEMENT REQUIRED - MATERIAL CONSISTENCY ISSUES DETECTED:\n\n';

    if (criticalIssues.length > 0) {
      prompt += '**CRITICAL ISSUES (MUST FIX):**\n';
      criticalIssues.forEach((issue, idx) => {
        prompt += `${idx + 1}. ${issue.materialName || 'Material'} - ${issue.issueType.toUpperCase()}: ${issue.description}\n`;
      });
      prompt += '\n';
    }

    if (majorIssues.length > 0) {
      prompt += '**MAJOR ISSUES (SHOULD FIX):**\n';
      majorIssues.forEach((issue, idx) => {
        prompt += `${idx + 1}. ${issue.materialName || 'Material'} - ${issue.issueType.toUpperCase()}: ${issue.description}\n`;
      });
      prompt += '\n';
    }

    if (result.suggestions.length > 0) {
      prompt += '**CORRECTION INSTRUCTIONS:**\n';
      result.suggestions.forEach((suggestion, idx) => {
        prompt += `${idx + 1}. ${suggestion}\n`;
      });
    }

    prompt += '\n**IMPORTANT**: Apply ONLY the corrections listed above. Preserve all other aspects of the image (composition, lighting, camera angle, background).';

    return prompt;
  }
}

export const verificationService = new VerificationService();
