import { JSX, RefObject, useEffect, useRef, useState } from "react";
import { useDebounceCallback, useResizeObserver } from "usehooks-ts";
import { getSupportedFormat, resizeCanvas, scaleByPixelRatio } from "./utils";
// import { drawHalftoneWave } from "./drawHalftoneWave";

interface Size {
  width?: number;
  height?: number;
}

export function App(): JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null);
  const [{ width, height }, setSize] = useState<Size>({
    width: undefined,
    height: undefined,
  });

  const onResize = useDebounceCallback((size) => {
    setSize(size);
    resizeCanvas(ref.current!);
  }, 10);

  useResizeObserver({
    ref: ref as RefObject<HTMLElement>,
    onResize,
  });

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    const options = {
      alpha: true,
      depth: false,
      stencil: false,
      antialias: false,
      preserveDrawingBuffer: false,
    };

    const ctx = canvas.getContext("webgl2", options) as WebGL2RenderingContext;

    if (!ctx) return;

    ctx.getExtension("EXT_color_buffer_float");
    ctx.clearColor(0.0, 0.0, 0.0, 1.0);

    const halfFloatTexType = ctx.HALF_FLOAT;

    const formatRGBA = getSupportedFormat(
      ctx,
      ctx.RGBA16F,
      ctx.RGBA,
      halfFloatTexType
    );
    const formatRG = getSupportedFormat(
      ctx,
      ctx.RG16F,
      ctx.RG,
      halfFloatTexType
    );
    const formatR = getSupportedFormat(
      ctx,
      ctx.R16F,
      ctx.RED,
      halfFloatTexType
    );

    const ext = {
      formatRGBA,
      formatRG,
      formatR,
      halfFloatTexType,
    };

    console.log({ ctx, ext });
  }, [ref]);

  console.log({ width, height });

  return <canvas ref={ref} style={{ width: "100%", height: "100%" }} />;
}
