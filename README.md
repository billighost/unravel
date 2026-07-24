# Unravel 🎨🧊

> An interactive, tactile 3D generative art canvas & physical block simulation powered by WebGL, Three.js, and Web Audio.

**Unravel** transforms your images, digital drawings, webcam snapshots, and custom typography into a dynamic matrix of physical 3D cubes. Touch, fling, explode, and manipulate the block grid in real-time, then watch it seamlessly reconstruct itself back into crystal-clear artwork.

---

## 🌟 Highlights

- **🧊 Active-Set 3D Physics Engine**: Custom-built WebGL block simulation using Three.js `InstancedMesh` with high-performance $O(\text{active})$ collision tracking, spatial neighbor detection, and solid UI element AABB collisions.
- **🎨 Multi-Input Generative Modes**:
  - **Upload Mode**: Transform local images, camera snapshots, or clipboard images into 3D voxel matrices.
  - **Draw Mode**: Paint freehand onto an interactive canvas with custom brush sizes and color palettes.
  - **Type Mode**: Render custom text and typography into physical block structures.
- **💥 Disperse & Revert**: Explosive outward radial scattering wave ("Disperse") and buttery smooth cubic-bezier physics reconstruction ("Revert").
- **🔊 Procedural Web Audio Engine**: Zero-sample, low-latency audio synthesizer generating dynamic pitch-shifted block collision clicks, knock sounds, and completion chimes via the Web Audio API.
- **🎥 WebM & Native MP4 Video Export**: Record physics interactions in real-time and export high-resolution WebM or frame-encoded MP4 videos using `mp4-muxer` and WebCodecs.
- **📱 Mobile & Tactile Gestures**: Multi-touch disturbance, DeviceOrientation parallax tilt, mobile "Shake to Revert", and touch haptics.
- **⚡ Dynamic Adaptive Quality Tiering**: Real-time FPS monitoring that automatically tunes physics iterations, rest thresholds, and particle resolution to ensure locked 60+ FPS on high-end and low-end devices alike.
- **🖼️ Local Gallery & Auto-Resume**: Integrated IndexedDB storage that autosaves work, supports session recovery, and provides an offline gallery.

---

## 📱 Interactive Modes

| Mode | Description | Key Features |
| :--- | :--- | :--- |
| **🖼️ Upload** | Image & Camera Voxelization | Local file drag-and-drop, global paste (`Ctrl+V`), camera snapshot |
| **🎨 Draw** | Freehand Block Painting | Brush sizing, quick color swatches, eraser, real-time preview |
| **🔤 Type** | Voxelized Typography | Dynamic text input, font rendering, instant 3D layout |
| **⚡ Demo** | Preset Artwork | Quick instant-start artwork showcase |

---

## 🕹️ Controls & Interaction Guide

### Desktop & Mouse
- **Click & Drag**: Apply physics impulse to disturb nearby 3D blocks.
- **Global Paste (`Ctrl + V`)**: Paste any copied image directly into the 3D canvas.
- **Drag-and-Drop**: Drag any image file anywhere on the screen to pixelate it into 3D blocks.
- **Disperse Button**: Trigger an explosive radial scatter wave across all cubes.
- **Revert Button**: Eases all disturbed blocks back to their exact original positions.

### Mobile & Touch
- **Multi-Touch**: Touch and drag multiple fingers to disturb blocks simultaneously.
- **Device Tilt**: Tilt your device to adjust camera perspective and tilt parallax.
- **Shake to Reset**: Shake your mobile device to trigger the Revert animation.
- **Haptic Feedback**: Subtle vibration cues on block collisions (on supported devices).

---

## 🛠️ Architecture & Tech Stack

Unravel is built with a modern Next.js App Router stack designed for extreme WebGL performance, accessibility, and sleek aesthetic design.

```
unravel/
├── src/
│   ├── app/                 # Next.js App Router root layout & main page
│   ├── components/
│   │   ├── canvas/          # Three.js WebGL InstancedMesh canvas setup
│   │   ├── modes/           # Mode overlays (Upload, Draw, Type, Select)
│   │   └── ui/              # Neo-brutalist tactile UI components & modals
│   ├── lib/
│   │   ├── audio/           # Web Audio API procedural sound synthesizer
│   │   ├── cubePhysics.ts   # Active-set 3D physics engine & collision solver
│   │   ├── imageSampler.ts  # Canvas pixel-to-grid sampling utility
│   │   ├── qualityTier.ts   # Adaptive FPS monitor & quality scaler
│   │   ├── storage.ts       # IndexedDB / LocalStorage creation state manager
│   │   ├── uiObstacles.ts   # Screen UI obstacle AABB collision tracking
│   │   └── videoRecorder.ts # WebM recorder & MP4 transcode multiplexer
│   └── store/
│       └── useAppStore.ts   # Zustand global application state store
```

### Core Technologies
- **Framework**: [Next.js 16](https://nextjs.org/) (App Router) & [React 19](https://react.dev/)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **3D Graphics & WebGL**: [Three.js](https://threejs.org/) (`InstancedMesh`, `SRGBColorSpace`)
- **Animation**: [Framer Motion](https://framer.com/motion)
- **State Management**: [Zustand](https://zustand-demo.pmnd.rs/)
- **Video Encoding**: [`mp4-muxer`](https://github.com/Vanilagy/mp4-muxer) & WebCodecs API
- **Icons**: [Lucide React](https://lucide.dev/)
- **Styling**: Vanilla CSS custom properties with Neo-Brutalist design tokens

---

## 🚀 Getting Started

### Prerequisites

Ensure you have [Node.js](https://nodejs.org/) (version 18+ recommended) and `npm`, `yarn`, `pnpm`, or `bun` installed.

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-username/unravel.git
   cd unravel
   ```

2. **Install dependencies**:
   ```bash
   npm install
   # or
   yarn install
   # or
   pnpm install
   # or
   bun install
   ```

3. **Launch the development server**:
   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📹 Video Export & Recording

Unravel supports high-speed canvas recording:
1. Open the **Save** modal from the canvas controls.
2. Select your desired format:
   - **WebM Video**: Fast, native browser recording format.
   - **MP4 Video**: Encoded on-the-fly using `mp4-muxer` WebCodecs pipeline for maximum player compatibility.
3. Trigger interaction or click **Disperse**, then click **Revert**.
4. The recording automatically finalizes and downloads your video moment upon completion!

---

## ♿ Accessibility & i18n

- **Screen Reader Support**: Integrated ARIA live region (`AccessibilityAnnouncer`) providing screen reader updates for canvas state changes, mode switches, and exports.
- **Multilingual Support**: Centralized localization system (`i18n`) for multi-language support.
- **UI Physics Obstacles**: UI buttons and modal dialogs project 3D AABB bounding volumes so blocks bounce off floating buttons.

---

## 📲 Progressive Web App (PWA) & Icon Generation

Unravel is fully configured as a standalone **Progressive Web App (PWA)**:
- **Offline Shell Caching**: Core JS/CSS app shell, fonts, WebGL canvas, Draw Mode, Type Mode, and PWA icon assets are cached via `/public/sw.js` for instant offline availability.
- **On-Brand Offline Fallback**: Custom tactile pixel-UI fallback at `/offline` when requesting uncached routes while disconnected.
- **Parametric Icon Generator**: `scripts/generate_icons.py` renders the master 3x3 grid brand icon in Python with Pillow (`pip install Pillow`) and downsamples it into all 15 required Android adaptive (maskable), iOS Apple Touch, and browser favicon sizes.

To regenerate icons after tweaking design colors or ratios in `scripts/generate_icons.py`:
```bash
python scripts/generate_icons.py
```

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for more details.

---

<p center="true">
  Made with ❤️ using Next.js, Three.js, and TypeScript.
</p>
