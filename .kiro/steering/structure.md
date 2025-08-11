# Project Structure

## Root Directory
- `src/` - Source code
- `plugin/` - Plugin assets and manifest
- `dist/` - Build output (generated)
- `uxp-plugin-tests/` - Test files
- `webpack.config.js` - Build configuration
- `package.json` - Dependencies and scripts

## Source Organization (`src/`)

### Entry Point
- `index.jsx` - Main entry point, sets up UXP entrypoints and controllers
- `styles.css` - Global styles

### Components (`src/components/`)
- Reusable UI components
- Each component has its own `.jsx` and `.css` files
- Examples: `Hello.jsx`, `ColorPicker.jsx`, `About.jsx`, `Icons.jsx`

### Controllers (`src/controllers/`)
- `PanelController.jsx` - Manages panel lifecycle and rendering
- `CommandController.jsx` - Manages command execution and dialogs

### Panels (`src/panels/`)
- Top-level panel components
- `Demos.jsx` - Main demo panel
- `MoreDemos.jsx` - Secondary demo panel

## Plugin Assets (`plugin/`)
- `manifest.json` - UXP plugin manifest with entrypoints and permissions
- `index.html` - Plugin HTML entry point
- `icons/` - Plugin icons for different themes and scales

## Architecture Patterns

### Controller Pattern
- Controllers manage component lifecycle and UXP integration
- Separate controllers for panels and commands
- Controllers handle menu items and event binding

### Component Structure
- Functional components with hooks (React 16.8+)
- Adobe Spectrum Web Components (`sp-*` elements) for UI
- CSS modules pattern with component-specific stylesheets

### File Naming
- `.jsx` extension for React components
- `.css` extension for stylesheets
- PascalCase for component names
- Descriptive, feature-based naming