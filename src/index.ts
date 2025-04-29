"use strict";

import { GUI } from "dat.gui";
import { ColorFormats } from "tinycolor2";

import { config } from "./config";
import * as shaders from "./shaders";
import { Format, Pointer, WebGLContext } from "./types";
import {
  generateColor,
  getResolution,
  getTextureScale,
  hashCode,
  normalizeColor,
  scaleByPixelRatio,
  updatePointerDownData,
  updatePointerMoveData,
  updatePointerUpData,
  wrap,
} from "./utils";

const canvas = document.getElementsByTagName("canvas")[0];

resizeCanvas();

class PointerPrototype implements Pointer {
  id = -1;
  texcoordX = 0;
  texcoordY = 0;
  prevTexcoordX = 0;
  prevTexcoordY = 0;
  deltaX = 0;
  deltaY = 0;
  down = false;
  moved = false;
  color: ColorFormats.RGB = { r: 30, g: 0, b: 300 };
}

const pointers: Pointer[] = [];
const splatStack: number[] = [];

pointers.push(new PointerPrototype());

const { gl, ext } = getWebGLContext(canvas);

function isMobile() {
  return /Mobi|Android/i.test(navigator.userAgent);
}

if (isMobile()) {
  config.DYE_RESOLUTION = 512;
}
if (!ext.supportLinearFiltering) {
  config.DYE_RESOLUTION = 512;
  config.SHADING = false;
  config.BLOOM = false;
  config.SUNRAYS = false;
}

export function autoSplat(bpm: number = 0) {
  if (config.BPM === 0 || config.PAUSED) {
    clearInterval();
  }
  if (config.BPM > 0) {
    setTimeout(() => {
      splatStack.push(config.SPLATS);
      autoSplat(config.BPM);
    }, 60000 / config.BPM);
  }
}

export function startGUI() {
  const gui = new GUI({ width: 300 });

  gui
    .add(config, "DYE_RESOLUTION", {
      "very high": 2048,
      high: 1024,
      medium: 512,
      low: 256,
      "very low": 128,
    })
    .name("quality")
    .onFinishChange(initFramebuffers);
  gui
    .add(config, "SIM_RESOLUTION", { 32: 32, 64: 64, 128: 128, 256: 256 })
    .name("sim resolution")
    .onFinishChange(initFramebuffers);
  gui.add(config, "DENSITY_DISSIPATION", 0.01, 5.0).name("density diffusion");
  gui.add(config, "VELOCITY_DISSIPATION", 0, 5.0).name("velocity diffusion");
  gui.add(config, "PRESSURE", 0.0, 0.99).name("pressure");
  gui.add(config, "CURL", 0, 50).name("vorticity").step(1);
  gui.add(config, "SPLAT_RADIUS", 0.01, 1).name("splat radius");
  gui.add(config, "SHADING").name("shading").onFinishChange(updateKeywords);
  gui.add(config, "COLORFUL").name("colorful");
  gui.add(config, "PAUSED").name("paused").listen();

  let autoSplatFolder = gui.addFolder("Auto Splat");
  autoSplatFolder
    .add(config, "AUTOSPLAT")
    .name("enabled")
    .onFinishChange(updateKeywords);
  autoSplatFolder.add(config, "BPM", 0, 240).name("BPM").step(1);
  autoSplatFolder.add(config, "SPLATS", 0, 128).name("Count").step(1);

  let bloomFolder = gui.addFolder("Bloom");
  bloomFolder
    .add(config, "BLOOM")
    .name("enabled")
    .onFinishChange(updateKeywords);
  bloomFolder.add(config, "BLOOM_INTENSITY", 0.1, 2.0).name("intensity");
  bloomFolder.add(config, "BLOOM_THRESHOLD", 0.0, 1.0).name("threshold");

  let sunraysFolder = gui.addFolder("Sunrays");
  sunraysFolder
    .add(config, "SUNRAYS")
    .name("enabled")
    .onFinishChange(updateKeywords);
  sunraysFolder.add(config, "SUNRAYS_WEIGHT", 0.3, 1.0).name("weight");

  let captureFolder = gui.addFolder("Capture");
  captureFolder.addColor(config, "BACK_COLOR").name("background color");
  captureFolder.add(config, "TRANSPARENT").name("transparent");

  if (isMobile()) gui.close();

  autoSplat(config.BPM);
}

startGUI();

function getWebGLContext(canvas: HTMLCanvasElement): WebGLContext {
  const params = {
    alpha: true,
    depth: false,
    stencil: false,
    antialias: false,
    preserveDrawingBuffer: false,
  };

  let gl = canvas.getContext("webgl2", params) as WebGL2RenderingContext;

  if (!gl) {
    throw new Error("WebGL not supported");
  }

  let supportLinearFiltering: boolean;

  gl.getExtension("EXT_color_buffer_float");
  supportLinearFiltering = !!gl.getExtension("OES_texture_float_linear");

  gl.clearColor(0.0, 0.0, 0.0, 1.0);

  const halfFloatTexType = gl.HALF_FLOAT;

  const formatRGBA = getSupportedFormat(
    gl,
    gl.RGBA16F,
    gl.RGBA,
    halfFloatTexType
  );
  const formatRG = getSupportedFormat(gl, gl.RG16F, gl.RG, halfFloatTexType);
  const formatR = getSupportedFormat(gl, gl.R16F, gl.RED, halfFloatTexType);

  return {
    gl,
    ext: {
      formatRGBA,
      formatRG,
      formatR,
      halfFloatTexType,
      supportLinearFiltering,
    },
  };
}

function getSupportedFormat(
  gl: WebGL2RenderingContext,
  internalFormat: number,
  format: number,
  type: number
): Format {
  if (!supportRenderTextureFormat(gl, internalFormat, format, type)) {
    switch (internalFormat) {
      case gl.R16F:
        return getSupportedFormat(gl, gl.RG16F, gl.RG, type);
      case gl.RG16F:
        return getSupportedFormat(gl, gl.RGBA16F, gl.RGBA, type);
    }
  }

  return {
    internalFormat,
    format,
  };
}

function supportRenderTextureFormat(
  gl: WebGL2RenderingContext,
  internalFormat: number,
  format: number,
  type: number
) {
  let texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, 4, 4, 0, format, type, null);

  let fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    texture,
    0
  );

  let status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  return status == gl.FRAMEBUFFER_COMPLETE;
}

interface Material {
  vertexShader: WebGLShader;
  fragmentShaderSource: string;
  programs: WebGLProgram[];
  activeProgram: WebGLProgram | null;
  setKeywords: (keywords: string[]) => void;
  bind: () => void;
}

interface Program {
  uniforms: Record<string, WebGLUniformLocation | null>;
  program: WebGLProgram;
  bind: () => void;
}

class Material {
  uniforms: Record<string, WebGLUniformLocation | null> = {};

  constructor(vertexShader: WebGLShader, fragmentShaderSource: string) {
    this.vertexShader = vertexShader;
    this.fragmentShaderSource = fragmentShaderSource;
    this.programs = [];
    this.activeProgram = null;
  }

  setKeywords = (keywords: string[]) => {
    let hash = 0;
    for (let i = 0; i < keywords.length; i++) hash += hashCode(keywords[i]);

    let program = this.programs[hash];
    if (program == null) {
      let fragmentShader = compileShader(
        gl.FRAGMENT_SHADER,
        this.fragmentShaderSource,
        keywords
      );
      if (this.vertexShader && fragmentShader) {
        program = createProgram(this.vertexShader, fragmentShader);
      } else {
        throw new Error("Vertex or Fragment shader is null");
      }
      this.programs[hash] = program;
    }

    if (program == this.activeProgram) return;

    this.uniforms = getUniforms(program);
    this.activeProgram = program;
  };

  bind = () => {
    gl.useProgram(this.activeProgram);
  };
}

class Program {
  constructor(
    vertexShader: WebGLShader | null,
    fragmentShader: WebGLShader | null
  ) {
    this.uniforms = {};

    if (vertexShader && fragmentShader) {
      this.program = createProgram(vertexShader, fragmentShader);
    } else {
      throw new Error("Vertex or Fragment shader is null");
    }
    this.uniforms = getUniforms(this.program);
  }

  bind = () => {
    gl.useProgram(this.program);
  };
}

function createProgram(vertexShader: WebGLShader, fragmentShader: WebGLShader) {
  let program = gl.createProgram();

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS))
    console.trace(gl.getProgramInfoLog(program));

  return program;
}

function getUniforms(program: WebGLProgram) {
  let uniforms: Record<string, WebGLUniformLocation | null> = {};
  let uniformCount = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);

  for (let i = 0; i < uniformCount; i++) {
    let activeUniform = gl.getActiveUniform(program, i);
    let uniformName = activeUniform ? activeUniform.name : "";
    uniforms[uniformName] = gl.getUniformLocation(program, uniformName);
  }
  return uniforms;
}

function compileShader(type: number, source: string, keywords?: string[]) {
  source = addKeywords(source, keywords);

  const shader = gl.createShader(type);

  if (!shader) {
    throw new Error("Failed to create shader");
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
    console.trace(gl.getShaderInfoLog(shader));

  return shader;
}

function addKeywords(source: string, keywords?: string[]) {
  if (keywords == null) return source;
  let keywordsString = "";
  keywords.forEach((keyword: string) => {
    keywordsString += "#define " + keyword + "\n";
  });
  return keywordsString + source;
}

const baseVertexShader = compileShader(
  gl.VERTEX_SHADER,
  shaders.BASE_VERTEX_SHADER_SOURCE
);
const blurVertexShader = compileShader(
  gl.VERTEX_SHADER,
  shaders.BLUR_VERTEX_SHADER_SOURCE
);
const blurShader = compileShader(
  gl.FRAGMENT_SHADER,
  shaders.BLUR_SHADER_SOURCE
);
const copyShader = compileShader(
  gl.FRAGMENT_SHADER,
  shaders.COPY_SHADER_SOURCE
);
const clearShader = compileShader(
  gl.FRAGMENT_SHADER,
  shaders.CLEAR_SHADER_SOURCE
);
const colorShader = compileShader(
  gl.FRAGMENT_SHADER,
  shaders.COLOR_SHADER_SOURCE
);
const checkerboardShader = compileShader(
  gl.FRAGMENT_SHADER,
  shaders.CHECKERBOARD_SHADER_SOURCE
);
const bloomPrefilterShader = compileShader(
  gl.FRAGMENT_SHADER,
  shaders.BLOOM_PREFILTER_SHADER_SOURCE
);
const bloomBlurShader = compileShader(
  gl.FRAGMENT_SHADER,
  shaders.BLOOM_BLUR_SHADER_SOURCE
);
const bloomFinalShader = compileShader(
  gl.FRAGMENT_SHADER,
  shaders.BLOOM_FINAL_SHADER_SOURCE
);
const sunraysMaskShader = compileShader(
  gl.FRAGMENT_SHADER,
  shaders.SUNRAYS_MASK_SHADER_SOURCE
);
const sunraysShader = compileShader(
  gl.FRAGMENT_SHADER,
  shaders.SUNRAYS_SHADER_SOURCE
);
const splatShader = compileShader(
  gl.FRAGMENT_SHADER,
  shaders.SPLAT_SHADER_SOURCE
);
const advectionShader = compileShader(
  gl.FRAGMENT_SHADER,
  shaders.ADVECTION_SHADER_SOURCE,
  ext.supportLinearFiltering ? undefined : ["MANUAL_FILTERING"]
);
const divergenceShader = compileShader(
  gl.FRAGMENT_SHADER,
  shaders.DIVERGENCE_SHADER_SOURCE
);
const curlShader = compileShader(
  gl.FRAGMENT_SHADER,
  shaders.CURL_SHADER_SOURCE
);
const vorticityShader = compileShader(
  gl.FRAGMENT_SHADER,
  shaders.VORTICITY_SHADER_SOURCE
);
const pressureShader = compileShader(
  gl.FRAGMENT_SHADER,
  shaders.PRESSURE_SHADER_SOURCE
);
const gradientSubtractShader = compileShader(
  gl.FRAGMENT_SHADER,
  shaders.GRADIENT_SUBTRACT_SHADER_SOURCE
);

const blit = (() => {
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]),
    gl.STATIC_DRAW
  );
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(
    gl.ELEMENT_ARRAY_BUFFER,
    new Uint16Array([0, 1, 2, 0, 2, 3]),
    gl.STATIC_DRAW
  );
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(0);

  return (
    target: {
      width: number;
      height: number;
      fbo: WebGLFramebuffer | null;
    } | null,
    clear = false
  ) => {
    if (target == null) {
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    } else {
      gl.viewport(0, 0, target.width, target.height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    }
    if (clear) {
      gl.clearColor(0.0, 0.0, 0.0, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
  };
})();

let dye: {
  texelSizeX: number;
  texelSizeY: number;
  read: any;
  write: any;
  swap: any;
  width: number;
  height: number;
};

let velocity: {
  texelSizeX: number;
  texelSizeY: number;
  read: {
    texture: WebGLTexture;
    fbo: WebGLFramebuffer;
    width: number;
    height: number;
    texelSizeX: number;
    texelSizeY: number;
    attach(id: any): any;
  };
  write: {
    texture: WebGLTexture;
    fbo: WebGLFramebuffer;
    width: number;
    height: number;
    texelSizeX: number;
    texelSizeY: number;
    attach(id: any): any;
  };
  width: number;
  height: number;
  swap: () => void;
};

let divergence: {
  attach: any;
  texture?: WebGLTexture;
  fbo: WebGLFramebuffer;
  width: number;
  height: number;
  texelSizeX: number;
  texelSizeY: number;
};

let curl: {
  attach: any;
  texture?: WebGLTexture;
  fbo: WebGLFramebuffer | null;
  width: number;
  height: number;
  texelSizeX: number;
  texelSizeY: number;
};

let pressure: {
  read: any;
  write: any;
  swap: any;
  width: number;
  height: number;
  texelSizeX: number;
  texelSizeY: number;
};

let bloom: {
  attach: any;
  texture?: WebGLTexture;
  fbo: WebGLFramebuffer;
  width: number;
  height: number;
  texelSizeX: number;
  texelSizeY: number;
};
let bloomFramebuffers: any[] = [];
let sunrays: {
  attach: any;
  texture?: WebGLTexture;
  fbo: WebGLFramebuffer;
  width: number;
  height: number;
  texelSizeX: number;
  texelSizeY: number;
};
let sunraysTemp: {
  texture: WebGLTexture;
  fbo: WebGLFramebuffer;
  width: number;
  height: number;
  texelSizeX: number;
  texelSizeY: number;
  attach(id: any): any;
};

let ditheringTexture = createTextureAsync("LDR_LLL1_0.png");

const blurProgram = new Program(blurVertexShader, blurShader);
const copyProgram = new Program(baseVertexShader, copyShader);
const clearProgram = new Program(baseVertexShader, clearShader);
const colorProgram = new Program(baseVertexShader, colorShader);
const checkerboardProgram = new Program(baseVertexShader, checkerboardShader);
const bloomPrefilterProgram = new Program(
  baseVertexShader,
  bloomPrefilterShader
);
const bloomBlurProgram = new Program(baseVertexShader, bloomBlurShader);
const bloomFinalProgram = new Program(baseVertexShader, bloomFinalShader);
const sunraysMaskProgram = new Program(baseVertexShader, sunraysMaskShader);
const sunraysProgram = new Program(baseVertexShader, sunraysShader);
const splatProgram = new Program(baseVertexShader, splatShader);
const advectionProgram = new Program(baseVertexShader, advectionShader);
const divergenceProgram = new Program(baseVertexShader, divergenceShader);
const curlProgram = new Program(baseVertexShader, curlShader);
const vorticityProgram = new Program(baseVertexShader, vorticityShader);
const pressureProgram = new Program(baseVertexShader, pressureShader);
const gradientSubtractProgram = new Program(
  baseVertexShader,
  gradientSubtractShader
);
const displayMaterial = new Material(
  baseVertexShader,
  shaders.DISPLAY_SHADER_SOURCE
);

function initFramebuffers() {
  let simRes = getResolution(gl, config.SIM_RESOLUTION);
  let dyeRes = getResolution(gl, config.DYE_RESOLUTION);

  const texType = ext.halfFloatTexType;
  const rgba = ext.formatRGBA;
  const rg = ext.formatRG;
  const r = ext.formatR;
  const filtering = ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;

  gl.disable(gl.BLEND);

  if (dye == null) {
    dye = createDoubleFramebuffer(
      dyeRes.width,
      dyeRes.height,
      rgba.internalFormat,
      rgba.format,
      texType,
      filtering
    );
    dye.width = dyeRes.width;
    dye.height = dyeRes.height;
  } else {
    dye = resizeDoubleFBO(
      dye,
      dyeRes.width,
      dyeRes.height,
      rgba.internalFormat,
      rgba.format,
      texType,
      filtering
    );
  }

  if (velocity == null)
    velocity = createDoubleFramebuffer(
      simRes.width,
      simRes.height,
      rg.internalFormat,
      rg.format,
      texType,
      filtering
    );
  else
    velocity = resizeDoubleFBO(
      velocity,
      simRes.width,
      simRes.height,
      rg.internalFormat,
      rg.format,
      texType,
      filtering
    );

  divergence = createFramebuffer(
    simRes.width,
    simRes.height,
    r.internalFormat,
    r.format,
    texType,
    gl.NEAREST
  );
  curl = createFramebuffer(
    simRes.width,
    simRes.height,
    r.internalFormat,
    r.format,
    texType,
    gl.NEAREST
  );
  pressure = createDoubleFramebuffer(
    simRes.width,
    simRes.height,
    r.internalFormat,
    r.format,
    texType,
    gl.NEAREST
  );

  initBloomFramebuffers();
  initSunraysFramebuffers();
}

function initBloomFramebuffers() {
  let res = getResolution(gl, config.BLOOM_RESOLUTION);

  const texType = ext.halfFloatTexType;
  const rgba = ext.formatRGBA;
  const filtering = ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;

  bloom = createFramebuffer(
    res.width,
    res.height,
    rgba.internalFormat,
    rgba.format,
    texType,
    filtering
  );

  bloomFramebuffers.length = 0;
  for (let i = 0; i < config.BLOOM_ITERATIONS; i++) {
    let width = res.width >> (i + 1);
    let height = res.height >> (i + 1);

    if (width < 2 || height < 2) break;

    let fbo = createFramebuffer(
      width,
      height,
      rgba.internalFormat,
      rgba.format,
      texType,
      filtering
    );
    bloomFramebuffers.push(fbo);
  }
}

function initSunraysFramebuffers() {
  let res = getResolution(gl, config.SUNRAYS_RESOLUTION);

  const texType = ext.halfFloatTexType;
  const r = ext.formatR;
  const filtering = ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;

  sunrays = createFramebuffer(
    res.width,
    res.height,
    r.internalFormat,
    r.format,
    texType,
    filtering
  );
  sunraysTemp = createFramebuffer(
    res.width,
    res.height,
    r.internalFormat,
    r.format,
    texType,
    filtering
  );
}

function createFramebuffer(
  w: number,
  h: number,
  internalFormat: number,
  format: number,
  type: number,
  param: number
) {
  gl.activeTexture(gl.TEXTURE0);
  let texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, param);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, param);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);

  let fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    texture,
    0
  );
  gl.viewport(0, 0, w, h);
  gl.clear(gl.COLOR_BUFFER_BIT);

  let texelSizeX = 1.0 / w;
  let texelSizeY = 1.0 / h;

  return {
    texture,
    fbo,
    width: w,
    height: h,
    texelSizeX,
    texelSizeY,
    attach(id: number) {
      gl.activeTexture(gl.TEXTURE0 + id);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      return id;
    },
  };
}

function createDoubleFramebuffer(
  w: number,
  h: number,
  internalFormat: number,
  format: number,
  type: number,
  param: number
) {
  let fbo1 = createFramebuffer(w, h, internalFormat, format, type, param);
  let fbo2 = createFramebuffer(w, h, internalFormat, format, type, param);

  return {
    width: w,
    height: h,
    texelSizeX: fbo1.texelSizeX,
    texelSizeY: fbo1.texelSizeY,
    get read() {
      return fbo1;
    },
    set read(value) {
      fbo1 = value;
    },
    get write() {
      return fbo2;
    },
    set write(value) {
      fbo2 = value;
    },
    swap() {
      let temp = fbo1;
      fbo1 = fbo2;
      fbo2 = temp;
    },
  };
}

function resizeFBO(
  target: { attach: (arg0: number) => number },
  w: number,
  h: number,
  internalFormat: number,
  format: number,
  type: any,
  param: any
) {
  let newFBO = createFramebuffer(w, h, internalFormat, format, type, param);
  copyProgram.bind();
  gl.uniform1i(copyProgram.uniforms.uTexture, target.attach(0));
  blit(newFBO);
  return newFBO;
}

function resizeDoubleFBO(
  target: {
    width: number;
    height: number;
    read: {
      texture: WebGLTexture;
      fbo: WebGLFramebuffer;
      width: number;
      height: number;
      texelSizeX: number;
      texelSizeY: number;
      attach(id: any): any;
    };
    write: {
      texture: WebGLTexture;
      fbo: WebGLFramebuffer;
      width: number;
      height: number;
      texelSizeX: number;
      texelSizeY: number;
      attach(id: any): any;
    };
    texelSizeX: number;
    texelSizeY: number;
    swap: () => void;
  },
  w: number,
  h: number,
  internalFormat: number,
  format: number,
  type: number,
  param: number
) {
  if (target.width == w && target.height == h) return target;
  target.read = resizeFBO(
    target.read,
    w,
    h,
    internalFormat,
    format,
    type,
    param
  );
  target.write = createFramebuffer(w, h, internalFormat, format, type, param);
  target.width = w;
  target.height = h;
  target.texelSizeX = 1.0 / w;
  target.texelSizeY = 1.0 / h;
  target.swap = () => {
    let temp = target.read;
    target.read = target.write;
    target.write = temp;
  };
  return target;
}

function createTextureAsync(url: string) {
  let texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGB,
    1,
    1,
    0,
    gl.RGB,
    gl.UNSIGNED_BYTE,
    new Uint8Array([255, 255, 255])
  );

  let obj = {
    texture,
    width: 1,
    height: 1,
    attach(id: number) {
      gl.activeTexture(gl.TEXTURE0 + id);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      return id;
    },
  };

  let image = new Image();
  image.onload = () => {
    obj.width = image.width;
    obj.height = image.height;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
  };
  image.src = url;

  return obj;
}

function updateKeywords() {
  let displayKeywords = [];
  if (config.SHADING) displayKeywords.push("SHADING");
  if (config.BLOOM) displayKeywords.push("BLOOM");
  if (config.SUNRAYS) displayKeywords.push("SUNRAYS");
  displayMaterial.setKeywords(displayKeywords);
}

updateKeywords();
initFramebuffers();
multipleSplats(Math.random() * 20 + 5);

let lastUpdateTime = Date.now();
let colorUpdateTimer = 0.0;
update();

function update() {
  const dt = calcDeltaTime();
  if (resizeCanvas()) initFramebuffers();
  updateColors(dt);
  applyInputs();
  if (!config.PAUSED) step(dt);
  render(null);
  requestAnimationFrame(update);
}

function calcDeltaTime() {
  let now = Date.now();
  let dt = (now - lastUpdateTime) / 1000;
  dt = Math.min(dt, 0.016666);
  lastUpdateTime = now;
  return dt;
}

function resizeCanvas() {
  let width = scaleByPixelRatio(canvas.clientWidth);
  let height = scaleByPixelRatio(canvas.clientHeight);
  if (canvas.width != width || canvas.height != height) {
    canvas.width = width;
    canvas.height = height;
    return true;
  }
  return false;
}

function updateColors(dt: number) {
  if (!config.COLORFUL) return;

  colorUpdateTimer += dt * config.COLOR_UPDATE_SPEED;
  if (colorUpdateTimer >= 1) {
    colorUpdateTimer = wrap(colorUpdateTimer, 0, 1);
    pointers.forEach((p) => {
      p.color = generateColor();
    });
  }
}

function applyInputs() {
  if (splatStack.length > 0) multipleSplats(splatStack.pop() ?? 0);

  pointers.forEach((p) => {
    if (p.moved) {
      p.moved = false;
      splatPointer(p);
    }
  });
}

function step(dt: number) {
  gl.disable(gl.BLEND);

  curlProgram.bind();
  gl.uniform2f(
    curlProgram.uniforms.texelSize,
    velocity.texelSizeX,
    velocity.texelSizeY
  );
  gl.uniform1i(curlProgram.uniforms.uVelocity, velocity.read.attach(0));
  if (curl.width && curl.height && curl.fbo) {
    blit(curl);
  } else {
    console.error("Curl framebuffer is not properly initialized.");
  }

  vorticityProgram.bind();
  gl.uniform2f(
    vorticityProgram.uniforms.texelSize,
    velocity.texelSizeX,
    velocity.texelSizeY
  );
  gl.uniform1i(vorticityProgram.uniforms.uVelocity, velocity.read.attach(0));
  gl.uniform1i(vorticityProgram.uniforms.uCurl, curl.attach(1));
  gl.uniform1f(vorticityProgram.uniforms.curl, config.CURL);
  gl.uniform1f(vorticityProgram.uniforms.dt, dt);
  blit(velocity.write);
  velocity.swap();

  divergenceProgram.bind();
  gl.uniform2f(
    divergenceProgram.uniforms.texelSize,
    velocity.texelSizeX,
    velocity.texelSizeY
  );
  gl.uniform1i(divergenceProgram.uniforms.uVelocity, velocity.read.attach(0));
  blit(divergence);

  clearProgram.bind();
  gl.uniform1i(clearProgram.uniforms.uTexture, pressure.read.attach(0));
  gl.uniform1f(clearProgram.uniforms.value, config.PRESSURE);
  blit(pressure.write);
  pressure.swap();

  pressureProgram.bind();
  gl.uniform2f(
    pressureProgram.uniforms.texelSize,
    velocity.texelSizeX,
    velocity.texelSizeY
  );
  gl.uniform1i(pressureProgram.uniforms.uDivergence, divergence.attach(0));
  for (let i = 0; i < config.PRESSURE_ITERATIONS; i++) {
    gl.uniform1i(pressureProgram.uniforms.uPressure, pressure.read.attach(1));
    blit(pressure.write);
    pressure.swap();
  }

  gradientSubtractProgram.bind();
  gl.uniform2f(
    gradientSubtractProgram.uniforms.texelSize,
    velocity.texelSizeX,
    velocity.texelSizeY
  );
  gl.uniform1i(
    gradientSubtractProgram.uniforms.uPressure,
    pressure.read.attach(0)
  );
  gl.uniform1i(
    gradientSubtractProgram.uniforms.uVelocity,
    velocity.read.attach(1)
  );
  blit(velocity.write);
  velocity.swap();

  advectionProgram.bind();
  gl.uniform2f(
    advectionProgram.uniforms.texelSize,
    velocity.texelSizeX,
    velocity.texelSizeY
  );
  if (!ext.supportLinearFiltering)
    gl.uniform2f(
      advectionProgram.uniforms.dyeTexelSize,
      velocity.texelSizeX,
      velocity.texelSizeY
    );
  let velocityId = velocity.read.attach(0);
  gl.uniform1i(advectionProgram.uniforms.uVelocity, velocityId);
  gl.uniform1i(advectionProgram.uniforms.uSource, velocityId);
  gl.uniform1f(advectionProgram.uniforms.dt, dt);
  gl.uniform1f(
    advectionProgram.uniforms.dissipation,
    config.VELOCITY_DISSIPATION
  );
  blit(velocity.write);
  velocity.swap();

  if (!ext.supportLinearFiltering)
    gl.uniform2f(
      advectionProgram.uniforms.dyeTexelSize,
      dye.texelSizeX,
      dye.texelSizeY
    );
  gl.uniform1i(advectionProgram.uniforms.uVelocity, velocity.read.attach(0));
  gl.uniform1i(advectionProgram.uniforms.uSource, dye.read.attach(1));
  gl.uniform1f(
    advectionProgram.uniforms.dissipation,
    config.DENSITY_DISSIPATION
  );
  blit(dye.write);
  dye.swap();
}

function render(
  target: {
    texture: WebGLTexture;
    fbo: WebGLFramebuffer;
    width: number;
    height: number;
    texelSizeX: number;
    texelSizeY: number;
    attach(id: any): any;
  } | null
) {
  if (config.BLOOM) applyBloom(dye.read, bloom);
  if (config.SUNRAYS) {
    applySunrays(dye.read, dye.write, sunrays);
    blur(sunrays, sunraysTemp, 1);
  }
  if (target == null || !config.TRANSPARENT) {
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.BLEND);
  } else {
    gl.disable(gl.BLEND);
  }

  if (!config.TRANSPARENT) drawColor(target, normalizeColor(config.BACK_COLOR));
  if (target == null && config.TRANSPARENT) drawCheckerboard(target);
  drawDisplay(target);
}

function drawColor(target: any, color: ColorFormats.RGB) {
  colorProgram.bind();
  gl.uniform4f(colorProgram.uniforms.color, color.r, color.g, color.b, 1);
  blit(target);
}

function drawCheckerboard(target: any) {
  checkerboardProgram.bind();
  gl.uniform1f(
    checkerboardProgram.uniforms.aspectRatio,
    canvas.width / canvas.height
  );
  blit(target);
}

function drawDisplay(
  target: { width: number; height: number; fbo: WebGLFramebuffer } | null
) {
  let width = target == null ? gl.drawingBufferWidth : target.width;
  let height = target == null ? gl.drawingBufferHeight : target.height;

  displayMaterial.bind();
  if (config.SHADING)
    gl.uniform2f(displayMaterial.uniforms.texelSize, 1.0 / width, 1.0 / height);
  gl.uniform1i(displayMaterial.uniforms.uTexture, dye.read.attach(0));
  if (config.BLOOM) {
    gl.uniform1i(displayMaterial.uniforms.uBloom, bloom.attach(1));
    gl.uniform1i(
      displayMaterial.uniforms.uDithering,
      ditheringTexture.attach(2)
    );
    let scale = getTextureScale(ditheringTexture, width, height);
    gl.uniform2f(displayMaterial.uniforms.ditherScale, scale.x, scale.y);
  }
  if (config.SUNRAYS)
    gl.uniform1i(displayMaterial.uniforms.uSunrays, sunrays.attach(3));

  blit(target);
}

function applyBloom(
  source: { attach: (arg0: number) => number },
  destination: any
) {
  if (bloomFramebuffers.length < 2) return;

  let last = destination;

  gl.disable(gl.BLEND);
  bloomPrefilterProgram.bind();
  let knee = config.BLOOM_THRESHOLD * config.BLOOM_SOFT_KNEE + 0.0001;
  let curve0 = config.BLOOM_THRESHOLD - knee;
  let curve1 = knee * 2;
  let curve2 = 0.25 / knee;
  gl.uniform3f(bloomPrefilterProgram.uniforms.curve, curve0, curve1, curve2);
  gl.uniform1f(
    bloomPrefilterProgram.uniforms.threshold,
    config.BLOOM_THRESHOLD
  );
  gl.uniform1i(bloomPrefilterProgram.uniforms.uTexture, source.attach(0));
  blit(last);

  bloomBlurProgram.bind();
  for (let i = 0; i < bloomFramebuffers.length; i++) {
    let dest = bloomFramebuffers[i];
    gl.uniform2f(
      bloomBlurProgram.uniforms.texelSize,
      last.texelSizeX,
      last.texelSizeY
    );
    gl.uniform1i(bloomBlurProgram.uniforms.uTexture, last.attach(0));
    blit(dest);
    last = dest;
  }

  gl.blendFunc(gl.ONE, gl.ONE);
  gl.enable(gl.BLEND);

  for (let i = bloomFramebuffers.length - 2; i >= 0; i--) {
    let baseTex = bloomFramebuffers[i];
    gl.uniform2f(
      bloomBlurProgram.uniforms.texelSize,
      last.texelSizeX,
      last.texelSizeY
    );
    gl.uniform1i(bloomBlurProgram.uniforms.uTexture, last.attach(0));
    gl.viewport(0, 0, baseTex.width, baseTex.height);
    blit(baseTex);
    last = baseTex;
  }

  gl.disable(gl.BLEND);
  bloomFinalProgram.bind();
  gl.uniform2f(
    bloomFinalProgram.uniforms.texelSize,
    last.texelSizeX,
    last.texelSizeY
  );
  gl.uniform1i(bloomFinalProgram.uniforms.uTexture, last.attach(0));
  gl.uniform1f(bloomFinalProgram.uniforms.intensity, config.BLOOM_INTENSITY);
  blit(destination);
}

function applySunrays(
  source: { attach: (arg0: number) => number },
  mask: { attach: (arg0: number) => number },
  destination: any
) {
  gl.disable(gl.BLEND);
  sunraysMaskProgram.bind();
  gl.uniform1i(sunraysMaskProgram.uniforms.uTexture, source.attach(0));
  blit(mask);

  sunraysProgram.bind();
  gl.uniform1f(sunraysProgram.uniforms.weight, config.SUNRAYS_WEIGHT);
  gl.uniform1i(sunraysProgram.uniforms.uTexture, mask.attach(0));
  blit(destination);
}

interface BlurTarget {
  texelSizeX: number;
  texelSizeY: number;
  attach: (id: number) => number;
}

interface BlurTemp {
  texelSizeX: number;
  texelSizeY: number;
  attach: (id: number) => number;
}

function blur(target: BlurTarget, temp: BlurTemp, iterations: number): void {
  blurProgram.bind();

  for (let i = 0; i < iterations; i++) {
    gl.uniform2f(blurProgram.uniforms.texelSize, target.texelSizeX, 0.0);
    gl.uniform1i(blurProgram.uniforms.uTexture, target.attach(0));
    blit(temp);

    gl.uniform2f(blurProgram.uniforms.texelSize, 0.0, target.texelSizeY);
    gl.uniform1i(blurProgram.uniforms.uTexture, temp.attach(0));
    blit(target);
  }
}

function splatPointer(pointer: Pointer) {
  let dx = pointer.deltaX * config.SPLAT_FORCE;
  let dy = pointer.deltaY * config.SPLAT_FORCE;
  splat(pointer.texcoordX, pointer.texcoordY, dx, dy, pointer.color);
}

function multipleSplats(amount: number) {
  for (let i = 0; i < amount; i++) {
    const color = generateColor();
    color.r *= 10.0;
    color.g *= 10.0;
    color.b *= 10.0;
    const x = Math.random();
    const y = Math.random();
    const dx = 1000 * (Math.random() - 0.5);
    const dy = 1000 * (Math.random() - 0.5);
    splat(x, y, dx, dy, color);
  }
}

function splat(
  x: number,
  y: number,
  dx: number,
  dy: number,
  color: ColorFormats.RGB
) {
  splatProgram.bind();

  gl.uniform1i(splatProgram.uniforms.uTarget, velocity.read.attach(0));
  gl.uniform1f(splatProgram.uniforms.aspectRatio, canvas.width / canvas.height);
  gl.uniform2f(splatProgram.uniforms.point, x, y);
  gl.uniform3f(splatProgram.uniforms.color, dx, dy, 0.0);
  gl.uniform1f(
    splatProgram.uniforms.radius,
    correctRadius(config.SPLAT_RADIUS / 100.0)
  );
  blit(velocity.write);
  velocity.swap();

  gl.uniform1i(splatProgram.uniforms.uTarget, dye.read.attach(0));
  gl.uniform3f(splatProgram.uniforms.color, color.r, color.g, color.b);
  blit(dye.write);
  dye.swap();
}

function correctRadius(radius: number) {
  let aspectRatio = canvas.width / canvas.height;
  if (aspectRatio > 1) radius *= aspectRatio;
  return radius;
}

canvas.addEventListener("mousedown", (e) => {
  let posX = scaleByPixelRatio(e.offsetX);
  let posY = scaleByPixelRatio(e.offsetY);
  let pointer = pointers.find((p) => p.id == -1);
  if (pointer == null) pointer = new PointerPrototype();

  updatePointerDownData(canvas, pointer, -1, posX, posY);
});

canvas.addEventListener("mousemove", (e) => {
  let pointer = pointers[0];
  if (!pointer.down) return;
  let posX = scaleByPixelRatio(e.offsetX);
  let posY = scaleByPixelRatio(e.offsetY);
  updatePointerMoveData(canvas, pointer, posX, posY);
});

window.addEventListener("mouseup", () => {
  updatePointerUpData(pointers[0]);
});

canvas.addEventListener("touchstart", (e) => {
  e.preventDefault();
  const touches = e.targetTouches;
  while (touches.length >= pointers.length)
    pointers.push(new PointerPrototype());
  for (let i = 0; i < touches.length; i++) {
    let posX = scaleByPixelRatio(touches[i].pageX);
    let posY = scaleByPixelRatio(touches[i].pageY);
    updatePointerDownData(
      canvas,
      pointers[i + 1],
      touches[i].identifier,
      posX,
      posY
    );
  }
});

canvas.addEventListener(
  "touchmove",
  (e) => {
    e.preventDefault();
    const touches = e.targetTouches;
    for (let i = 0; i < touches.length; i++) {
      let pointer = pointers[i + 1];
      if (!pointer.down) continue;
      let posX = scaleByPixelRatio(touches[i].pageX);
      let posY = scaleByPixelRatio(touches[i].pageY);
      updatePointerMoveData(canvas, pointer, posX, posY);
    }
  },
  false
);

window.addEventListener("touchend", (e) => {
  const touches = e.changedTouches;
  for (let i = 0; i < touches.length; i++) {
    let pointer = pointers.find((p) => p.id == touches[i].identifier);
    if (pointer == null) continue;
    updatePointerUpData(pointer);
  }
});

window.addEventListener("keydown", (e) => {
  if (e.code === "KeyP") config.PAUSED = !config.PAUSED;
  if (e.key === "Spacebar" || e.key === " ") splatStack.push(config.SPLATS);
});
