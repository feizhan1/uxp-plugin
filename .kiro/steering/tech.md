# Technology Stack

## Core Technologies
- **React 16.8.6** - UI framework with hooks support
- **Adobe UXP** - Unified Extensibility Platform for Adobe apps
- **Adobe Spectrum Web Components** - UI components (`sp-*` elements)
- **Webpack 5** - Module bundler and build system
- **Babel** - JavaScript transpiler with JSX support

## Build System
- **Webpack** with custom configuration for UXP externals
- **Babel loader** with React JSX transformation
- **CSS loader** and **style loader** for styling
- **File loader** for assets (PNG icons)
- **Copy plugin** to move plugin files to dist

## Development Dependencies
- `nodemon` - File watching for development
- `clean-webpack-plugin` - Build cleanup
- `copy-webpack-plugin` - Asset copying

## Common Commands
```bash
# Development build
npm run build

# Watch mode for development
npm run watch

# UXP plugin management
npm run uxp:load     # Load plugin into Photoshop
npm run uxp:reload   # Reload plugin
npm run uxp:watch    # Watch and auto-reload
npm run uxp:debug    # Debug plugin
```

## External Dependencies
- `uxp` - UXP runtime APIs
- `photoshop` - Photoshop-specific APIs
- `os` - Operating system utilities

All external dependencies are configured as webpack externals and provided by the UXP runtime.