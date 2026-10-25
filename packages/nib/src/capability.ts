/**
 * Whether Nib may run live. His few thousand triangles are trivial for a GPU but too slow under
 * software rendering (about 40 ms per frame measured without a GPU); there he stays a static image.
 */

/** Renderer names that indicate software (CPU) rendering. */
const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|basic render|lavapipe/i;

export function isSoftwareRenderer(name: string): boolean {
  return SOFTWARE.test(name);
}

/** The unmasked renderer name of a WebGL context, or an empty string where it is hidden. */
export function rendererName(gl: WebGLRenderingContext | WebGL2RenderingContext): string {
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  if (info === null) return '';
  const name: unknown = gl.getParameter(info.UNMASKED_RENDERER_WEBGL);
  return typeof name === 'string' ? name : '';
}
