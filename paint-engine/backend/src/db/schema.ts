import Database from 'better-sqlite3';
import { logger } from '../services/logger.js';
import { BUILTIN_TEMPLATES } from '../seeds/templates.js';

export function initDatabase(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS materials (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT,
      material_type TEXT,
      dimensions TEXT,
      surface TEXT,
      weight TEXT,
      color TEXT,
      format_code TEXT,
      size TEXT,
      frame_option TEXT,
      status TEXT DEFAULT 'idle',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS material_images (
      id TEXT PRIMARY KEY,
      material_id TEXT REFERENCES materials(id) ON DELETE CASCADE,
      image_path TEXT NOT NULL,
      perspective TEXT,
      is_primary INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS scene_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      icon TEXT,
      description TEXT,
      prompt_template TEXT,
      typical_use TEXT,
      is_builtin INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS scenes (
      id TEXT PRIMARY KEY,
      project_id TEXT REFERENCES projects(id),
      name TEXT,
      order_index INTEGER NOT NULL DEFAULT 0,
      template_id TEXT REFERENCES scene_templates(id),
      scene_description TEXT,
      prompt_tags TEXT,
      enriched_prompt TEXT,
      format TEXT,
      export_preset TEXT,
      target_width INTEGER,
      target_height INTEGER,
      blueprint_image_path TEXT,
      motif_image_path TEXT,
      extra_reference_paths TEXT,
      image_path TEXT,
      image_status TEXT DEFAULT 'draft',
      video_prompt TEXT,
      video_style TEXT,
      video_duration INTEGER DEFAULT 8,
      video_path TEXT,
      video_status TEXT DEFAULT 'none',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS scene_materials (
      scene_id TEXT REFERENCES scenes(id) ON DELETE CASCADE,
      material_id TEXT REFERENCES materials(id),
      PRIMARY KEY (scene_id, material_id)
    );

    CREATE TABLE IF NOT EXISTS render_jobs (
      id TEXT PRIMARY KEY,
      scene_id TEXT REFERENCES scenes(id),
      job_type TEXT NOT NULL,
      google_operation_name TEXT,
      status TEXT DEFAULT 'pending',
      cost_estimate REAL,
      started_at DATETIME,
      completed_at DATETIME,
      error_message TEXT
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS export_presets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      width INTEGER NOT NULL,
      height INTEGER NOT NULL,
      is_builtin INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Migrations for existing DBs
  try {
    db.prepare("SELECT motif_image_path FROM scenes LIMIT 1").get();
  } catch {
    try {
      db.exec("ALTER TABLE scenes ADD COLUMN motif_image_path TEXT");
      logger.info('db', 'Migrated: added motif_image_path to scenes');
    } catch { /* already exists */ }
  }

  try {
    db.prepare("SELECT review_notes FROM scenes LIMIT 1").get();
  } catch {
    try {
      db.exec("ALTER TABLE scenes ADD COLUMN review_notes TEXT");
      db.exec("ALTER TABLE scenes ADD COLUMN review_rating INTEGER");
      logger.info('db', 'Migrated: added review_notes, review_rating to scenes');
    } catch { /* already exists */ }
  }

  try {
    db.prepare("SELECT motif_image_paths FROM scenes LIMIT 1").get();
  } catch {
    try {
      db.exec("ALTER TABLE scenes ADD COLUMN motif_image_paths TEXT");
      logger.info('db', 'Migrated: added motif_image_paths (JSON array) to scenes');
    } catch { /* already exists */ }
  }

  try {
    db.prepare("SELECT prompt_tags FROM scenes LIMIT 1").get();
  } catch {
    try {
      db.exec("ALTER TABLE scenes ADD COLUMN prompt_tags TEXT");
      logger.info('db', 'Migrated: added prompt_tags (JSON array) to scenes');
    } catch { /* already exists */ }
  }

  try {
    db.prepare("SELECT last_refinement_prompt FROM scenes LIMIT 1").get();
  } catch {
    try {
      db.exec("ALTER TABLE scenes ADD COLUMN last_refinement_materials TEXT");
      logger.info('db', 'Migrated: added last_refinement_prompt, last_refinement_materials to scenes');
    } catch { /* already exists */ }
  }

  // Migration: add last_error_message to scenes
  try {
    db.prepare("SELECT last_error_message FROM scenes LIMIT 1").get();
  } catch {
    try {
      db.exec("ALTER TABLE scenes ADD COLUMN last_error_message TEXT");
      logger.info('db', 'Migrated: added last_error_message to scenes');
    } catch { /* already exists */ }
  }

  // Migration: add verification columns to scenes
  try {
    db.prepare("SELECT verification_score FROM scenes LIMIT 1").get();
  } catch {
    try {
      db.exec("ALTER TABLE scenes ADD COLUMN verification_score INTEGER");
      logger.info('db', 'Migrated: added verification_score to scenes');
    } catch { /* already exists */ }
  }

  try {
    db.prepare("SELECT verification_issues FROM scenes LIMIT 1").get();
  } catch {
    try {
      db.exec("ALTER TABLE scenes ADD COLUMN verification_issues TEXT");
      logger.info('db', 'Migrated: added verification_issues (JSON array) to scenes');
    } catch { /* already exists */ }
  }

  try {
    db.prepare("SELECT verification_attempts FROM scenes LIMIT 1").get();
  } catch {
    try {
      db.exec("ALTER TABLE scenes ADD COLUMN verification_attempts INTEGER DEFAULT 0");
      logger.info('db', 'Migrated: added verification_attempts to scenes');
    } catch { /* already exists */ }
  }

  try {
    db.prepare("SELECT video_verification_score FROM scenes LIMIT 1").get();
  } catch {
    try {
      db.exec("ALTER TABLE scenes ADD COLUMN video_verification_score INTEGER");
      logger.info('db', 'Migrated: added video_verification_score to scenes');
    } catch { /* already exists */ }
  }

  try {
    db.prepare("SELECT target_width FROM scenes LIMIT 1").get();
  } catch {
    try {
      db.exec("ALTER TABLE scenes ADD COLUMN target_width INTEGER");
      db.exec("ALTER TABLE scenes ADD COLUMN target_height INTEGER");
      logger.info('db', 'Migrated: added target_width, target_height to scenes');
    } catch { /* already exists */ }
  }

  try {
    db.prepare("SELECT extra_reference_paths FROM scenes LIMIT 1").get();
  } catch {
    try {
      db.exec("ALTER TABLE scenes ADD COLUMN extra_reference_paths TEXT");
      logger.info('db', 'Migrated: added extra_reference_paths (JSON array) to scenes');
    } catch { /* already exists */ }
  }

  // Migration for scene_versions table
  try {
    db.prepare("SELECT id FROM scene_versions LIMIT 1").get();
  } catch {
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS scene_versions (
          id TEXT PRIMARY KEY,
          scene_id TEXT REFERENCES scenes(id) ON DELETE CASCADE,
          image_path TEXT NOT NULL,
          prompt TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          version_number INTEGER NOT NULL,
          feedback_notes TEXT
        );
      `);
      logger.info('db', 'Migrated: created scene_versions table');
    } catch (e) {
      logger.error('db', 'Failed to create scene_versions table', e);
    }
  }

  // Migration for successful_patterns table
  try {
    db.prepare("SELECT id FROM successful_patterns LIMIT 1").get();
  } catch {
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS successful_patterns (
          id TEXT PRIMARY KEY,
          material_category TEXT NOT NULL,
          prompt_snippet TEXT NOT NULL,
          verification_score INTEGER NOT NULL,
          usage_count INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);
      logger.info('db', 'Migrated: created successful_patterns table');
    } catch (e) {
      logger.error('db', 'Failed to create successful_patterns table', e);
    }
  }

  // Migration for verification_logs table
  try {
    db.prepare("SELECT id FROM verification_logs LIMIT 1").get();
  } catch {
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS verification_logs (
          id TEXT PRIMARY KEY,
          scene_id TEXT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
          verification_type TEXT NOT NULL,
          score INTEGER NOT NULL,
          issues TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);
      logger.info('db', 'Migrated: created verification_logs table');
    } catch (e) {
      logger.error('db', 'Failed to create verification_logs table', e);
    }
  }

  // Seed templates
  const existingCount = db.prepare('SELECT COUNT(*) as count FROM scene_templates WHERE is_builtin = 1').get() as any;
  if (existingCount.count === 0) {
    const insert = db.prepare(`
      INSERT INTO scene_templates (id, name, icon, description, prompt_template, typical_use, is_builtin)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `);
    for (const tpl of BUILTIN_TEMPLATES) {
      insert.run(tpl.id, tpl.name, tpl.icon, tpl.description, tpl.prompt_template, tpl.typical_use);
    }
    logger.info('db', `Seeded ${BUILTIN_TEMPLATES.length} built-in templates`);
  }

  // Seed default project
  const projectCount = db.prepare('SELECT COUNT(*) as count FROM projects').get() as any;
  if (projectCount.count === 0) {
    db.prepare('INSERT INTO projects (id, name) VALUES (?, ?)').run('default', 'My First Project');
    logger.info('db', 'Seeded default project');
  }

  // Seed default settings
  const settingsCount = db.prepare('SELECT COUNT(*) as count FROM settings').get() as any;
  if (settingsCount.count === 0) {
    db.prepare("INSERT INTO settings (key, value) VALUES ('image_provider', 'gemini')").run();
    db.prepare("INSERT INTO settings (key, value) VALUES ('video_provider', 'veo')").run();
    logger.info('db', 'Seeded default settings');
  }

  // Seed built-in export presets
  const presetCount = db.prepare('SELECT COUNT(*) as count FROM export_presets WHERE is_builtin = 1').get() as any;
  if (presetCount.count === 0) {
    const insertPreset = db.prepare('INSERT INTO export_presets (id, name, width, height, is_builtin) VALUES (?, ?, ?, ?, 1)');
    const builtinPresets = [
      { id: 'facebook_banner', name: 'Facebook Banner', width: 1640, height: 624 },
      { id: 'instagram_post', name: 'Instagram Post', width: 1080, height: 1080 },
      { id: 'instagram_story', name: 'Instagram Story', width: 1080, height: 1920 },
      { id: 'youtube_thumbnail', name: 'YouTube Thumbnail', width: 1280, height: 720 },
      { id: 'free', name: 'Freies Format', width: 1024, height: 768 },
    ];
    for (const p of builtinPresets) {
      insertPreset.run(p.id, p.name, p.width, p.height);
    }
    logger.info('db', `Seeded ${builtinPresets.length} built-in export presets`);
  }

  logger.info('db', 'Database schema initialized');
}
