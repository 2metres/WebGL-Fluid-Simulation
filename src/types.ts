export interface Config {
  AUTOSPLAT: boolean;
  SPLATS: number;
  BPM: number;
  SIM_RESOLUTION: number;
  DYE_RESOLUTION: number;
  CAPTURE_RESOLUTION: number;
  DENSITY_DISSIPATION: number;
  VELOCITY_DISSIPATION: number;
  PRESSURE: number;
  PRESSURE_ITERATIONS: number;
  CURL: number;
  SPLAT_RADIUS: number;
  SPLAT_FORCE: number;
  SHADING: boolean;
  COLORFUL: boolean;
  COLOR_UPDATE_SPEED: number;
  PAUSED: boolean;
  BACK_COLOR: { r: number; g: number; b: number };
  TRANSPARENT: boolean;
  BLOOM: boolean;
  BLOOM_ITERATIONS: number;
  BLOOM_RESOLUTION: number;
  BLOOM_INTENSITY: number;
  BLOOM_THRESHOLD: number;
  BLOOM_SOFT_KNEE: number;
  SUNRAYS: boolean;
  SUNRAYS_RESOLUTION: number;
  SUNRAYS_WEIGHT: number;
}

export interface Format {
  internalFormat: number;
  format: number;
}

export interface WebGLContext {
  gl: WebGL2RenderingContext;
  ext: {
    formatRGBA: Format;
    formatRG: Format;
    formatR: Format;
    halfFloatTexType: number;
  };
}

export interface FramebufferObject {
  texture: WebGLTexture;
  fbo: WebGLFramebuffer;
  width: number;
  height: number;
  texelSizeX: number;
  texelSizeY: number;
  attach: (id: number) => number;
}

export interface DoubleFramebufferObject {
  width: number;
  height: number;
  texelSizeX: number;
  texelSizeY: number;
  read: FramebufferObject;
  write: FramebufferObject;
  swap: () => void;
}

export interface Texture {
  texture: WebGLTexture;
  width: number;
  height: number;
  texelSizeX: number;
  texelSizeY: number;
  attach(id: number): number;
}

export interface Framebuffer extends Texture {
  fbo: WebGLFramebuffer | null;
}

export interface DoubleFramebuffer {
  read: Omit<Framebuffer, "fbo"> & { fbo: WebGLFramebuffer };
  write: Omit<Framebuffer, "fbo"> & { fbo: WebGLFramebuffer };
  width: number;
  height: number;
  texelSizeX: number;
  texelSizeY: number;
  swap: () => void;
}

export interface BlurTarget {
  width: number;
  height: number;
  texelSizeX: number;
  texelSizeY: number;
  attach(id: number): number;
  fbo: WebGLFramebuffer | null;
}

export interface BlurTemp {
  width: number;
  height: number;
  attach(id: number): number;
  fbo: WebGLFramebuffer | null;
}
