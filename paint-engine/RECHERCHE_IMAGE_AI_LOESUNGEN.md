# Recherche: Lösungen für Content-Filter & Bildtreue-Probleme

**Datum:** Februar 2026
**Analyse-Grundlage:** MLG AI Creatie Studio (Paint Engine Codebase)

---

## Das aktuelle Setup (kurze Analyse)

Das Studio nutzt aktuell zwei Provider:

- **Gemini (Google)** → `gemini-3-pro-image-preview`: Gut für szenische Komposition, aber blockiert Nacktheit, Disney/IP-Inhalte und Prominente via `finishReason: OTHER | RECITATION | SAFETY`
- **Flux 2 Pro (Replicate)** → `black-forest-labs/flux-2-pro`: Unterstützt bis zu 8 Referenzbilder, aber erzeugt starke „Halluzinationen" – Kunstwerke werden im Output stark verändert

Das Problem ist gut dokumentiert: Der Code hat bereits `buildBlockReasonMessage()` mit spezifischen Fehlermeldungen für Disney/Copyright-Blocks (`finishReason: OTHER`) und es gibt einen `safetyLevel: 'relaxed'`-Modus sowie einen `disableSafetyChecker`-Flag für Replicate.

---

## Problem 1: Nacktheit / Adult Content

### Warum Gemini und Flux 2 Pro versagen

- **Gemini**: Selbst mit `BLOCK_ONLY_HIGH` und `safetyLevel: 'relaxed'` blockiert Gemini explizite Nacktheit. Das ist eine harte Richtlinie von Google, die sich nicht über API-Parameter umgehen lässt.
- **Flux 2 Pro über Replicate**: Hat bereits `safety_tolerance: 5` (Maximum) im Code implementiert. Die bisherigen Halluzinationen bei Referenzbildern sind aber ein Qualitätsproblem, kein Filter-Problem.

### Lösung A: FAL.ai – Z-Image (empfohlen für NSFW)

**Was es ist:** Ein speziell auf Adult Content ausgelegtes Modell, das über FAL.ai zugänglich ist.

- **API:** Ja, offizielles Node.js-SDK vorhanden
- **Kosten:** Ca. $0.005 pro Megapixel
- **NSFW:** Vollständig unkensiert, kein Safety-Filter
- **Endpoint:** `fal-ai/z-image/turbo`
- **Integration:** Neuen Provider `FalProvider` in der bestehenden `providerFactory.ts` ergänzen (ohne bestehenden Code zu ändern)

**Limitierung:** Bildqualität und Referenzbild-Fidelity ist niedriger als FLUX 2 Pro. Für reine Text-zu-Bild-Generierung mit NSFW-Inhalten aber sehr brauchbar.

### Lösung B: Self-Hosted via RunPod + ComfyUI (empfohlen für volle Kontrolle)

**Was es ist:** SDXL- oder FLUX-Modelle laufen auf eigenem GPU-Server (RunPod), kein externer Content-Filter.

- **Kosten:** $0.24–0.50/Stunde GPU-Zeit
- **NSFW:** Vollständige Kontrolle – kein Filter, außer dem den man selbst einbaut
- **Copyright:** Volle Kontrolle über alle Filter
- **Node.js Integration:** Über WebSocket-Client (`comfy-ui-client` npm-Paket)
- **Modell-Empfehlung:** SDXL 1.0 (OpenRAIL-M Lizenz – unveränderlich, auch nach Stability AI Policy-Änderungen)

**Vorteil:** Damit lassen sich gleichzeitig Problem 1 (Nacktheit) und Problem 2 (Copyright) lösen.
**Nachteil:** Höhere Infrastruktur-Komplexität, eigene Server-Verwaltung nötig.

---

## Problem 2: Copyright / Lizenzierte Inhalte (Disney, etc.)

### Die unbequeme Wahrheit: Es gibt keinen „Lizenz-API-Parameter"

Es existiert **kein Standard** in der Branche, bei dem man einer KI per API mitteilen kann: „Ich habe eine Lizenz für diesen Inhalt." Das Disney-OpenAI-Modell zeigt, wie das in der Praxis gelöst wird: Disney hat direkt mit OpenAI einen 3-Jahres-Exklusivvertrag geschlossen. OpenAI hat dann spezifische Disney-Charaktermodelle trainiert. Das ist kein API-Toggle – das ist ein Millionen-Dollar-Unternehmensvertrag.

### Warum Gemini Disney erkennt und blockiert

Gemini ist ein **multimodales Reasoning-Modell** – es versteht, was es sieht, und wendet deshalb aktiv IP-Regeln an. Das führt zu `finishReason: 'OTHER'` oder `'RECITATION'`.

### Lösung A: Neuere FLUX-Modelle testen (kurzfristig)

Flux-Modelle sind primär **Bildgenerierungsmodelle**, keine multimodalen Reasoning-Modelle. Sie haben weniger aggressive Copyright-Erkennung als Gemini. Der bestehende `safety_tolerance: 5` (Maximum) auf Replicate sollte bereits Copyright-Blocking reduzieren.

**Praktischer Test:** Wenn ein Disney-Motiv als Referenzbild in Flux 2 Pro hochgeladen wird, ist die Wahrscheinlichkeit eines Blocks deutlich geringer als bei Gemini, weil Flux keine inhaltsbasierte Reasoning-Schicht hat. Das Problem mit Flux ist die **Bildtreue**, nicht der Filter.

### Lösung B: Self-Hosted Lösung (nachhaltig)

Bei selbst gehosteten Modellen (RunPod/ComfyUI) entscheidet man selbst, was gefiltert wird. Da man die tatsächliche Lizenz besitzt, ist das rechtlich korrekt – die KI muss davon nicht wissen. Die Lizenz legitimiert die Nutzung, unabhängig davon, was das Modell "denkt".

**Wichtig:** Das Hochladen von lizenziertem IP-Material in öffentliche API-Dienste (Gemini, Replicate, FAL) kann theoretisch problematisch sein, weil diese Dienste die Daten für Training verwenden könnten (je nach Nutzungsbedingungen). Self-Hosting ist auch aus Datenschutz-/IP-Perspektive sauberer.

### Lösung C: Adobe Firefly Services (Enterprise-Option)

Adobe Firefly wurde ausschließlich mit **lizenzfreien und Adobe Stock-lizenzierten** Inhalten trainiert. Für spezifisch lizenzierte Disney-Inhalte gibt es eine **Object Composite API**, die Produkte in Szenen platziert.

- **Vorteil:** Firefly respektiert explizit IP und bietet Custom Model APIs für Brand-konsistente Inhalte
- **Nachteil:** Teuer (Enterprise-Pricing), keine NSFW-Unterstützung, Disney-Charaktere auch hier nicht out-of-the-box
- **Einsatzbereich:** Nicht für Disney-Charaktere, aber für die generellen Social-Media-Creatives und Banner ohne lizenzierte IP

---

## Problem 3: Halluzinationen in Flux 2 Pro (Bildtreue)

Das ist das kritischste Problem aus technischer Sicht, weil es den Kernflow direkt betrifft.

### Warum FLUX 2 Pro halluziniert

FLUX 2 Pro mit `input_images` ist ein **Multi-Referenz-Modell**: Es versucht, Stilelemente aus mehreren Bildern zu kombinieren und in eine neue Szene zu übersetzen. Es ist **kein Compositing-Tool** – es interpretiert Referenzen kreativ. Für Kunstwerke, die exakt so dargestellt werden müssen wie hochgeladen, ist das ein grundlegendes Architekturproblem.

### Lösung A: FLUX Kontext Pro (empfohlen – Game Changer)

**FLUX.1 Kontext** von Black Forest Labs (2025) ist speziell für diesen Use-Case entwickelt worden:

- **Funktion:** Nimmt ein bestehendes Bild + Text-Prompt → Editiert das Bild gezielt, während wichtige Elemente erhalten bleiben
- **Ideal für:** „Platziere dieses Kunstwerk in einem Galerie-Setting" – das Kunstwerk bleibt originalgetreu
- **Stärke:** Lokale Edits statt kreativer Neugenerierung
- **Fidelity:** Deutlich höher als FLUX 2 Pro für Referenzbild-Szenarien
- **Verfügbar über:** FAL.ai (`fal-ai/flux/flux-1-kontext-pro`) und Replicate
- **Pricing:** Pay-per-use (ähnlich wie FLUX 2 Pro)
- **Node.js:** Ja

**Warum das den Unterschied macht:** Statt 8 Referenzbilder zu übergeben und FLUX 2 Pro zu bitten, daraus etwas zu bauen, gibt man FLUX Kontext *das Kunstwerk direkt* und sagt: „Hier ist das Bild – platziere es in dieser Szene." Das ist genau das Richtige für euren Workflow.

### Lösung B: FLUX Depth + FLUX Canny (ControlNet)

Für strukturelle Genauigkeit:

- **FLUX Depth (`fal-ai/flux-1-depth-dev`):** Analysiert räumliche 3D-Beziehungen im Referenzbild → Perspektive und Tiefe werden erhalten
- **FLUX Canny (`fal-ai/flux-1-canny-dev`):** Edge-Detection → Genaue Linien und Strukturen aus Referenzbild werden übernommen

**Einsatz:** Wenn ein Kunstwerk in einer Szene platziert werden soll und die exakten Proportionen/Kanten erhalten bleiben müssen. In Kombination mit FLUX Kontext sehr mächtig.

### Lösung C: Parameter-Optimierung in FLUX 2 Pro (kurzfristig)

Falls der FLUX 2 Pro-Ansatz beibehalten werden soll, können folgende Anpassungen die Halluzinationen reduzieren:

- **Mehr Inference Steps**: FLUX 2 Pro auf Replicate hat einen `num_inference_steps`-Parameter – auf 50+ erhöhen (aktuell unklar ob im Code gesetzt)
- **Konkretere Prompts**: Statt „display this artwork in a gallery" → „The artwork hanging on the wall is EXACTLY as shown in reference image 1. Do not alter, stylize or reinterpret the artwork. Only the room/environment around it can be generated."
- **Weniger Referenzbilder**: Je mehr Referenzen, desto mehr Interpretationsspielraum. Für einen einzelnen Artwork-Slot: nur das Kunstwerk + ein Hintergrund-Referenzbild.

### Lösung D: Spezialisierte Produkt-Fotografie-Services

Für den E-Commerce-Banner-Workflow gibt es dedizierte APIs:

- **Claid.ai:** KI speziell trainiert auf Produktdetails, Logos, Texturen – 5x günstiger als klassische Bildbearbeitung
- **Photoroom API** (GPT-image-1 integration, Juli 2025): $20/Monat für 1.000 Bilder ($0.02/Bild) – reale Produkt-in-Szene-Platzierung mit hoher Fidelity
- **Adobe Firefly Object Composite API:** Produkt-Shots in realistische Settings platzieren, Enterprise-Grade

---

## Empfohlene Strategie: Die 3-Stufen-Lösung

### Stufe 1 – Kurzfristig (1–2 Wochen): FAL.ai als dritter Provider

Einen neuen `FalProvider` in der bestehenden Architektur ergänzen, der parallel zu Gemini und Replicate läuft:

```
Provider-Auswahl in der UI:
├── Gemini        → Non-NSFW, kein Disney/Prominente, beste Qualität bei Standard-Content
├── Flux 2 Pro    → Szenen mit Referenzbildern (aktuell mit Halluzinationen)
└── FAL.ai (NEU) → NSFW-Content, lizenzierter IP-Content, FLUX Kontext für Bildtreue
```

**Konkrete FAL.ai-Modelle:**
- `fal-ai/flux/flux-1-kontext-pro` → Für das Halluzinations-Problem (Hauptlösung)
- `fal-ai/z-image/turbo` → Für NSFW-Content
- `fal-ai/flux-1-depth-dev` + `fal-ai/flux-1-canny-dev` → Für strukturell genaue Platzierungen

**Integration:** FAL.ai hat ein offizielles `@fal-ai/client`-NPM-Paket. Die bestehende Provider-Architektur (Interface `AIProvider`) ist bereits vorbereitet, einen neuen Provider hinzuzufügen.

### Stufe 2 – Mittelfristig (1–2 Monate): Self-Hosted ComfyUI für volle Kontrolle

Für NSFW + lizenzierter Disney-Content:

- RunPod-Server mit ComfyUI + SDXL einrichten
- Eigene Content-Filter-Logik implementieren (nur die Fälle filtern, die man will)
- Über WebSocket-API in den bestehenden Backend-Flow einbinden
- Vorteil: Keine Daten verlassen die eigene Infrastruktur (IP-Schutz für Disney-Lizenzen)

### Stufe 3 – Langfristig: Direkte API-Vereinbarungen

Für dauerhaft skalierbare Lösung mit lizenzierten Inhalten:
- Mit FAL.ai oder Replicate direkte Gespräche führen: „Wir haben Disney-Lizenzen, was ist möglich?"
- Adobe Firefly Custom Models API prüfen für Nicht-Disney-Content (saubere IP-Grundlage)
- Oder: Eigene LoRA-Modelle auf SDXL trainieren – mit dem lizenzierten Disney-Artwork als Trainingsdaten. Da man die Lizenz hat, ist das Training legitim. Das Modell „kennt" dann die Motive.

---

## Zusammenfassung: Welches Modell für welchen Use-Case

| Use-Case | Aktuell | Empfehlung | Warum |
|---|---|---|---|
| Standard Social Media Creatives | Gemini ✅ | Gemini beibehalten | Funktioniert gut |
| Online-Shop-Banner (neue Motive) | Gemini / Flux 2 Pro | **FLUX Kontext Pro (FAL.ai)** | Kunstwerk bleibt originalgetreu |
| Disney/lizenzierter IP-Content | ❌ Geblockt | **Self-Hosted SDXL** oder **Flux mit safety_tolerance: 6** | Kein externer Filter |
| NSFW / Aktdarstellungen | ❌ Geblockt | **Z-Image via FAL.ai** oder **Self-Hosted** | Keine Content-Policy |
| Komplexe Produkt-in-Szene-Platzierung | Flux 2 Pro (Halluzinationen) | **FLUX Kontext Pro** | Designed genau dafür |
| E-Commerce Bulk-Produktion | - | **Photoroom API** oder **Claid.ai** | Günstig, schnell, produktspezifisch |

---

## Konkrete nächste Schritte (ohne Code-Änderungen vorab)

1. **FLUX Kontext Pro manuell testen:** Über fal.ai Playground oder Replicate direkt testen, ob ein hochgeladenes Kunstwerk in eine Galerie-Szene platziert werden kann ohne Halluzinationen
2. **FAL.ai Account erstellen:** API-Key holen, Kostenstuktur prüfen
3. **Z-Image testen:** Ein konkretes NSFW-Beispiel mit Z-Image generieren und Qualität beurteilen
4. **FLUX Canny/Depth testen:** Für Referenzbild-Strukturerhaltung Testdurchläufe machen
5. **RunPod Setup evaluieren:** Für Self-Hosting: Kosten kalkulieren (GPU-Stunden pro Monat)

---

## Quellen

- [FAL.ai FLUX Kontext Pro](https://fal.ai/models/fal-ai/flux/flux-1-kontext-pro)
- [FLUX.2 Complete Guide 2026](https://wavespeed.ai/blog/posts/flux-2-complete-guide-2026/)
- [FLUX ControlNet Guide](https://flux-kontext.io/posts/flux-controlnet)
- [Together AI FLUX.2 Multi-Reference](https://www.together.ai/blog/flux-2-multi-reference-image-generation-now-available-on-together-ai)
- [Disney-OpenAI Licensing Agreement](https://openai.com/index/disney-sora-agreement/)
- [Stability AI NSFW Policy Update](https://civitai.com/articles/17499/update-on-stability-ai-acceptable-use-policy-change)
- [ComfyUI Product Photography Workflows](https://myaiforce.com/comfyui-product-photography/)
- [Adobe Firefly Object Composite API](https://developer.adobe.com/firefly-services/docs/guides/tutorials/create-product-images-with-ff/)
- [Photoroom API](https://www.photoroom.com/api)
- [Claid.ai Platform](https://claid.ai/)
- [Z-Image via FAL.ai](https://fal.ai/models/fal-ai/z-image/turbo/api)
- [RunPod ComfyUI SDXL](https://civitai.com/articles/11447/runpod-template-one-click-comfyui-with-sdxl-for-effortless-sfwnsfw-image-generation)
