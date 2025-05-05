import { createStore } from "zustand/vanilla";
import { ColorFormats } from "tinycolor2";

interface ConfigState {
  // Simulation parameters
  DYE_RESOLUTION: number;
  SIM_RESOLUTION: number;
  DENSITY_DISSIPATION: number;
  VELOCITY_DISSIPATION: number;
  PRESSURE: number;
  PRESSURE_ITERATIONS: number;
  CURL: number;
  SPLAT_RADIUS: number;
  SPLAT_FORCE: number;
  SHADING: boolean;
  COLORFUL: boolean;
  PAUSED: boolean;
  CAPTURE_RESOLUTION: number;
  COLOR_UPDATE_SPEED: number;

  // Auto Splat settings
  SPLATS: number;
  AUTOSPLAT: boolean;
  BPM: number;

  // Bloom settings
  BLOOM: boolean;
  BLOOM_ITERATIONS: number;
  BLOOM_RESOLUTION: number;
  BLOOM_INTENSITY: number;
  BLOOM_THRESHOLD: number;
  BLOOM_SOFT_KNEE: number;

  // Sunrays settings
  SUNRAYS: boolean;
  SUNRAYS_WEIGHT: number;
  SUNRAYS_RESOLUTION: number;

  // Capture settings
  BACK_COLOR: ColorFormats.RGB;
  TRANSPARENT: boolean;
}

interface ConfigActions {
  setPaused: (paused: boolean) => void;
  togglePaused: () => void;
  setDyeResolution: (resolution: number) => void;
  setSimResolution: (resolution: number) => void;
  setBloom: (enabled: boolean) => void;
  setSunrays: (enabled: boolean) => void;
  setShading: (enabled: boolean) => void;
  setAutoSplat: (enabled: boolean) => void;
  setBPM: (bpm: number) => void;
  setSplats: (splats: number) => void;
  setDensityDissipation: (value: number) => void;
  setVelocityDissipation: (value: number) => void;
  setPressure: (value: number) => void;
  setCurl: (value: number) => void;
  setSplatRadius: (value: number) => void;
  setBloomIntensity: (value: number) => void;
  setBloomThreshold: (value: number) => void;
  setSunraysWeight: (value: number) => void;
  setBackColor: (color: ColorFormats.RGB) => void;
  setTransparent: (transparent: boolean) => void;
}

export type Config = ConfigState & ConfigActions;

export const configStore = createStore<Config>((set) => ({
  // Initial state
  AUTOSPLAT: false,
  SPLATS: 10,
  BPM: 120,
  SIM_RESOLUTION: 128,
  DYE_RESOLUTION: 1024,
  CAPTURE_RESOLUTION: 512,
  DENSITY_DISSIPATION: 1,
  VELOCITY_DISSIPATION: 0.2,
  PRESSURE: 0.8,
  PRESSURE_ITERATIONS: 20,
  CURL: 30,
  SPLAT_RADIUS: 0.25,
  SPLAT_FORCE: 6000,
  SHADING: true,
  COLORFUL: true,
  COLOR_UPDATE_SPEED: 10,
  PAUSED: false,
  BACK_COLOR: { r: 0, g: 0, b: 0 },
  TRANSPARENT: false,
  BLOOM: true,
  BLOOM_ITERATIONS: 8,
  BLOOM_RESOLUTION: 256,
  BLOOM_INTENSITY: 0.8,
  BLOOM_THRESHOLD: 0.6,
  BLOOM_SOFT_KNEE: 0.7,
  SUNRAYS: true,
  SUNRAYS_RESOLUTION: 196,
  SUNRAYS_WEIGHT: 1.0,

  // Actions
  setPaused: (paused) => set({ PAUSED: paused }),
  togglePaused: () => set((state) => ({ PAUSED: !state.PAUSED })),
  setDyeResolution: (resolution) => set({ DYE_RESOLUTION: resolution }),
  setSimResolution: (resolution) => set({ SIM_RESOLUTION: resolution }),
  setBloom: (enabled) => set({ BLOOM: enabled }),
  setSunrays: (enabled) => set({ SUNRAYS: enabled }),
  setShading: (enabled) => set({ SHADING: enabled }),
  setAutoSplat: (enabled) => set({ AUTOSPLAT: enabled }),
  setBPM: (bpm) => set({ BPM: bpm }),
  setSplats: (splats) => set({ SPLATS: splats }),
  setDensityDissipation: (value) => set({ DENSITY_DISSIPATION: value }),
  setVelocityDissipation: (value) => set({ VELOCITY_DISSIPATION: value }),
  setPressure: (value) => set({ PRESSURE: value }),
  setCurl: (value) => set({ CURL: value }),
  setSplatRadius: (value) => set({ SPLAT_RADIUS: value }),
  setBloomIntensity: (value) => set({ BLOOM_INTENSITY: value }),
  setBloomThreshold: (value) => set({ BLOOM_THRESHOLD: value }),
  setSunraysWeight: (value) => set({ SUNRAYS_WEIGHT: value }),
  setBackColor: (color) => set({ BACK_COLOR: color }),
  setTransparent: (transparent) => set({ TRANSPARENT: transparent }),
}));
