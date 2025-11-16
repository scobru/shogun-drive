# Shogun Drive - Changelog

## [Unreleased] - 2025-01-15

### Added
- ✅ **DaisyUI Integration via CDN** - Aggiunto DaisyUI 5.0.43 tramite CDN per componenti UI consistenti
- ✅ **Light/Dark Theme Toggle** - Implementato switch per cambiare tra tema chiaro e scuro
  - Icona sole/luna nel header
  - Salvataggio preferenza in localStorage
  - Transizioni fluide tra i temi
- ✅ **Shogun Theme Integration** - Integrato il tema Shogun unificato
  - Colori coordinati con le altre app Shogun
  - Variabili CSS condivise
  - Font Poppins

### Changed
- 🔄 **Migrated from vanilla CSS to DaisyUI** - Mantenuti gli stili custom dove necessario
- 🔄 **Updated color scheme** - Tutti i colori ora usano variabili CSS del tema Shogun
- 🔄 **Improved UI consistency** - Componenti ora usano classi DaisyUI dove possibile

### Technical Details

#### DaisyUI Setup (CDN)
```html
<!-- In index.html -->
<link href="https://cdn.jsdelivr.net/npm/daisyui@5.0.43/dist/full.min.css" rel="stylesheet" />
<script src="https://cdn.tailwindcss.com"></script>
```

#### Theme Configuration
```javascript
// Tailwind config inline in index.html
tailwind.config = {
    darkMode: ["class", '[data-theme="shogun-dark"]'],
    theme: {
        extend: {
            colors: {
                'shogun-primary': '#4F6BF6',
                'shogun-primary-light': '#6B84F8',
                'shogun-primary-dark': '#3A52D4',
            }
        }
    }
}
```

#### Theme Toggle Implementation
- **Location**: `src/components/DriveApp.js`
- **Methods**:
  - `initTheme()` - Carica tema salvato da localStorage
  - `toggleTheme()` - Cambia tra dark/light
  - `updateThemeIcons()` - Aggiorna icone sole/luna
- **Storage**: `localStorage.getItem('shogun-drive-theme')`
- **Default**: `shogun-dark`

#### Available Themes
- `shogun-dark` - Tema scuro Shogun (default)
- `shogun-light` - Tema chiaro Shogun

#### Color Palette

**Dark Theme:**
- Primary: `#4F6BF6`
- Background: `#1a1240` → `#0a0821` (gradient)
- Card: `#151515`
- Text: `#ffffff` / `rgba(255, 255, 255, 0.6)`

**Light Theme:**
- Primary: `#4F6BF6`
- Background: `#f0f4ff` → `#e0e7ff` (gradient)
- Card: `#ffffff`
- Text: `#1a1a2e` / `rgba(26, 26, 46, 0.6)`

### Files Modified
- `index.html` - Aggiunto DaisyUI e Tailwind da CDN
- `src/styles.css` - Importato daisyui-overrides.css
- `src/components/DriveApp.js` - Aggiunto theme toggle logic

### Usage

#### Toggle Theme Programmatically
```javascript
// In DriveApp instance
driveApp.toggleTheme();
```

#### Check Current Theme
```javascript
const currentTheme = document.documentElement.getAttribute('data-theme');
// Returns: 'shogun-dark' or 'shogun-light'
```

#### Using DaisyUI Components
Ora puoi usare tutti i componenti DaisyUI:

```html
<!-- Button -->
<button class="btn btn-primary">Click me</button>

<!-- Card -->
<div class="card bg-base-100 shadow-xl">
  <div class="card-body">
    <h2 class="card-title">Card Title</h2>
    <p>Card content</p>
  </div>
</div>

<!-- Badge -->
<span class="badge badge-success">Success</span>

<!-- Alert -->
<div class="alert alert-info">
  <span>Info message</span>
</div>
```

### Benefits
1. **Consistency** - UI coordinata con altre app Shogun
2. **DaisyUI Components** - Accesso a tutti i componenti DaisyUI
3. **Theme Support** - Light/Dark mode con un click
4. **No Build Step** - DaisyUI caricato da CDN
5. **Smooth Transitions** - Animazioni fluide tra i temi

### Next Steps
- [ ] Convertire più componenti custom a DaisyUI
- [ ] Aggiungere più temi (es. midnight, sunset)
- [ ] Implementare theme selector con preview
- [ ] Aggiungere animazioni personalizzate

### Notes
- Il tema viene salvato in localStorage e persiste tra le sessioni
- Le transizioni CSS sono applicate globalmente per un cambio tema fluido
- Tutti gli stili custom sono mantenuti e funzionano con DaisyUI

