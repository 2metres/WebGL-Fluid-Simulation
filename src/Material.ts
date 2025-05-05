import { compileShader, createProgram, getUniforms, hashCode } from "./utils";

export interface Material {
  gl: WebGL2RenderingContext;
  vertexShader: WebGLShader;
  fragmentShaderSource: string;
  programs: WebGLProgram[];
  activeProgram: WebGLProgram | null;
  uniforms: Record<string, WebGLUniformLocation | null>;
  setKeywords: (keywords: string[]) => void;
  bind: () => void;
}

export class Material {
  constructor(
    gl: WebGL2RenderingContext,
    vertexShader: WebGLShader,
    fragmentShaderSource: string
  ) {
    this.vertexShader = vertexShader;
    this.fragmentShaderSource = fragmentShaderSource;
    this.programs = [];
    this.activeProgram = null;
    this.uniforms = {};
    this.gl = gl;
  }

  setKeywords = (keywords: string[]) => {
    let hash = 0;
    for (let i = 0; i < keywords.length; i++) hash += hashCode(keywords[i]);

    let program = this.programs[hash];
    if (program == null) {
      let fragmentShader = compileShader(
        this.gl,
        this.gl.FRAGMENT_SHADER,
        this.fragmentShaderSource,
        keywords
      );
      if (this.vertexShader && fragmentShader) {
        program = createProgram(this.gl, this.vertexShader, fragmentShader);
      } else {
        throw new Error("Vertex or Fragment shader is null");
      }
      this.programs[hash] = program;
    }

    if (program == this.activeProgram) return;

    this.uniforms = getUniforms(this.gl, program);
    this.activeProgram = program;
  };

  bind = () => {
    this.gl.useProgram(this.activeProgram);
  };
}
