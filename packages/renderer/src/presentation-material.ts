/** Texture-backed materials for the presentation renderer. */

import {
  BufferAttribute,
  type BufferGeometry,
  DataTexture,
  type MeshPhysicalMaterial,
  RepeatWrapping,
  RGBAFormat,
  SRGBColorSpace,
  type Texture,
  TextureLoader,
  UnsignedByteType,
} from 'three/webgpu';

export interface PresentationTextureSurface {
  kind: 'texture';
  color?: string;
  normal?: string;
  roughness?: string;
  metalness?: string;
  ao?: string;
  /** Number of tiles across the longest side of the part at 100% scale. */
  repeat: number;
  normalStrength?: number;
}

export type PresentationProceduralPattern =
  | 'abs'
  | 'pla'
  | 'petg'
  | 'resin'
  | 'rubber'
  | 'silicone'
  | 'ceramic'
  | 'stoneware'
  | 'brushed-metal';

export interface PresentationProceduralSurface {
  kind: 'procedural';
  pattern: PresentationProceduralPattern;
  repeat: number;
  normalStrength: number;
}

export type PresentationMaterialSurface =
  | PresentationTextureSurface
  | PresentationProceduralSurface;

interface LoadedMaps {
  color: Texture | null;
  normal: Texture | null;
  roughness: Texture | null;
  metalness?: Texture | null;
  ao?: Texture | null;
  repeat: number;
  normalStrength: number;
}

interface CachedMaps {
  promise: Promise<LoadedMaps>;
  maps?: LoadedMaps;
}
const texturesOf = (maps: LoadedMaps) => [
  maps.color,
  maps.normal,
  maps.roughness,
  maps.metalness,
  maps.ao,
];
const disposeMaps = (maps: LoadedMaps) => {
  for (const texture of texturesOf(maps)) texture?.dispose();
};

/**
 * Adds box-projected UVs, since OCCT tessellation has none. The plane is chosen per vertex normal;
 * all three projections share the largest bounds dimension so texture scale matches across edges.
 */
export function addBoxProjectedUVs(geometry: BufferGeometry): void {
  const positions = geometry.getAttribute('position');
  const normals = geometry.getAttribute('normal');
  const count = positions.count;
  const uv = new Float32Array(count * 2);

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  }
  const extent = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1e-6);

  for (let i = 0; i < count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);
    const nx = Math.abs(normals.getX(i));
    const ny = Math.abs(normals.getY(i));
    const nz = Math.abs(normals.getZ(i));
    if (nx >= ny && nx >= nz) {
      uv[i * 2] = (y - minY) / extent;
      uv[i * 2 + 1] = (z - minZ) / extent;
    } else if (ny >= nz) {
      uv[i * 2] = (x - minX) / extent;
      uv[i * 2 + 1] = (z - minZ) / extent;
    } else {
      uv[i * 2] = (x - minX) / extent;
      uv[i * 2 + 1] = (y - minY) / extent;
    }
  }
  geometry.setAttribute('uv', new BufferAttribute(uv, 2));
}

/** Loads once, switches atomically, and owns the texture cache. */
export class PresentationMaterialLibrary {
  #loader = new TextureLoader();
  #cache = new Map<string, CachedMaps>();
  #active: LoadedMaps | null = null;
  #activeKey = '';
  #requestedKey = '';
  #scale = 1;
  #grain = 1;
  #rotation = 0;
  #request = 0;
  #disposed = false;

  async set(
    material: MeshPhysicalMaterial,
    surface: PresentationMaterialSurface | null,
  ): Promise<void> {
    const request = ++this.#request;
    if (surface === null) {
      this.#active = null;
      this.#activeKey = '';
      this.#requestedKey = '';
      material.map = null;
      material.normalMap = null;
      material.roughnessMap = null;
      material.metalnessMap = null;
      material.aoMap = null;
      material.normalScale.set(1, 1);
      material.needsUpdate = true;
      return;
    }

    const key = JSON.stringify(surface);
    this.#requestedKey = key;
    let pending = this.#cache.get(key);
    if (pending === undefined) {
      const entry: CachedMaps = { promise: this.#load(surface) };
      entry.promise = entry.promise.catch((error: unknown) => {
        if (this.#cache.get(key) === entry) this.#cache.delete(key);
        throw error;
      });
      pending = entry;
      this.#cache.set(key, pending);
    } else {
      this.#cache.delete(key);
      this.#cache.set(key, pending);
    }
    const loaded = await pending.promise;
    pending.maps = loaded;
    if (this.#disposed) return;
    if (request !== this.#request) {
      this.#trimCache();
      return;
    }
    this.#active = loaded;
    this.#activeKey = key;
    material.map = loaded.color;
    material.normalMap = loaded.normal;
    material.roughnessMap = loaded.roughness;
    material.metalnessMap = loaded.metalness ?? null;
    material.aoMap = loaded.ao ?? null;
    material.aoMapIntensity = 0.65;
    material.normalScale.setScalar(loaded.normalStrength * this.#grain);
    this.#setRepeat();
    material.needsUpdate = true;
    this.#trimCache();
  }

  setScale(scale: number): void {
    this.#scale = Math.max(scale, 0.01);
    this.#setRepeat();
  }

  setGrain(material: MeshPhysicalMaterial, grain: number): void {
    this.#grain = Math.max(grain, 0);
    material.normalScale.setScalar((this.#active?.normalStrength ?? 1) * this.#grain);
  }

  setRotation(radians: number): void {
    this.#rotation = radians;
    this.#setRepeat();
  }

  #trimCache(): void {
    // Six full 2K sets are enough for comparing finishes without retaining every
    // visited material in GPU memory. Pending/current sets cannot be evicted.
    for (const [key, entry] of this.#cache) {
      if (this.#cache.size <= 6) return;
      if (key === this.#activeKey || key === this.#requestedKey || !entry.maps) continue;
      this.#cache.delete(key);
      disposeMaps(entry.maps);
    }
  }

  async #load(surface: PresentationMaterialSurface): Promise<LoadedMaps> {
    if (surface.kind === 'procedural') return createProceduralMaps(surface);
    const results = await Promise.allSettled(
      [surface.color, surface.normal, surface.roughness, surface.metalness, surface.ao].map(
        (url) => (url ? this.#loader.loadAsync(url) : Promise.resolve(null)),
      ),
    );
    const failure = results.find((result) => result.status === 'rejected');
    if (failure) {
      for (const result of results) if (result.status === 'fulfilled') result.value?.dispose();
      throw failure.reason;
    }
    const maps = results.map((result) => (result.status === 'fulfilled' ? result.value : null));
    const [color, normal, roughness, metalness, ao] = maps;
    if (color) color.colorSpace = SRGBColorSpace;
    for (const texture of maps) {
      if (!texture) continue;
      texture.wrapS = RepeatWrapping;
      texture.wrapT = RepeatWrapping;
      texture.anisotropy = 8;
    }
    return {
      color: color ?? null,
      normal: normal ?? null,
      roughness: roughness ?? null,
      metalness: metalness ?? null,
      ao: ao ?? null,
      repeat: surface.repeat,
      normalStrength: surface.normalStrength ?? 1,
    };
  }

  #setRepeat(): void {
    const active = this.#active;
    if (active === null) return;
    const repeat = active.repeat / this.#scale;
    for (const texture of texturesOf(active)) {
      if (!texture) continue;
      texture.repeat.setScalar(repeat);
      texture.center.set(0.5, 0.5);
      texture.rotation = this.#rotation;
    }
  }

  dispose(): void {
    this.#disposed = true;
    this.#request++;
    for (const entry of this.#cache.values()) {
      void entry.promise.then(disposeMaps).catch(() => {});
    }
    this.#cache.clear();
    this.#active = null;
  }
}

function createProceduralMaps(surface: PresentationProceduralSurface): LoadedMaps {
  const size = 256;
  const heights = new Float32Array(size * size);
  const roughnessNoise = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const index = y * size + x;
      const u = x / size;
      const v = y / size;
      const sample = proceduralSample(surface.pattern, u, v);
      heights[index] = sample.height;
      roughnessNoise[index] = sample.roughness;
    }
  }

  const normals = new Uint8Array(size * size * 4);
  const roughness = new Uint8Array(size * size * 4);
  const at = (x: number, y: number) =>
    heights[((y + size) % size) * size + ((x + size) % size)] ?? 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const index = y * size + x;
      const dx = (at(x + 1, y) - at(x - 1, y)) * 2.4;
      const dy = (at(x, y + 1) - at(x, y - 1)) * 2.4;
      const length = Math.hypot(dx, dy, 1);
      const normalAt = index * 4;
      normals[normalAt] = Math.round((0.5 - dx / length / 2) * 255);
      normals[normalAt + 1] = Math.round((0.5 - dy / length / 2) * 255);
      normals[normalAt + 2] = Math.round((0.5 + 1 / length / 2) * 255);
      normals[normalAt + 3] = 255;
      const value = Math.round(clamp(roughnessNoise[index] ?? 1, 0.35, 1) * 255);
      roughness[normalAt] = value;
      roughness[normalAt + 1] = value;
      roughness[normalAt + 2] = value;
      roughness[normalAt + 3] = 255;
    }
  }

  const normal = dataTexture(normals, size);
  const rough = dataTexture(roughness, size);
  return {
    color: null,
    normal,
    roughness: rough,
    repeat: surface.repeat,
    normalStrength: surface.normalStrength,
  };
}

function dataTexture(data: Uint8Array, size: number): DataTexture {
  const texture = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

function proceduralSample(
  pattern: PresentationProceduralPattern,
  u: number,
  v: number,
): { height: number; roughness: number } {
  const noise = periodicNoise(u, v);
  switch (pattern) {
    case 'abs':
      return { height: noise * 0.34, roughness: 0.82 + noise * 0.08 };
    case 'pla':
      return {
        height: Math.sin(v * Math.PI * 2 * 56) * 0.08 + noise * 0.03,
        roughness: 0.9 + noise * 0.05,
      };
    case 'petg':
      return { height: noise * 0.14, roughness: 0.78 + noise * 0.05 };
    case 'resin':
      return { height: noise * 0.08, roughness: 0.68 + noise * 0.03 };
    case 'rubber':
      return { height: noise * 0.72, roughness: 0.94 + noise * 0.04 };
    case 'silicone':
      return { height: noise * 0.28, roughness: 0.88 + noise * 0.04 };
    case 'ceramic':
      return { height: noise * 0.11, roughness: 0.74 + noise * 0.03 };
    case 'stoneware':
      return { height: noise * 0.48, roughness: 0.93 + noise * 0.04 };
    case 'brushed-metal':
      return {
        height: Math.sin(v * Math.PI * 2 * 74 + Math.sin(u * Math.PI * 8) * 0.25) * 0.34,
        roughness: 0.77 + noise * 0.08,
      };
  }
}

function periodicNoise(u: number, v: number): number {
  const tau = Math.PI * 2;
  return (
    Math.sin(tau * (u * 17 + v * 13)) * 0.42 +
    Math.sin(tau * (u * 31 - v * 23) + 1.7) * 0.34 +
    Math.sin(tau * (u * 47 + v * 41) + 0.4) * 0.24
  );
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
