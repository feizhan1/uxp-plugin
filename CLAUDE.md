# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a UXP (Unified Extensibility Platform) plugin for Adobe Photoshop built with React. The plugin is designed as an "IC产品上架图片处理助手" (IC Product Listing Image Processing Assistant) that helps users process and manage product images for e-commerce listings. The plugin provides functionality to place images into Photoshop canvases and export/upload them to servers, specifically targeting tvcmall.com and related services.

## Architecture

### Key Components
- **UXP Plugin Structure**: Uses Adobe's UXP framework for Photoshop plugins
- **React Frontend**: React 16.8.6 with functional components and hooks
- **Entry Points**: Configured via `entrypoints.setup()` in `src/index.jsx`
  - Command entry point: "About" dialog (`showAbout`) with Cmd+Shift+A / Ctrl+Alt+A shortcut
  - Panel entry point: Main image processing panel (`todoList`) labeled as "待处理产品图片"
- **Controllers**: 
  - `PanelController`: Manages React panel lifecycle and DOM mounting
  - `CommandController`: Handles command dialogs

### Core Architecture Files
- `src/index.jsx`: Main entry point, sets up UXP entrypoints and controllers with global error handling
- `src/controllers/PanelController.jsx`: Panel lifecycle management with React DOM mounting/unmounting
- `src/panels/photoshop-api.js`: Core Photoshop API integration using UXP and batchPlay for image placement
- `src/utils/globalErrorHandler.js`: Global error handling and monitoring system
- `src/utils/http.js`: HTTP utilities for API communications
- `plugin/manifest.json`: UXP plugin manifest with permissions and panel definitions

### Photoshop Integration
The plugin heavily integrates with Photoshop through:
- **UXP APIs**: File system, storage, networking
- **Photoshop Core API**: `photoshop.core.executeAsModal()` for atomic operations
- **BatchPlay API**: Low-level Photoshop automation commands
- **Image Operations**: Place images, create documents, export canvas

## Development Commands

### Essential Commands
```bash
# Install dependencies
npm install

# Development build with file watching
npm run watch

# Production build
npm run build

# Development build (single run)
npm run build:dev
```

### Testing
```bash
# Run tests
npm test

# Watch mode for tests
npm run test:watch

# Coverage report
npm run test:coverage

# CI testing (no watch)
npm run test:ci
```

### UXP Plugin Commands
```bash
# Load plugin into Photoshop (from dist folder)
npm run uxp:load

# Reload plugin in Photoshop
npm run uxp:reload

# Watch and auto-reload plugin
npm run uxp:watch

# Debug plugin
npm run uxp:debug
```

## Build Process

The plugin requires compilation before use in Photoshop:
1. **Source**: `src/` contains React components and logic
2. **Build**: Webpack compiles to `dist/` folder with UXP-compatible output
3. **Plugin Files**: `plugin/` contains static assets (icons, manifest) copied to `dist/`
4. **Loading**: Load `dist/manifest.json` in UXP Developer Tools

### Build Configuration
- **Webpack**: Custom config optimized for UXP environment
- **Babel**: Transforms JSX and modern JS for UXP compatibility
- **Externals**: UXP modules (`uxp`, `photoshop`, `os`) are external dependencies
- **Output**: Single `index.js` file (no code splitting for UXP compatibility)

## Key Technical Details

### UXP Environment Requirements
- Photoshop 23.5.0+ (manifest specifies minimum version)
- UXP 5.6+ (from README)
- Node modules are bundled, UXP APIs accessed via `require()`

### Permissions (manifest.json)
- File system access for image operations and local file processing
- Network domains for API calls and image downloads (includes tvcmall.com, AWS S3, and various mock APIs)
- Code generation for dynamic operations and string-based code execution
- Launch process for external file handling (supports common image formats and JSON)
- Webview access for embedded browser functionality

### Image Processing Workflow
1. **Input**: Local files, remote URLs, or base64 data
2. **Processing**: Create canvas matching image dimensions
3. **Placement**: Use `placeEvent` batchPlay command as smart objects
4. **Export**: PNG export with UXP file system operations
5. **Upload**: FormData upload to configured servers

## Development Notes

### Error Handling
- Global error handler in `src/utils/globalErrorHandler.js`
- UXP environment detection in photoshop-api.js
- Modal execution context for atomic Photoshop operations

### Testing Coverage Requirements
- 80% coverage thresholds for branches, functions, lines, statements
- Jest with jsdom environment for React component testing
- CSS modules mocked with identity-obj-proxy

### File Structure Patterns
- Controllers handle UXP lifecycle and React mounting
- Components are in `src/components/` with co-located CSS files
- Panels contain main UI logic in `src/panels/`
- Utils provide shared functionality

### Development Workflow
1. Run `npm run watch` for development builds with automatic recompilation
2. Use UXP Developer Tools to load `dist/manifest.json` (not `plugin/manifest.json`)
3. Use `npm run uxp:watch` for automatic plugin reloading during development
4. Test in Photoshop environment, not just browser - UXP APIs are unavailable in browser
5. All builds output to `dist/` folder; never load directly from `src/` or `plugin/` folders

### Language and Localization
- The plugin interface uses Chinese labels ("待处理产品图片") while code comments are bilingual
- Error messages and console logs are primarily in Chinese
- API integrations target Chinese e-commerce platforms (tvcmall.com)
- 使用中文交流
- Bash(cd "S:\code\ps-plugin\react-plugin" && npm run build:dev)改为：Bash(cd "S:\code\ps-plugin\react-plugin" && npm run build)
- 完成后任务后，不用运行测试来来验证修改是否正确，我会自己手动运行
- 构建成功后，我会手动测试，不需要创建测试脚本
- UXP环境不支持grid布局
- ui元素要尽量紧凑
- 在ui中不要使用btn-icon，用文字即可
- ui中文字使用10px,11px,12px三种字号
- 每次执行完一个任务，更新task.md
- 每次完成一个任务，执行:
git add .
git commit -m "$具体完成的事项"