import { createProgram, getUniforms } from "./utils";

export interface Program {
  gl: WebGL2RenderingContext;
  uniforms: Record<string, WebGLUniformLocation | null>;
  program: WebGLProgram;
  bind: () => void;
}

export class Program {
  constructor(
    gl: WebGL2RenderingContext,
    vertexShader: WebGLShader | null,
    fragmentShader: WebGLShader | null
  ) {
    this.uniforms = {};
    this.gl = gl;

    if (vertexShader && fragmentShader) {
      this.program = createProgram(this.gl, vertexShader, fragmentShader);
    } else {
      throw new Error("Vertex or Fragment shader is null");
    }
    this.uniforms = getUniforms(this.gl, this.program);
  }

  bind = () => {
    this.gl.useProgram(this.program);
  };
}
