import { glsl } from "./glsl";

export const COLOR_SHADER_SOURCE = glsl`
  precision mediump float;

  uniform vec4 color;

  void main () {
    gl_FragColor = color;
  }
`;
