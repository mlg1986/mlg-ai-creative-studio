# Motiv-Format & Canvas-Ersetzung (v1.2.0)

Dokumentation der Prompt-Logik für **exaktes Motivformat** und **Ersetzen von Leinwand-Inhalten** in Referenzbildern.

---

## 1. Motivformate zu 100 % beibehalten

### Ziel

Die **Seitenverhältnisse (Aspect Ratios)** der hochgeladenen Motivbilder sollen in der generierten Szene **unverändert** dargestellt werden – kein Stretching, kein Cropping, keine Verzerrung.

### Umsetzung

- **Erkennung:** Beim Erzeugen des Prompts werden die Motiv-Bilddateien gelesen und ihre Abmessungen ermittelt (`getImageDimensionsFromFile`).
- **Aspect Ratio:** Aus Breite/Höhe wird ein normiertes Seitenverhältnis berechnet (z. B. `16:9`, `1:1`, `3:2`) und an die Prompt-Generierung übergeben.
- **Einsatzstellen:**
  - **Preview-Prompt** (`buildPromptsForScene`): Motivformate fließen in die Scene Intelligence und in den Image-Prompt ein.
  - **Generierung** (`generateImage`): Dieselben Formate werden im User-Prompt und in `buildImageGenerationPrompt` verwendet.
  - **Refinement** (`generateImageWithFeedback`): Beim Nachbearbeiten wird die exakte Format-Vorgabe wiederholt.

### Im Prompt

- Im Block **CANVAS MOTIF IMAGES** steht z. B.:  
  `MOTIF FORMATS (MANDATORY – 100% preserve): Motif 1 = aspect ratio 16:9; Motif 2 = aspect ratio 1:1. Each motif must be displayed in exactly this aspect ratio – no stretching, cropping, or distortion.`
- Bei FLUX 2 Pro wird im REFERENCE IMAGE INDEX ergänzt:  
  `Format (MUST preserve 100%): Motif 1 = 16:9, Motif 2 = 1:1.`

### Relevante Code-Stellen

- **Backend:** `paint-engine/backend/src/routes/scenes.ts`  
  - `getMotifAspectRatios(motifPaths)`  
  - Aufrufe in `buildPromptsForScene`, `generateImage`, `generateImageWithFeedback`
- **Prompt-Builder:** `paint-engine/backend/src/services/promptBuilder.ts`  
  - `buildImageGenerationPrompt(…, motifAspectRatios?: string[])`

---

## 2. Canvas in Referenzbild durch Motiv ersetzen

### Ziel

Wenn das **Referenzfoto (Blueprint)** bereits eine Leinwand (oder ein Bild/Rahmen an der Wand) zeigt, soll **diese** Leinwand durch das **hochgeladene Motiv** ersetzt werden – nicht gemischt, nicht verzerrt. Das Motiv wird als Leinwand dargestellt, in korrektem Format.

### Umsetzung

- **Ersetzen, nicht überblenden:** Der Prompt fordert explizit, den **Inhalt** der im Referenzbild sichtbaren Leinwand durch die Nutzer-Motivbilder zu ersetzen.
- **Format:** Das Motiv darf dabei weder gestreckt, gestaucht noch verzerrt werden; das richtige **Seitenverhältnis** muss eingehalten werden (siehe Abschnitt 1).

### Im Prompt

- **CANVAS MOTIF IMAGES:**  
  `REPLACE ANY EXISTING CANVAS IN THE REFERENCE: If the composition blueprint or any reference image already shows a canvas (or picture/frame on the wall), that canvas content must be REPLACED by the user's uploaded motif image(s). Do NOT keep the original artwork that appears on the canvas in the reference – the user's motif REPLACES it. The motif is displayed as a canvas, in its correct size and aspect ratio – never stretched, stuffed, cropped, or distorted.`
- **REFERENCE IMAGE INDEX (FLUX 2 Pro), wenn Blueprint + Motiv:**  
  `Image 1 = composition blueprint. If it shows a canvas, REPLACE that canvas with the user's motif image(s); keep motif aspect ratio.`
- **Scene Intelligence (bei Blueprint + Motiv):**  
  Zusätzlicher Hinweis im User-Prompt:  
  `If the composition reference (blueprint) already shows a canvas or picture on the wall, that canvas must be REPLACED by the user's uploaded motif(s) – not stretched, stuffed, or distorted; display the motif in its correct aspect ratio.`

### Relevante Code-Stellen

- **promptBuilder.ts:** Motiv-Block mit „REPLACE ANY EXISTING CANVAS“, Index-Beschreibung für Blueprint mit „If it shows a canvas, REPLACE …“
- **scenes.ts:** Variable `replaceCanvasHint` in `buildPromptsForScene` und `generateImage`, nur wenn `blueprintImagePath` und Motiv vorhanden

---

## Kurzfassung

| Thema | Verhalten |
|-------|-----------|
| **Motivformat** | Aus Bilddateien gelesen, als Aspect Ratios (z. B. 16:9, 1:1) in Preview-, Generierungs- und Refinement-Prompt übergeben; Anweisung „100 % beibehalten, kein Stretch/Crop“. |
| **Canvas ersetzen** | Wenn das Referenzbild (Blueprint) bereits eine Leinwand zeigt: Diese wird durch das Nutzer-Motiv **ersetzt**; Motiv als Leinwand, korrektes Format, keine Verzerrung. |

Diese Logik ist ab **Version 1.2.0** aktiv.
