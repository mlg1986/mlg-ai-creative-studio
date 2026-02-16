import { ValidationError } from '../types/errors.js';
import type Database from 'better-sqlite3';

export function validateMaterial(body: any) {
  if (!body.name?.trim()) throw new ValidationError('Name ist erforderlich');
  const validCategories = ['mnz_motif', 'paint_pots', 'brushes', 'canvas', 'frame', 'tool', 'packaging', 'accessory'];
  if (!validCategories.includes(body.category)) {
    throw new ValidationError(`Ungültige Kategorie: ${body.category}`, { validCategories });
  }
  if (body.category === 'mnz_motif') {
    if (body.format_code && !['1TK', '1TP', '1TQ'].includes(body.format_code)) {
      throw new ValidationError(`Ungültiger Format-Code: ${body.format_code}`, { valid: ['1TK', '1TP', '1TQ'] });
    }
    if (body.frame_option && !['OR', 'R', 'DIYR'].includes(body.frame_option)) {
      throw new ValidationError(`Ungültige Rahmenoption: ${body.frame_option}`, { valid: ['OR', 'R', 'DIYR'] });
    }
  }
}

export function validateSceneCreate(body: any, db?: Database.Database) {
  // Materials are now optional - scenes can be created without materials for pure scene generation

  // Validate export preset dynamically from database
  if (body.exportPreset) {
    if (db) {
      const preset = db.prepare('SELECT id FROM export_presets WHERE id = ?').get(body.exportPreset);
      if (!preset) {
        throw new ValidationError(`Ungültiges Export-Preset: ${body.exportPreset}`);
      }
    }
    // If no db connection provided, skip validation (backwards compatibility)
  }

  const validFormats = ['vorlage', 'gerahmt', 'ausmalen'];
  if (body.format && !validFormats.includes(body.format)) {
    throw new ValidationError(`Ungültiges Format: ${body.format}`, { validFormats });
  }
}

export function validateVideoGenerate(body: any) {
  const validStyles = ['cinematic', 'energetic', 'minimal', 'cozy'];
  if (body.videoStyle && !validStyles.includes(body.videoStyle)) {
    throw new ValidationError(`Ungültiger Video-Stil: ${body.videoStyle}`, { validStyles });
  }
  if (body.durationSeconds && ![4, 6, 8].includes(body.durationSeconds)) {
    throw new ValidationError('Dauer muss 4, 6 oder 8 Sekunden sein');
  }
}
