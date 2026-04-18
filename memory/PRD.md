# Social Chaos — Mobile Game Key-Art App

## Overview
Expo React Native mobile app for the physics party game "Social Chaos". The app is a cinematic game landing screen that showcases AI-generated 3D key art, the chaos crew roster, and primary CTAs.

## Key Features
- **Hero Key Art (full-bleed)** — AI-generated 3D game key art with ragdoll characters, flying rocket, banana bro, giant pink CHAOS BOMB, neon city street.
- **Animated "SOCIAL CHAOS" title** — Chunky 3D block letters with layered neon pink + electric cyan shadow and a subtle jiggle animation.
- **Comic POW / BAM / BOOM bubbles** — Spring-animated comic bursts floating over the hero.
- **Status chips** — PRE-SEASON + v0.1 BETA chips top-left.
- **Tagline** — "PHYSICS. PARTY. PURE MAYHEM." on a rotated yellow sticker.
- **PLAY NOW CTA** — Primary comic-style button (neon pink, chunky black border, hard shadow, press-down effect).
- **REGEN ART CTA** — Cyan secondary button; calls the backend to generate a new key art via Gemini Nano Banana.
- **Loading state** — Full-hero overlay with activity indicator and "BREWING FRESH CHAOS…" label while the image is generated.
- **Character roster strip** — Horizontally scrollable cards: Banana Bro, Rocket Rico, Hammer Hana, Cart Kai, Bomb Bea. Banana & Rocket use real 3D character art; others use pop-art backgrounds with emojis.

## Backend Endpoints (FastAPI, /api prefix)
- `GET /api/` — service ping.
- `GET /api/health` — returns `{ status, llm_key_configured, time }`.
- `POST /api/generate-keyart` — body `{ variant?: string }`. Calls Gemini Nano Banana (`gemini-3.1-flash-image-preview`) via EMERGENT_LLM_KEY. Returns `{ id, image_base64 (data URI), mime_type, caption, created_at }`. Stores metadata (not the base64 payload) in Mongo collection `keyart_generations`.

## Integrations
- **Gemini Nano Banana** (`gemini-3.1-flash-image-preview`) via `emergentintegrations` + `EMERGENT_LLM_KEY` — image generation.

## Design Language
- Dark Pop-Art / Neon palette: `#FF007F` (neon pink), `#00F0FF` (electric cyan), `#FFD700` (pop yellow), `#FF4500` (sunset orange), `#B83DFF` (pop purple), `#110B17` (BG), `#2D004E` (surface).
- Chunky black 3-4px borders, hard shadows, 14-22px radii, spring bounces, title jiggle, press-down button states.
- Follows `/app/design_guidelines.json` (Electric & Neon + Vibrant Play archetype).

## Web-specific implementation note
React-native-web 0.21 does not paint the `<Image>` container's `background-image`, so hero + roster images use a `Platform.OS === "web"` branch that renders a `<View>` with inline `backgroundImage` CSS. Native platforms use the standard RN `<Image>` component.

## File Structure
- `/app/backend/server.py` — FastAPI app with key-art endpoint.
- `/app/backend/.env` — Contains `EMERGENT_LLM_KEY`, `MONGO_URL`, `DB_NAME`.
- `/app/frontend/app/index.tsx` — Single-screen landing UI.
- `/app/design_guidelines.json` — Design system reference.

## Dodge-Runner Mini-Game (added in iteration 2)
- New route `/app/frontend/app/play.tsx` — 3-lane endless dodge-runner.
- Player runs at the bottom of the field; hammers 🔨 and shopping carts 🛒 spawn from the top, falling at a speed that ramps with score.
- Tap left/right half of the field or press ←/→ (web) to switch lanes.
- Score = time survived × 10; speed multiplier shown in the HUD.
- Collision = Game Over → player enters name → score POSTed to backend → global leaderboard refreshed.
- Sound FX via Web Audio API tones on web (POW, near-miss, milestone, BOOM). `expo-av` installed for future native SFX.

### New Backend Endpoints
- `POST /api/scores` — body `{ player_name, score }`. Name uppercased + trimmed to 12 chars (empty → `ANON`). Stored in Mongo `scores` collection. Returns `ScoreEntry`.
- `GET /api/scores/top?limit=10` — returns `{ scores: [...] }` sorted by score desc.

### Navigation
- `PLAY NOW` on the landing screen now routes via `router.push("/play")`.
- In-game HOME buttons route back via `router.push("/")`.
