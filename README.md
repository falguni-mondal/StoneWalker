# STONEWALKER

**STONEWALKER** is a mobile-first 2.5D prehistoric-fantasy real-time strategy game built with **Three.js**, **TypeScript (strict mode)**, and **Vite**. Every 3D model, texture gradient, sound effect, and ambient battle track is authored procedurally in code with zero external asset files.

---

## 1. Setup & Commands

```bash
mkdir stonewalker && cd stonewalker
npm init -y
npm pkg set type=module
npm install three
npm install -D @types/three typescript@^5.4.5 vite@^5.2.11 vitest@^1.6.0 prettier@^3.2.5
npm install -D eslint@^9 @eslint/js@^9 typescript-eslint eslint-config-prettier
npm pkg set scripts.dev="vite --host"
npm pkg set scripts.build="tsc --noEmit && vite build"
npm pkg set scripts.preview="vite preview"
npm pkg set scripts.test="vitest run"
npm pkg set scripts.lint="eslint src"