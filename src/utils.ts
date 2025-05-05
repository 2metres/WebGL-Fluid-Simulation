import { Config, Format } from "./types";
import {
  ADVECTION_SHADER_SOURCE,
  BASE_VERTEX_SHADER_SOURCE,
  BLOOM_BLUR_SHADER_SOURCE,
  BLOOM_FINAL_SHADER_SOURCE,
  BLOOM_PREFILTER_SHADER_SOURCE,
  BLUR_SHADER_SOURCE,
  BLUR_VERTEX_SHADER_SOURCE,
  CHECKERBOARD_SHADER_SOURCE,
  CLEAR_SHADER_SOURCE,
  COLOR_SHADER_SOURCE,
  COPY_SHADER_SOURCE,
  CURL_SHADER_SOURCE,
  DIVERGENCE_SHADER_SOURCE,
  GRADIENT_SUBTRACT_SHADER_SOURCE,
  PRESSURE_SHADER_SOURCE,
  SPLAT_SHADER_SOURCE,
  SUNRAYS_MASK_SHADER_SOURCE,
  SUNRAYS_SHADER_SOURCE,
  VORTICITY_SHADER_SOURCE,
} from "./shaders";
import { Pointer } from "./Pointer";
import { Program } from "./Program";
import { Material } from "./Material";

export function addKeywords(source: string, keywords?: string[]) {
  if (keywords == null) return source;
  let keywordsString = "";
  keywords.forEach((keyword: string) => {
    keywordsString += "#define " + keyword + "\n";
  });
  return keywordsString + source;
}

export function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
  keywords?: string[]
): WebGLShader {
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

const VERTEX_SHADER = 0x8b31;
const FRAGMENT_SHADER = 0x8b30;

const SHADERS: Array<[name: string, source: string, type: number]> = [
  ["baseVertex", BASE_VERTEX_SHADER_SOURCE, VERTEX_SHADER],
  ["blurVertex", BLUR_VERTEX_SHADER_SOURCE, VERTEX_SHADER],
  ["blur", BLUR_SHADER_SOURCE, FRAGMENT_SHADER],
  ["copy", COPY_SHADER_SOURCE, FRAGMENT_SHADER],
  ["clear", CLEAR_SHADER_SOURCE, FRAGMENT_SHADER],
  ["color", COLOR_SHADER_SOURCE, FRAGMENT_SHADER],
  ["checkerboard", CHECKERBOARD_SHADER_SOURCE, FRAGMENT_SHADER],
  ["bloomPrefilter", BLOOM_PREFILTER_SHADER_SOURCE, FRAGMENT_SHADER],
  ["bloomBlur", BLOOM_BLUR_SHADER_SOURCE, FRAGMENT_SHADER],
  ["bloomFinal", BLOOM_FINAL_SHADER_SOURCE, FRAGMENT_SHADER],
  ["sunraysMask", SUNRAYS_MASK_SHADER_SOURCE, FRAGMENT_SHADER],
  ["sunrays", SUNRAYS_SHADER_SOURCE, FRAGMENT_SHADER],
  ["splat", SPLAT_SHADER_SOURCE, FRAGMENT_SHADER],
  ["advection", ADVECTION_SHADER_SOURCE, FRAGMENT_SHADER],
  ["divergence", DIVERGENCE_SHADER_SOURCE, FRAGMENT_SHADER],
  ["curl", CURL_SHADER_SOURCE, FRAGMENT_SHADER],
  ["vorticity", VORTICITY_SHADER_SOURCE, FRAGMENT_SHADER],
  ["pressure", PRESSURE_SHADER_SOURCE, FRAGMENT_SHADER],
  ["gradientSubtract", GRADIENT_SUBTRACT_SHADER_SOURCE, FRAGMENT_SHADER],
];

export function compileShaders(
  gl: WebGL2RenderingContext
): Record<string, WebGLShader> {
  const compiledShaders: Record<string, WebGLShader> = {};

  SHADERS.forEach(([name, source, type]) => {
    compiledShaders[`${name}Shader`] = compileShader(gl, type, source);
  });

  return compiledShaders;
}

export function createPrograms(
  gl: WebGL2RenderingContext,
  programs: Array<[string, WebGLShader, WebGLShader]>
): Record<string, Program> {
  const compiledPrograms: Record<string, Program> = {};

  programs.forEach(([name, vertex, fragment]) => {
    compiledPrograms[`${name}Program`] = new Program(gl, vertex, fragment);
  });

  return compiledPrograms;
}

export function updateKeywords(config: Config, displayMaterial: Material) {
  let displayKeywords = [];
  if (config.SHADING) displayKeywords.push("SHADING");
  if (config.BLOOM) displayKeywords.push("BLOOM");
  if (config.SUNRAYS) displayKeywords.push("SUNRAYS");
  displayMaterial.setKeywords(displayKeywords);
}

export function calcDeltaTime(lastUpdateTime: number): number {
  let now = Date.now();
  let dt = (now - lastUpdateTime) / 1000;
  dt = Math.min(dt, 0.016666);
  lastUpdateTime = now;
  return dt;
}

export function correctDeltaX(
  canvas: HTMLCanvasElement,
  delta: number
): number {
  const aspectRatio = canvas.width / canvas.height;
  if (aspectRatio < 1) delta *= aspectRatio;
  return delta;
}

export function correctDeltaY(
  canvas: HTMLCanvasElement,
  delta: number
): number {
  const aspectRatio = canvas.width / canvas.height;
  if (aspectRatio > 1) delta /= aspectRatio;
  return delta;
}

export function createDoubleFramebuffer(
  gl: WebGL2RenderingContext,
  w: number,
  h: number,
  internalFormat: number,
  format: number,
  type: number,
  param: number
) {
  let fbo1 = createFramebuffer(gl, w, h, internalFormat, format, type, param);
  let fbo2 = createFramebuffer(gl, w, h, internalFormat, format, type, param);

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

export function createFramebuffer(
  gl: WebGL2RenderingContext,
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

export const drawHalftoneWave = (canvas: HTMLCanvasElement, time: number) => {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const gridSize = 20;
  const rows = Math.ceil(canvas.height / gridSize);
  const cols = Math.ceil(canvas.width / gridSize);

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const centerX = x * gridSize;
      const centerY = y * gridSize;
      const distanceFromCenter = Math.sqrt(
        Math.pow(centerX - canvas.width / 2, 2) +
          Math.pow(centerY - canvas.height / 2, 2)
      );
      const maxDistance = Math.sqrt(
        Math.pow(canvas.width / 2, 2) + Math.pow(canvas.height / 2, 2)
      );
      const normalizedDistance = distanceFromCenter / maxDistance;

      const waveOffset = Math.sin(normalizedDistance * 10 - time) * 0.5 + 0.5;
      const size = gridSize * waveOffset * 0.8;

      ctx.beginPath();
      ctx.arc(centerX, centerY, size / 2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${waveOffset * 0.5})`;
      ctx.fill();
    }
  }
};

export function generateColor(): { r: number; g: number; b: number } {
  const c = HSVtoRGB(Math.random(), 1.0, 1.0);
  c.r *= 0.15;
  c.g *= 0.15;
  c.b *= 0.15;
  return c;
}

export function getResolution(
  gl: WebGLRenderingContext,
  resolution: number
): {
  width: number;
  height: number;
} {
  let aspectRatio = gl.drawingBufferWidth / gl.drawingBufferHeight;
  if (aspectRatio < 1) aspectRatio = 1.0 / aspectRatio;

  const min = Math.round(resolution);
  const max = Math.round(resolution * aspectRatio);

  if (gl.drawingBufferWidth > gl.drawingBufferHeight) {
    return { width: max, height: min };
  } else {
    return { width: min, height: max };
  }
}

export function getTextureScale(
  texture: { width: number; height: number },
  width: number,
  height: number
): { x: number; y: number } {
  return {
    x: width / texture.width,
    y: height / texture.height,
  };
}

export function hashCode(s: string): number {
  if (s.length === 0) return 0;
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash << 5) - hash + s.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }
  return hash;
}

export function correctRadius(canvas: HTMLCanvasElement, radius: number) {
  let aspectRatio = canvas.width / canvas.height;
  if (aspectRatio > 1) radius *= aspectRatio;
  return radius;
}

export function HSVtoRGB(
  h: number,
  s: number,
  v: number
): { r: number; g: number; b: number } {
  let r: number = 0;
  let g: number = 0;
  let b: number = 0;
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);

  switch (i % 6) {
    case 0:
      (r = v), (g = t), (b = p);
      break;
    case 1:
      (r = q), (g = v), (b = p);
      break;
    case 2:
      (r = p), (g = v), (b = t);
      break;
    case 3:
      (r = p), (g = q), (b = v);
      break;
    case 4:
      (r = t), (g = p), (b = v);
      break;
    case 5:
      (r = v), (g = p), (b = q);
      break;
  }

  return { r, g, b };
}

export function normalizeColor(input: { r: number; g: number; b: number }): {
  r: number;
  g: number;
  b: number;
} {
  return {
    r: input.r / 255,
    g: input.g / 255,
    b: input.b / 255,
  };
}

export function getSupportedFormat(
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

export function supportRenderTextureFormat(
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

export function createProgram(
  gl: WebGL2RenderingContext,
  vertexShader: WebGLShader,
  fragmentShader: WebGLShader
) {
  let program = gl.createProgram();

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS))
    console.trace(gl.getProgramInfoLog(program));

  return program;
}

export function getUniforms(gl: WebGL2RenderingContext, program: WebGLProgram) {
  let uniforms: Record<string, WebGLUniformLocation | null> = {};
  let uniformCount = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);

  for (let i = 0; i < uniformCount; i++) {
    let activeUniform = gl.getActiveUniform(program, i);
    let uniformName = activeUniform ? activeUniform.name : "";
    uniforms[uniformName] = gl.getUniformLocation(program, uniformName);
  }
  return uniforms;
}

export function createBlit(gl: WebGL2RenderingContext) {
  // Create and set up the vertex buffer
  const vertexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]),
    gl.STATIC_DRAW
  );

  // Create and set up the element buffer
  const indexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(
    gl.ELEMENT_ARRAY_BUFFER,
    new Uint16Array([0, 1, 2, 0, 2, 3]),
    gl.STATIC_DRAW
  );

  // Enable vertex attribute
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(0);

  // Return the blit function
  return (
    target: {
      width: number;
      height: number;
      fbo: WebGLFramebuffer | null;
    } | null,
    clear = false
  ) => {
    // Set the appropriate framebuffer and viewport
    if (target == null) {
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    } else {
      gl.viewport(0, 0, target.width, target.height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    }

    // Clear if needed
    if (clear) {
      gl.clearColor(0.0, 0.0, 0.0, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }

    // Draw the quad
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
  };
}

export function createTextureAsync(gl: WebGL2RenderingContext, url: string) {
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

export function resizeCanvas(canvas: HTMLCanvasElement) {
  let width = scaleByPixelRatio(canvas.clientWidth);
  let height = scaleByPixelRatio(canvas.clientHeight);

  if (canvas.width != width || canvas.height != height) {
    canvas.width = width;
    canvas.height = height;
    return true;
  }
  return false;
}

export function scaleByPixelRatio(input: number): number {
  const pixelRatio = window.devicePixelRatio || 1;
  return Math.floor(input * pixelRatio);
}

export function updateColors(
  gl: WebGL2RenderingContext,
  config: Config,
  dt: number,
  colorUpdateTimer: number,
  pointers: Pointer[]
) {
  if (!config.COLORFUL) return;

  colorUpdateTimer += dt * config.COLOR_UPDATE_SPEED;
  if (colorUpdateTimer >= 1) {
    colorUpdateTimer = wrap(colorUpdateTimer, 0, 1);
    pointers.forEach((p) => {
      p.color = generateColor();
    });
  }
}

export function updatePointerDownData(
  canvas: HTMLCanvasElement,
  pointer: Pointer,
  id: number,
  posX: number,
  posY: number
): void {
  pointer.id = id;
  pointer.down = true;
  pointer.moved = false;
  pointer.texcoordX = posX / canvas.width;
  pointer.texcoordY = 1.0 - posY / canvas.height;
  pointer.prevTexcoordX = pointer.texcoordX;
  pointer.prevTexcoordY = pointer.texcoordY;
  pointer.deltaX = 0;
  pointer.deltaY = 0;
  pointer.color = generateColor();
}

export function updatePointerMoveData(
  canvas: HTMLCanvasElement,
  pointer: Pointer,
  posX: number,
  posY: number
): void {
  pointer.prevTexcoordX = pointer.texcoordX;
  pointer.prevTexcoordY = pointer.texcoordY;
  pointer.texcoordX = posX / canvas.width;
  pointer.texcoordY = 1.0 - posY / canvas.height;
  pointer.deltaX = correctDeltaX(
    canvas,
    pointer.texcoordX - pointer.prevTexcoordX
  );
  pointer.deltaY = correctDeltaY(
    canvas,
    pointer.texcoordY - pointer.prevTexcoordY
  );
  pointer.moved = Math.abs(pointer.deltaX) > 0 || Math.abs(pointer.deltaY) > 0;
}

export function updatePointerUpData(pointer: Pointer): void {
  pointer.down = false;
}

export function wrap(value: number, min: number, max: number): number {
  const range = max - min;
  if (range === 0) return min;
  return ((value - min) % range) + min;
}
