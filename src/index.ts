"use strict";

import { GUI } from "dat.gui";
import { ColorFormats } from "tinycolor2";

import { configStore } from "./config";
import {
  BlurTarget,
  BlurTemp,
  DoubleFramebuffer,
  Framebuffer,
  WebGLContext,
} from "./types";
import {
  calcDeltaTime,
  compileShaders,
  correctRadius,
  createBlit,
  createDoubleFramebuffer,
  createFramebuffer,
  createPrograms,
  createTextureAsync,
  generateColor,
  getResolution,
  getSupportedFormat,
  getTextureScale,
  normalizeColor,
  resizeCanvas,
  scaleByPixelRatio,
  updateColors,
  updatePointerDownData,
  updatePointerMoveData,
  updatePointerUpData,
} from "./utils";
import { initializeMidiController } from "./midi";
import { DISPLAY_SHADER_SOURCE } from "./shaders";
import { Pointer, PointerPrototype } from "./Pointer";
import { Material } from "./Material";

const canvas = document.getElementsByTagName("canvas")[0];

document.addEventListener("DOMContentLoaded", init);

const pointers: Pointer[] = [];
const splatStack: number[] = [];

async function init() {
  document.removeEventListener("DOMContentLoaded", init);

  const midi = initializeMidiController();

  console.log({ midi });

  console.log("Initializing visualizer...");

  const config = configStore.getInitialState();

  resizeCanvas(canvas);

  pointers.push(new PointerPrototype());

  const { gl, ext } = getWebGLContext(canvas);

  function isMobile() {
    return /Mobi|Android/i.test(navigator.userAgent);
  }

  if (isMobile()) {
    config.DYE_RESOLUTION = 512;
  }

  let autoSplatInterval: number | undefined;

  function autoSplat(bpm: number = 0) {
    if (bpm === 0 || config.PAUSED) {
      if (autoSplatInterval !== undefined) {
        clearInterval(autoSplatInterval);
        autoSplatInterval = undefined;
      }
      return;
    }
    if (bpm > 0) {
      autoSplatInterval = window.setTimeout(() => {
        splatStack.push(config.SPLATS);
        autoSplat(bpm);
      }, 60000 / config.BPM);
    }
  }

  function startGUI() {
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

    gui
      .add(config, "SUNRAYS")
      .name("sunrays enabled")
      .onFinishChange(updateKeywords);
    gui.add(config, "SUNRAYS_WEIGHT", 0.3, 1.0).name("sunrays weight");

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

    gl.getExtension("EXT_color_buffer_float");
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
      },
    };
  }

  const blit = createBlit(gl);

  let dye: DoubleFramebuffer;
  let velocity: DoubleFramebuffer;
  let divergence: Framebuffer;
  let curl: Framebuffer;
  let pressure: DoubleFramebuffer;
  let bloom: Framebuffer;
  let bloomFramebuffers: Framebuffer[] = [];
  let sunrays: Framebuffer;
  let sunraysTemp: Framebuffer;

  let ditheringTexture = createTextureAsync(gl, "LDR_LLL1_0.png");

  const {
    baseVertexShader,
    blurVertexShader,
    blurShader,
    copyShader,
    clearShader,
    colorShader,
    checkerboardShader,
    bloomPrefilterShader,
    bloomBlurShader,
    bloomFinalShader,
    sunraysMaskShader,
    sunraysShader,
    splatShader,
    advectionShader,
    divergenceShader,
    curlShader,
    vorticityShader,
    pressureShader,
    gradientSubtractShader,
  } = compileShaders(gl);

  const {
    blurProgram,
    copyProgram,
    clearProgram,
    colorProgram,
    checkerboardProgram,
    bloomPrefilterProgram,
    bloomBlurProgram,
    bloomFinalProgram,
    sunraysMaskProgram,
    sunraysProgram,
    splatProgram,
    advectionProgram,
    divergenceProgram,
    curlProgram,
    vorticityProgram,
    pressureProgram,
    gradientSubtractProgram,
  } = createPrograms(gl, [
    ["blur", blurVertexShader, blurShader],
    ["copy", baseVertexShader, copyShader],
    ["clear", baseVertexShader, clearShader],
    ["color", baseVertexShader, colorShader],
    ["checkerboard", baseVertexShader, checkerboardShader],
    ["bloomPrefilter", baseVertexShader, bloomPrefilterShader],
    ["bloomBlur", baseVertexShader, bloomBlurShader],
    ["bloomFinal", baseVertexShader, bloomFinalShader],
    ["sunraysMask", baseVertexShader, sunraysMaskShader],
    ["sunrays", baseVertexShader, sunraysShader],
    ["splat", baseVertexShader, splatShader],
    ["advection", baseVertexShader, advectionShader],
    ["divergence", baseVertexShader, divergenceShader],
    ["curl", baseVertexShader, curlShader],
    ["vorticity", baseVertexShader, vorticityShader],
    ["pressure", baseVertexShader, pressureShader],
    ["gradientSubtract", baseVertexShader, gradientSubtractShader],
  ]);

  const displayMaterial = new Material(
    gl,
    baseVertexShader,
    DISPLAY_SHADER_SOURCE
  );

  function initFramebuffers({ gl, ext }: WebGLContext) {
    let simRes = getResolution(gl, config.SIM_RESOLUTION);
    let dyeRes = getResolution(gl, config.DYE_RESOLUTION);

    const texType = ext.halfFloatTexType;
    const rgba = ext.formatRGBA;
    const rg = ext.formatRG;
    const r = ext.formatR;
    const filtering = gl.LINEAR;

    gl.disable(gl.BLEND);

    if (dye == null) {
      dye = createDoubleFramebuffer(
        gl,
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
        gl,
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
        gl,
        simRes.width,
        simRes.height,
        rg.internalFormat,
        rg.format,
        texType,
        filtering
      );
    else
      velocity = resizeDoubleFBO(
        gl,
        velocity,
        simRes.width,
        simRes.height,
        rg.internalFormat,
        rg.format,
        texType,
        filtering
      );

    divergence = createFramebuffer(
      gl,
      simRes.width,
      simRes.height,
      r.internalFormat,
      r.format,
      texType,
      gl.NEAREST
    );
    curl = createFramebuffer(
      gl,
      simRes.width,
      simRes.height,
      r.internalFormat,
      r.format,
      texType,
      gl.NEAREST
    );
    pressure = createDoubleFramebuffer(
      gl,
      simRes.width,
      simRes.height,
      r.internalFormat,
      r.format,
      texType,
      gl.NEAREST
    );

    initBloomFramebuffers({ gl, ext });
    initSunraysFramebuffers({ gl, ext });
  }

  function initBloomFramebuffers({ gl, ext }: WebGLContext) {
    bloomFramebuffers = []; // Use the global array instead of creating a local one
    let res = getResolution(gl, config.BLOOM_RESOLUTION);

    const texType = ext.halfFloatTexType;
    const rgba = ext.formatRGBA;
    const filtering = gl.LINEAR;

    bloom = createFramebuffer(
      gl,
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
        gl,
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

  function initSunraysFramebuffers({ gl, ext }: WebGLContext) {
    let res = getResolution(gl, config.SUNRAYS_RESOLUTION);

    const texType = ext.halfFloatTexType;
    const r = ext.formatR;
    const filtering = gl.LINEAR;

    sunrays = createFramebuffer(
      gl,
      res.width,
      res.height,
      r.internalFormat,
      r.format,
      texType,
      filtering
    );
    sunraysTemp = createFramebuffer(
      gl,
      res.width,
      res.height,
      r.internalFormat,
      r.format,
      texType,
      filtering
    );
  }

  function resizeFBO(
    gl: WebGL2RenderingContext,
    target: { attach: (arg0: number) => number },
    w: number,
    h: number,
    internalFormat: number,
    format: number,
    type: any,
    param: any
  ) {
    let newFBO = createFramebuffer(
      gl,
      w,
      h,
      internalFormat,
      format,
      type,
      param
    );
    copyProgram.bind();
    gl.uniform1i(copyProgram.uniforms.uTexture, target.attach(0));
    blit(newFBO);
    return newFBO;
  }

  function resizeDoubleFBO(
    gl: WebGL2RenderingContext,
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
      gl,
      target.read,
      w,
      h,
      internalFormat,
      format,
      type,
      param
    );
    target.write = createFramebuffer(
      gl,
      w,
      h,
      internalFormat,
      format,
      type,
      param
    );
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

  function updateKeywords() {
    let displayKeywords = [];
    if (config.SHADING) displayKeywords.push("SHADING");
    if (config.BLOOM) displayKeywords.push("BLOOM");
    if (config.SUNRAYS) displayKeywords.push("SUNRAYS");
    if (config.AUTOSPLAT) displayKeywords.push("AUTOSPLAT");
    displayMaterial.setKeywords(displayKeywords);
  }

  updateKeywords();
  initFramebuffers({ gl, ext });
  multipleSplats(Math.random() * 20 + 5);

  let lastUpdateTime = Date.now();
  let colorUpdateTimer = 0.0;

  update({ gl, ext });

  function update({ gl, ext }: WebGLContext) {
    const dt = calcDeltaTime(lastUpdateTime);
    if (resizeCanvas(canvas)) initFramebuffers({ gl, ext });
    updateColors(gl, config, dt, colorUpdateTimer, pointers);
    applyInputs(pointers);
    if (!config.PAUSED) step(gl, dt);
    render(gl, null);
    requestAnimationFrame(() => update({ gl, ext }));
  }

  function applyInputs(pointers: Pointer[]) {
    if (splatStack.length > 0) multipleSplats(splatStack.pop() ?? 0);

    pointers.forEach((p) => {
      if (p.moved) {
        p.moved = false;
        splatPointer(p);
      }
    });
  }

  function step(gl: WebGL2RenderingContext, dt: number) {
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
    gl: WebGL2RenderingContext,
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

    if (!config.TRANSPARENT)
      drawColor(target, normalizeColor(config.BACK_COLOR));
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
      gl.uniform2f(
        displayMaterial.uniforms.texelSize,
        1.0 / width,
        1.0 / height
      );
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
    mask: {
      width: number;
      height: number;
      fbo: WebGLFramebuffer;
      attach: (arg0: number) => number;
    },
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

    splat({
      x: pointer.texcoordX,
      y: pointer.texcoordY,
      dx,
      dy,
      color: pointer.color,
    });
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
      splat({ x, y, dx, dy, color });
    }
  }

  function splat(options: {
    x: number;
    y: number;
    dx: number;
    dy: number;
    color: ColorFormats.RGB;
  }) {
    const { x, y, dx, dy, color } = options;

    splatProgram.bind();

    gl.uniform1i(splatProgram.uniforms.uTarget, velocity.read.attach(0));
    gl.uniform1f(
      splatProgram.uniforms.aspectRatio,
      canvas.width / canvas.height
    );
    gl.uniform2f(splatProgram.uniforms.point, x, y);
    gl.uniform3f(splatProgram.uniforms.color, dx, dy, 0.0);
    gl.uniform1f(
      splatProgram.uniforms.radius,
      correctRadius(canvas, config.SPLAT_RADIUS / 100.0)
    );
    blit(velocity.write);
    velocity.swap();

    gl.uniform1i(splatProgram.uniforms.uTarget, dye.read.attach(0));
    gl.uniform3f(splatProgram.uniforms.color, color.r, color.g, color.b);
    blit(dye.write);
    dye.swap();
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
}
