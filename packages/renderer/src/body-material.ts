/**
 * Material for solids: rough enough to lose the highlight, with black lifted to a deep grey so dark
 * edges stay visible on dark parts. Downward faces keep a small tonal cue. Each face gets its own
 * small depth step (`faceBias`, `mesh.ts`) so touching parts do not z-fight.
 */
import { MeshStandardMaterial, Uniform } from 'three';
import { DATUM_FRAGMENT, DatumLine } from './datum-line.js';

/** How far the deepest of a face's sixteen steps reaches, in clip space. */
const FACE_BIAS = 6e-6;

/** Saturation boost over the file's colour, against wash-out from the lighting. */
const SATURATION = '1.22';

/**
 * Share of a lit pixel kept linear while the rest is squared: 1 is no change, less darkens mid
 * tones and keeps white. Applied in linear light after lighting.
 */
const DEPTH = 0.55;

/** The colour black is drawn as, linear: about 18% grey in sRGB. */
const DARKEST = 0.011;

/**
 * Surface analysis (audit F-027): 0 none, 1 zebra, 2 curvature. Zebra reflects parallel light bars
 * (kinks show tangent-only joins, breaks show edges). Curvature colours the normal's turn per mm
 * from blue (flat) to red (radius 5 mm or less), from the mesh's interpolated normals.
 */
export const surfaceAnalysis = new Uniform(0);

const ANALYSIS_FRAGMENT = `
if (uAnalysis > 0.5) {
  vec3 n = normalize(vBodyNormal);
  if (uAnalysis < 1.5) {
    vec3 r = reflect(normalize(vBodyPosition - cameraPosition), n);
    float bars = step(0.5, fract(r.z * 5.0 + 0.25));
    gl_FragColor = vec4(mix(vec3(0.03), vec3(0.92), bars), 1.0);
  } else {
    float turn = length(fwidth(n)) / max(length(fwidth(vBodyPosition)), 1e-6);
    float t = clamp(turn * 5.0, 0.0, 1.0);
    vec3 colour = t < 0.5 ? mix(vec3(0.15, 0.35, 0.95), vec3(0.2, 0.85, 0.35), t * 2.0)
                          : mix(vec3(0.2, 0.85, 0.35), vec3(0.95, 0.2, 0.15), t * 2.0 - 1.0);
    gl_FragColor = vec4(colour * (0.55 + 0.45 * abs(n.z)), 1.0);
  }
}`;

export function createBodyMaterial(datum = new DatumLine()): MeshStandardMaterial {
  const material = new MeshStandardMaterial({
    vertexColors: true,
    // Satin, not fully matte, so rounded edges keep a soft band of studio light.
    roughness: 0.62,
    metalness: 0,
    // Push faces back slightly so edge lines on them win the depth test at grazing angles. WebGL
    // cannot offset lines, only surfaces.
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uDatumPlane = datum.plane;
    shader.uniforms.uDatumStrength = datum.strength;
    shader.uniforms.uDatumColour = datum.colour;
    shader.uniforms.uAnalysis = surfaceAnalysis;
    shader.vertexShader =
      `attribute float faceBias;\nvarying vec3 vBodyNormal;\nvarying vec3 vBodyPosition;\n${shader.vertexShader}`
        .replace(
          '#include <beginnormal_vertex>',
          '#include <beginnormal_vertex>\nvBodyNormal = normalize(mat3(modelMatrix) * objectNormal);',
        )
        .replace(
          '#include <project_vertex>',
          `#include <project_vertex>\nvBodyPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;\ngl_Position.z += faceBias * ${FACE_BIAS.toExponential()} * gl_Position.w;`,
        );
    shader.fragmentShader =
      `varying vec3 vBodyNormal;\nvarying vec3 vBodyPosition;\nuniform vec4 uDatumPlane;\nuniform float uDatumStrength;\nuniform vec3 uDatumColour;\nuniform float uAnalysis;\n${shader.fragmentShader}`
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
diffuseColor.rgb = mix(vec3(${DARKEST}), vec3(1.0), diffuseColor.rgb);
float luma = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
diffuseColor.rgb = clamp(mix(vec3(luma), diffuseColor.rgb, ${SATURATION}), 0.0, 1.0);
diffuseColor.rgb *= mix(1.0, 0.88, smoothstep(0.1, 0.8, -normalize(vBodyNormal).z));
${DATUM_FRAGMENT}`,
        )
        .replace(
          '#include <opaque_fragment>',
          `#include <opaque_fragment>
gl_FragColor.rgb = gl_FragColor.rgb * (${DEPTH} + ${1 - DEPTH} * gl_FragColor.rgb);${ANALYSIS_FRAGMENT}`,
        );
  };
  material.customProgramCacheKey = () => 'solid-satin-studio-biased-datum-analysis-deep-v7';
  return material;
}
