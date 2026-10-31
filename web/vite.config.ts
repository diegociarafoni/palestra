import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// React Compiler con il preset di @vitejs/plugin-react
// (docs/riferimenti/react/learn_react-compiler_installation.md, sezione Vite).
// Root, cartella di uscita e svuotamento arrivano dallo script `build:web`.
export default defineConfig({
  plugins: [react(), babel({ presets: [reactCompilerPreset()] })],
});
