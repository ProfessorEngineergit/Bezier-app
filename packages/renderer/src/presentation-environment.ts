/**
 * HDR environment maps for the presentation renderer (decoding and PMREM conversion). The
 * procedural room stays resident as a fallback so a missing asset never leaves a model black.
 */

import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { PMREMGenerator, type Scene, type Texture, type WebGPURenderer } from 'three/webgpu';

type EnvironmentTarget = ReturnType<PMREMGenerator['fromEquirectangular']>;

export class PresentationEnvironment {
  readonly #pmrem: PMREMGenerator;
  readonly #fallback: EnvironmentTarget;
  readonly #targets = new Map<string, EnvironmentTarget>();
  readonly #loads = new Map<string, Promise<EnvironmentTarget | null>>();
  #request = 0;
  #disposed = false;

  constructor(renderer: WebGPURenderer) {
    this.#pmrem = new PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    this.#fallback = this.#pmrem.fromScene(room, 0.04);
    room.dispose();
  }

  get fallback(): Texture {
    return this.#fallback.texture;
  }

  /** Apply a photographed HDRI, or the procedural fallback when `url` is null. */
  async set(scene: Scene, url: string | null): Promise<void> {
    const request = ++this.#request;
    if (url === null) {
      scene.environment = this.fallback;
      return;
    }

    try {
      const target = await this.#load(url);
      if (target === null || this.#disposed || request !== this.#request) return;
      scene.environment = target.texture;
    } catch (error) {
      // Superseded by a later selection: ignore the failure.
      if (this.#disposed || request !== this.#request) return;
      scene.environment = this.fallback;
      throw new Error(`The studio environment could not be loaded: ${url}`, { cause: error });
    }
  }

  #load(url: string): Promise<EnvironmentTarget | null> {
    const cached = this.#targets.get(url);
    if (cached !== undefined) return Promise.resolve(cached);

    const active = this.#loads.get(url);
    if (active !== undefined) return active;

    const load = new HDRLoader()
      .loadAsync(url)
      .then((texture) => {
        try {
          if (this.#disposed) return null;
          const target = this.#pmrem.fromEquirectangular(texture);
          this.#targets.set(url, target);
          return target;
        } finally {
          // PMREM owns a filtered copy; keeping the 32-bit source would hold several unneeded
          // megabytes of CPU and GPU memory per preset.
          texture.dispose();
        }
      })
      .finally(() => this.#loads.delete(url));
    this.#loads.set(url, load);
    return load;
  }

  dispose() {
    this.#disposed = true;
    this.#request++;
    for (const target of this.#targets.values()) target.dispose();
    this.#targets.clear();
    this.#fallback.dispose();
    this.#pmrem.dispose();
  }
}
