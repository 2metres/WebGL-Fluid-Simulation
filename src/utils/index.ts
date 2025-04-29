import { Pointer } from "../types";

export * from "./drawHalftoneWave";

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

export function generateColor(): { r: number; g: number; b: number } {
  const c = HSVtoRGB(Math.random(), 1.0, 1.0);
  c.r *= 0.15;
  c.g *= 0.15;
  c.b *= 0.15;
  return c;
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

export function wrap(value: number, min: number, max: number): number {
  const range = max - min;
  if (range === 0) return min;
  return ((value - min) % range) + min;
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

export function scaleByPixelRatio(input: number): number {
  const pixelRatio = window.devicePixelRatio || 1;
  return Math.floor(input * pixelRatio);
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
