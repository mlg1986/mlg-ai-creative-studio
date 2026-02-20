# Changelog

Alle wesentlichen Änderungen am Paint Engine (MLG AI Creative Studio) werden hier dokumentiert.

---

## [1.2.0] – 2026-02-20

### Added

- **Motivformate in der Prompt-Generierung:** Die Seitenverhältnisse (Aspect Ratios) der hochgeladenen Motivbilder werden aus den Bilddateien gelesen und bei der Prompt-Generierung mit übergeben. So soll das Modell jedes Motiv im korrekten Format darstellen (kein Stretching, Cropping oder Verzerrung).
  - Neue Hilfsfunktionen in `scenes.ts`: `resolveMotifFullPath`, `getMotifAspectRatios`.
  - `buildImageGenerationPrompt` erhält optionalen Parameter `motifAspectRatios`; Motiv-Block und FLUX-2-Pro-Index enthalten explizite Formatangaben (z. B. „Motif 1 = 16:9“).
  - Integration in Preview-Prompt (`buildPromptsForScene`), Hauptgenerierung (`generateImage`) und Refinement (`generateImageWithFeedback`).

- **Canvas-Ersetzung in Referenzbildern:** Wenn das Referenzfoto (Blueprint) bereits eine Leinwand oder ein Bild an der Wand zeigt, wird diese Leinwand explizit durch das hochgeladene Motiv **ersetzt** (nicht nur überblendet). Das Motiv wird als Leinwand in korrektem Seitenverhältnis dargestellt – ohne Stretching, Stauen oder Verzerrung.
  - Neuer Abschnitt „REPLACE ANY EXISTING CANVAS IN THE REFERENCE“ im Image-Prompt.
  - Bei FLUX 2 Pro: Hinweis am Blueprint-Index „If it shows a canvas, REPLACE that canvas with the user's motif image(s); keep motif aspect ratio.“
  - Scene Intelligence: Zusätzlicher Hinweis bei Blueprint + Motiv (`replaceCanvasHint`).

### Documentation

- **MOTIV_FORMAT_UND_CANVAS_ERSETZUNG.md:** Beschreibung der Motiv-Format-Logik und der Canvas-Ersetzungsregel für Entwickler und Redaktion.

---

## [1.1.0] – (bestehend)

- Replicate-Provider, FLUX 2 Pro, Grok, Export-Presets, Format-Varianten, Material-Verification, erweiterte Templates, optionale Materialien.

---

[1.2.0]: https://github.com/mlg1986/mlg-ai-creative-studio/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/mlg1986/mlg-ai-creative-studio/releases/tag/v1.1.0
