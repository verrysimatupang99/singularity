# Design System Document: The Glasswing Protocol

## 1. Overview & Creative North Star
The North Star for this design system is **"The Kinetic Archive."** 

Unlike standard IDEs that feel like rigid spreadsheets, this system treats code and AI interaction as a high-performance editorial experience. It combines the brutalist efficiency of a terminal with the sophisticated density of a premium financial broadsheet. We move beyond the "template" look by utilizing intentional asymmetry—where the sidebar might be a heavy, grounding element while the editor floats as a light-filled workspace—and by leveraging extreme typographic contrast.

The goal is to create a focused, "lights-out" environment where the UI recedes, leaving only the logic and the machine's intelligence in high relief.

---

## 2. Colors: Tonal Depth & The "No-Line" Rule
The palette is built on a foundation of "Obsidian Layers." We do not use color to decorate; we use it to signify state and structural depth.

### Surface Hierarchy & Nesting
Depth is achieved through a "dark-to-light" stack. The deeper the element is in the application's logic (like a background), the darker the token.
- **Base Layer:** `surface_container_lowest` (#0d0e0f) – Used for the primary app shell.
- **Mid Layer:** `surface` (#121314) – Used for the primary editor area.
- **Top Layer:** `surface_container_high` (#292a2b) – Used for floating panels and context menus.

### The "No-Line" Rule
**Strict Prohibition:** Designers are prohibited from using 1px solid borders for sectioning panels. 
Boundaries must be defined solely through background color shifts. For example, a File Tree (`surface_container_low`) should sit flush against the Editor (`surface`) without a stroke. The eye should perceive the boundary via the change in value, not a drawn line.

### The "Glass & Gradient" Rule
To prevent the UI from feeling "flat," use Glassmorphism for transient elements (tooltips, command palettes).
- **Execution:** Apply `surface_container_high` at 80% opacity with a `20px` backdrop blur.
- **Signature Glow:** Primary actions should use a linear gradient from `primary_container` (#3fa8b0) to `primary` (#72d6de) at a 135° angle to provide a "lithium-ion" energy to the teal accent.

---

## 3. Typography: Editorial Authority
We utilize a dual-font strategy to balance technical precision with brand prestige.

*   **The Brand Voice (Instrument Serif):** Used for `display` and `headline` roles. This provides an "editorial" feel to onboarding, empty states, and major section headers. It signals that this is a tool for *authors* of code.
*   **The Engine (Inter):** Used for all `title`, `body`, and `label` roles. Inter is tuned for high information density. In the code editor and file tree, use `letter-spacing: -0.01em` to maintain a compact, professional "IDE" feel.

**Scale Highlights:**
- **Display-LG:** `Instrument Serif` / 3.5rem / Leading 1.1 (The "Hero" moment).
- **Title-SM:** `Inter` / 1.0rem / Medium weight (The standard panel header).
- **Label-SM:** `Inter` / 0.6875rem / All Caps / Tracking 0.05em (Used for terminal tabs and metadata).

---

## 4. Elevation & Depth
In this design system, elevation is a product of light, not structure.

### Tonal Layering
Instead of shadows, we stack. A "button" on a `surface_container_low` background should be `surface_container_high`. This "in-set" or "on-set" look creates a physical sense of hardware.

### Ambient Shadows
Shadows are reserved for "true" floating elements (e.g., a detached terminal window).
- **Spec:** `0px 16px 32px rgba(0, 0, 0, 0.4)`. The shadow must feel like ambient occlusion—soft, wide, and almost imperceptible.

### The "Ghost Border" Fallback
If a border is required for accessibility (e.g., input focus), use the `outline_variant` token at **20% opacity**. Never use 100% opaque borders; they shatter the "Glasswing" illusion of seamless surfaces.

---

## 5. Components

### Buttons: The "Actuator"
- **Primary:** Gradient fill (`primary_container` to `primary`). `radius-sm` (2px). No border. Text is `on_primary_fixed` (Deep Teal).
- **Secondary:** `surface_container_highest` fill with a `Ghost Border` of `primary`.
- **Tertiary:** Ghost button (no fill). Text uses `primary` color.

### Code Editor & Tree Views
- **Tree Items:** No dividers. Separation is achieved through `4px` vertical padding. Active state uses a `primary` left-border "accent" (2px wide) and a `surface_container_low` background highlight.
- **Density:** Information density must be high. Use `body-sm` for file names to maximize vertical real estate.

### Chat Bubbles (Multi-Provider)
To distinguish between AI models, use a "Signature Tint" on the bubble's ghost border:
- **Claude:** `outline_variant` with a 10% tint of Anthropic Purple.
- **GPT-4:** `outline_variant` with a 10% tint of OpenAI Green.
- **Gemini:** `outline_variant` with a 10% tint of Google Blue.

### Input Fields
- **Styling:** `surface_container_lowest` fill. `radius-sm`. 
- **Focus:** The field should not "glow." Instead, the `Ghost Border` increases in opacity from 20% to 60%, and the caret uses the `primary` cyan.

---

## 6. Do’s and Don’ts

### Do:
- **Do** embrace asymmetry. It’s okay for the right-side chat panel to be wider than the left-side file tree.
- **Do** use `surface_container` tiers to create hierarchy. If everything is the same black, the user will feel lost.
- **Do** use `Instrument Serif` for "Empty States." It turns a lack of data into a moment of brand luxury.

### Don’t:
- **Don’t** use standard "Grey" (#888). Use `on_surface_variant` (#bdc9ca) which has a hint of teal to keep the palette cohesive.
- **Don’t** use rounded "pill" buttons (unless for selection chips). This application is about precision; use `radius-sm` (2px) or `radius-md` (6px) for a sharp, engineered feel.
- **Don’t** use dividers. If you feel the need to add a line, try adding `8px` of whitespace or changing the background color of the section instead.

### Accessibility Note:
While we use a "No-Line" rule, ensure that the contrast ratio between `surface_container` levels is at least 1.1:1, and text-to-background contrast follows WCAG AA standards using the `on_surface` and `primary` tokens.