import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { logger } from './logger.js';

interface SuccessfulPattern {
  id: string;
  materialCategory: string;
  promptSnippet: string;
  verificationScore: number;
  usageCount: number;
  createdAt: string;
}

export class PatternMemoryService {
  /**
   * Saves a successful prompt pattern when verification score is high
   */
  saveSuccessfulPattern(
    db: Database.Database,
    materialCategory: string,
    enrichedPrompt: string,
    verificationScore: number
  ): void {
    // Only save patterns with excellent scores
    if (verificationScore < 90) {
      return;
    }

    try {
      // Extract key phrases from the enriched prompt (first 500 characters as snippet)
      const promptSnippet = enrichedPrompt.slice(0, 500);

      // Check if similar pattern already exists
      const existing = db.prepare(`
        SELECT id, usage_count FROM successful_patterns
        WHERE material_category = ? AND prompt_snippet = ?
      `).get(materialCategory, promptSnippet) as SuccessfulPattern | undefined;

      if (existing) {
        // Pattern exists, increment usage count
        db.prepare(`
          UPDATE successful_patterns
          SET usage_count = usage_count + 1
          WHERE id = ?
        `).run(existing.id);

        logger.info('pattern-memory', `Updated existing pattern: ${existing.id} (usage: ${existing.usageCount + 1})`);
      } else {
        // Create new pattern
        const patternId = uuidv4();
        db.prepare(`
          INSERT INTO successful_patterns (id, material_category, prompt_snippet, verification_score, usage_count)
          VALUES (?, ?, ?, ?, 1)
        `).run(patternId, materialCategory, promptSnippet, verificationScore);

        logger.info('pattern-memory', `Saved new successful pattern: ${patternId} for category ${materialCategory}`);
      }
    } catch (error: any) {
      logger.error('pattern-memory', 'Failed to save successful pattern', { error: error?.message });
    }
  }

  /**
   * Retrieves the most successful patterns for a given material category
   */
  getBestPatternsForCategory(
    db: Database.Database,
    materialCategory: string,
    limit: number = 3
  ): SuccessfulPattern[] {
    try {
      const patterns = db.prepare(`
        SELECT * FROM successful_patterns
        WHERE material_category = ?
        ORDER BY verification_score DESC, usage_count DESC
        LIMIT ?
      `).all(materialCategory, limit) as SuccessfulPattern[];

      logger.info('pattern-memory', `Retrieved ${patterns.length} patterns for category ${materialCategory}`);

      return patterns;
    } catch (error: any) {
      logger.error('pattern-memory', 'Failed to retrieve patterns', { error: error?.message });
      return [];
    }
  }

  /**
   * Injects successful patterns into a prompt for better consistency
   */
  injectSuccessfulPatterns(
    db: Database.Database,
    materialCategories: string[],
    basePrompt: string
  ): string {
    // Get patterns for all involved material categories
    const allPatterns: SuccessfulPattern[] = [];

    for (const category of materialCategories) {
      const patterns = this.getBestPatternsForCategory(db, category, 1); // Top 1 per category
      allPatterns.push(...patterns);
    }

    if (allPatterns.length === 0) {
      return basePrompt; // No patterns to inject
    }

    // Build injection section
    let injection = '\n\n**LEARNED SUCCESSFUL PATTERNS:**\n';
    injection += 'The following approaches have proven successful in previous generations with high verification scores:\n\n';

    allPatterns.forEach((pattern, idx) => {
      injection += `${idx + 1}. [${pattern.materialCategory}] (Score: ${pattern.verificationScore}/100, Used: ${pattern.usageCount}x):\n`;
      injection += `   ${pattern.promptSnippet.slice(0, 200)}...\n\n`;
    });

    injection += 'Apply similar strategies and phrasing where applicable.\n';

    logger.info('pattern-memory', `Injected ${allPatterns.length} successful patterns into prompt`);

    return basePrompt + injection;
  }

  /**
   * Analyzes which categories need improvement based on historical verification scores
   */
  getProblematicCategories(
    db: Database.Database,
    minScore: number = 70
  ): Array<{ category: string; avgScore: number; count: number }> {
    try {
      // Get average verification scores per material category from verification logs
      const query = `
        SELECT
          m.category,
          AVG(vl.score) as avg_score,
          COUNT(*) as count
        FROM verification_logs vl
        JOIN scenes s ON s.id = vl.scene_id
        JOIN scene_materials sm ON sm.scene_id = s.id
        JOIN materials m ON m.id = sm.material_id
        WHERE vl.score < ?
        GROUP BY m.category
        ORDER BY avg_score ASC
      `;

      const results = db.prepare(query).all(minScore) as Array<{
        category: string;
        avg_score: number;
        count: number;
      }>;

      logger.info('pattern-memory', `Found ${results.length} problematic categories below score ${minScore}`);

      return results;
    } catch (error: any) {
      logger.error('pattern-memory', 'Failed to analyze problematic categories', { error: error?.message });
      return [];
    }
  }

  /**
   * Gets statistics about pattern learning effectiveness
   */
  getPatternStatistics(db: Database.Database): {
    totalPatterns: number;
    categoryCounts: Record<string, number>;
    avgScoreByCategory: Record<string, number>;
  } {
    try {
      const totalPatterns = (db.prepare('SELECT COUNT(*) as count FROM successful_patterns').get() as any)?.count || 0;

      const categoryCounts: Record<string, number> = {};
      const avgScoreByCategory: Record<string, number> = {};

      const categoryStats = db.prepare(`
        SELECT
          material_category,
          COUNT(*) as pattern_count,
          AVG(verification_score) as avg_score
        FROM successful_patterns
        GROUP BY material_category
      `).all() as Array<{
        material_category: string;
        pattern_count: number;
        avg_score: number;
      }>;

      for (const stat of categoryStats) {
        categoryCounts[stat.material_category] = stat.pattern_count;
        avgScoreByCategory[stat.material_category] = Math.round(stat.avg_score);
      }

      return { totalPatterns, categoryCounts, avgScoreByCategory };
    } catch (error: any) {
      logger.error('pattern-memory', 'Failed to get pattern statistics', { error: error?.message });
      return { totalPatterns: 0, categoryCounts: {}, avgScoreByCategory: {} };
    }
  }

  /**
   * Cleans up old or low-performing patterns to keep the database lean
   */
  cleanupPatterns(
    db: Database.Database,
    minUsageCount: number = 2,
    minScore: number = 85
  ): number {
    try {
      const result = db.prepare(`
        DELETE FROM successful_patterns
        WHERE usage_count < ? AND verification_score < ?
      `).run(minUsageCount, minScore);

      const deletedCount = result.changes || 0;
      logger.info('pattern-memory', `Cleaned up ${deletedCount} low-performing patterns`);

      return deletedCount;
    } catch (error: any) {
      logger.error('pattern-memory', 'Failed to cleanup patterns', { error: error?.message });
      return 0;
    }
  }
}

export const patternMemory = new PatternMemoryService();
