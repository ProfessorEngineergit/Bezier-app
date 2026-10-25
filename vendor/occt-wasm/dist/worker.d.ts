/**
 * Off-main-thread OCCT kernel via Web Workers.
 *
 * @example
 * ```ts
 * import { OcctWorker } from 'occt-wasm/worker';
 *
 * const worker = await OcctWorker.spawn({ wasm: '/occt-wasm.wasm' });
 * const box = await worker.makeBox(10, 20, 30);
 * const mesh = await worker.tessellate(box);
 * console.log(mesh.triangleCount);
 * worker.terminate();
 * ```
 *
 * @module
 */
import type { InitOptions, ShapeHandle, Mesh, BoundingBox, BoundingBoxOptions, Vec3, TessellateOptions, WireframeOptions, ShapeType, EdgeData, MeshBatchData, ProjectionData, NurbsCurveData, CurvatureData, UVBounds, ShapeOrientation, PointClassification, SurfaceKind, CurveKind, ShapeQueryResult } from "./types.js";
import type { BooleanOp, TransitionMode } from "./types.js";
/**
 * Async proxy to an OcctKernel running in a Web Worker.
 * Every method returns a `Promise` wrapping the original return type.
 *
 * This is a hand-curated subset of `OcctKernel`, not an automatic
 * `Remote<OcctKernel>` mapping, because Comlink can only marshal structured-
 * cloneable values across the worker boundary. Methods that return live class
 * instances (e.g. `createXCAFDocument` -> `XCAFDocument`) are intentionally
 * omitted; declaring them here would type-check but fail at runtime. When
 * adding a kernel method, mirror its exact signature here.
 */
export interface OcctWorkerProxy {
    makeBox(dx: number, dy: number, dz: number): Promise<ShapeHandle>;
    makeBoxFromCorners(corner1: Vec3, corner2: Vec3): Promise<ShapeHandle>;
    makeCylinder(radius: number, height: number): Promise<ShapeHandle>;
    makeSphere(radius: number): Promise<ShapeHandle>;
    makeCone(r1: number, r2: number, height: number): Promise<ShapeHandle>;
    makeTorus(majorRadius: number, minorRadius: number): Promise<ShapeHandle>;
    makeEllipsoid(rx: number, ry: number, rz: number): Promise<ShapeHandle>;
    makeRectangle(width: number, height: number): Promise<ShapeHandle>;
    fuse(a: ShapeHandle, b: ShapeHandle): Promise<ShapeHandle>;
    cut(a: ShapeHandle, b: ShapeHandle): Promise<ShapeHandle>;
    common(a: ShapeHandle, b: ShapeHandle): Promise<ShapeHandle>;
    intersect(a: ShapeHandle, b: ShapeHandle): Promise<ShapeHandle>;
    section(a: ShapeHandle, b: ShapeHandle): Promise<ShapeHandle>;
    sectionPlane(shape: ShapeHandle, origin: Vec3, normal: Vec3): Promise<ShapeHandle>;
    fuseAll(shapes: ShapeHandle[]): Promise<ShapeHandle>;
    cutAll(shape: ShapeHandle, tools: ShapeHandle[]): Promise<ShapeHandle>;
    split(shape: ShapeHandle, tools: ShapeHandle[]): Promise<ShapeHandle>;
    extrude(shape: ShapeHandle, dx: number, dy: number, dz: number): Promise<ShapeHandle>;
    revolve(shape: ShapeHandle, axis: {
        point: Vec3;
        direction: Vec3;
    }, angleRad: number): Promise<ShapeHandle>;
    fillet(solid: ShapeHandle, edges: ShapeHandle[], radius: number): Promise<ShapeHandle>;
    chamfer(solid: ShapeHandle, edges: ShapeHandle[], distance: number): Promise<ShapeHandle>;
    shell(solid: ShapeHandle, facesToRemove: ShapeHandle[], thickness: number, tolerance: number): Promise<ShapeHandle>;
    offset(solid: ShapeHandle, distance: number, tolerance: number): Promise<ShapeHandle>;
    draft(shape: ShapeHandle, face: ShapeHandle, angleRad: number, direction: Vec3): Promise<ShapeHandle>;
    pipe(profile: ShapeHandle, spine: ShapeHandle): Promise<ShapeHandle>;
    loft(wires: ShapeHandle[], isSolid: boolean, ruled: boolean): Promise<ShapeHandle>;
    sweep(wire: ShapeHandle, spine: ShapeHandle, transitionMode?: TransitionMode): Promise<ShapeHandle>;
    draftPrism(shape: ShapeHandle, dx: number, dy: number, dz: number, angleDeg: number): Promise<ShapeHandle>;
    makeVertex(x: number, y: number, z: number): Promise<ShapeHandle>;
    makeEdge(v1: ShapeHandle, v2: ShapeHandle): Promise<ShapeHandle>;
    makeLineEdge(start: Vec3, end: Vec3): Promise<ShapeHandle>;
    makeCircleEdge(center: Vec3, normal: Vec3, radius: number): Promise<ShapeHandle>;
    makeArcEdge(start: Vec3, mid: Vec3, end: Vec3): Promise<ShapeHandle>;
    makeWire(edges: ShapeHandle[]): Promise<ShapeHandle>;
    makeFace(wire: ShapeHandle): Promise<ShapeHandle>;
    makeSolid(shell: ShapeHandle): Promise<ShapeHandle>;
    makeCompound(shapes: ShapeHandle[]): Promise<ShapeHandle>;
    translate(shape: ShapeHandle, dx: number, dy: number, dz: number): Promise<ShapeHandle>;
    rotate(shape: ShapeHandle, axis: {
        point: Vec3;
        direction: Vec3;
    }, angleRad: number): Promise<ShapeHandle>;
    scale(shape: ShapeHandle, center: Vec3, factor: number): Promise<ShapeHandle>;
    mirror(shape: ShapeHandle, point: Vec3, normal: Vec3): Promise<ShapeHandle>;
    copy(shape: ShapeHandle): Promise<ShapeHandle>;
    transform(shape: ShapeHandle, matrix: number[]): Promise<ShapeHandle>;
    linearPattern(shape: ShapeHandle, direction: Vec3, spacing: number, count: number): Promise<ShapeHandle>;
    circularPattern(shape: ShapeHandle, center: Vec3, axis: Vec3, angle: number, count: number): Promise<ShapeHandle>;
    getShapeType(shape: ShapeHandle): Promise<ShapeType>;
    isCompound(shape: ShapeHandle): Promise<boolean>;
    isSolid(shape: ShapeHandle): Promise<boolean>;
    isFace(shape: ShapeHandle): Promise<boolean>;
    isEdge(shape: ShapeHandle): Promise<boolean>;
    isWire(shape: ShapeHandle): Promise<boolean>;
    isVertex(shape: ShapeHandle): Promise<boolean>;
    isShell(shape: ShapeHandle): Promise<boolean>;
    getSubShapes(shape: ShapeHandle, type: "vertex" | "edge" | "wire" | "face" | "shell" | "solid"): Promise<ShapeHandle[]>;
    subShapeCount(shape: ShapeHandle, type: "vertex" | "edge" | "wire" | "face" | "shell" | "solid"): Promise<number>;
    subShapeHashes(shape: ShapeHandle, type: "vertex" | "edge" | "wire" | "face" | "shell" | "solid", hashUpperBound: number): Promise<number[]>;
    distanceBetween(a: ShapeHandle, b: ShapeHandle): Promise<number>;
    isSame(a: ShapeHandle, b: ShapeHandle): Promise<boolean>;
    isNull(shape: ShapeHandle): Promise<boolean>;
    shapeOrientation(shape: ShapeHandle): Promise<ShapeOrientation>;
    tessellate(shape: ShapeHandle, options?: TessellateOptions): Promise<Mesh>;
    wireframe(shape: ShapeHandle, options?: number | WireframeOptions): Promise<EdgeData>;
    meshShape(shape: ShapeHandle, options?: TessellateOptions): Promise<Mesh>;
    meshBatch(shapes: ShapeHandle[], options?: TessellateOptions): Promise<MeshBatchData>;
    importStep(data: string | ArrayBuffer): Promise<ShapeHandle>;
    exportStep(shape: ShapeHandle): Promise<string>;
    importStl(data: string | ArrayBuffer | Uint8Array): Promise<ShapeHandle>;
    exportStl(shape: ShapeHandle, linearDeflection?: number, ascii?: false): Promise<Uint8Array>;
    exportStl(shape: ShapeHandle, linearDeflection: number | undefined, ascii: true): Promise<string>;
    exportStl(shape: ShapeHandle, linearDeflection: number | undefined, ascii: boolean): Promise<string | Uint8Array>;
    toBREP(shape: ShapeHandle): Promise<string>;
    fromBREP(data: string): Promise<ShapeHandle>;
    cacheStep(data: string | ArrayBuffer): Promise<string>;
    loadCached(brep: string): Promise<ShapeHandle>;
    getBoundingBox(shape: ShapeHandle, options?: boolean | BoundingBoxOptions): Promise<BoundingBox>;
    getVolume(shape: ShapeHandle): Promise<number>;
    getSurfaceArea(shape: ShapeHandle): Promise<number>;
    getLength(shape: ShapeHandle): Promise<number>;
    getCenterOfMass(shape: ShapeHandle): Promise<Vec3>;
    surfaceCurvature(face: ShapeHandle, u: number, v: number): Promise<CurvatureData>;
    surfaceType(face: ShapeHandle): Promise<SurfaceKind>;
    surfaceNormal(face: ShapeHandle, u: number, v: number): Promise<Vec3>;
    uvBounds(face: ShapeHandle): Promise<UVBounds>;
    classifyPointOnFace(face: ShapeHandle, u: number, v: number): Promise<PointClassification>;
    curveType(edge: ShapeHandle): Promise<CurveKind>;
    curveLength(edge: ShapeHandle): Promise<number>;
    getNurbsCurveData(edge: ShapeHandle): Promise<NurbsCurveData>;
    makeBSplineEdge(poles: number[], weights: number[], knots: number[], multiplicities: number[], degree: number, periodic?: boolean): Promise<ShapeHandle>;
    curveDegreeElevate(edge: ShapeHandle, elevateBy: number): Promise<ShapeHandle>;
    curveKnotInsert(edge: ShapeHandle, knot: number, times: number): Promise<ShapeHandle>;
    curveKnotRemove(edge: ShapeHandle, knot: number, tolerance: number): Promise<ShapeHandle>;
    curveSplit(edge: ShapeHandle, param: number): Promise<[ShapeHandle, ShapeHandle]>;
    projectEdges(shape: ShapeHandle, viewOrigin: Vec3, viewDirection: Vec3, xAxis?: Vec3): Promise<ProjectionData>;
    fixShape(shape: ShapeHandle): Promise<ShapeHandle>;
    unifySameDomain(shape: ShapeHandle): Promise<ShapeHandle>;
    isValid(shape: ShapeHandle): Promise<boolean>;
    translateBatch(shapes: ShapeHandle[], offsets: number[]): Promise<ShapeHandle[]>;
    booleanPipeline(base: ShapeHandle, opCodes: BooleanOp[], tools: ShapeHandle[]): Promise<ShapeHandle>;
    queryBatch(shapes: ShapeHandle[]): Promise<ShapeQueryResult[]>;
    filletBatch(ops: Array<{
        solid: ShapeHandle;
        edges: ShapeHandle[];
        radius: number;
    }>): Promise<ShapeHandle[]>;
    transformBatch(shapes: ShapeHandle[], matrices: number[]): Promise<ShapeHandle[]>;
    rotateBatch(shapes: ShapeHandle[], params: number[]): Promise<ShapeHandle[]>;
    scaleBatch(shapes: ShapeHandle[], params: number[]): Promise<ShapeHandle[]>;
    mirrorBatch(shapes: ShapeHandle[], params: number[]): Promise<ShapeHandle[]>;
    release(shape: ShapeHandle): Promise<void>;
    releaseAll(): Promise<void>;
    checkpoint(): Promise<number>;
    releaseSince(mark: number): Promise<void>;
    readonly shapeCount: Promise<number>;
    describe(shape: ShapeHandle): Promise<string>;
}
/**
 * Web Worker wrapper for OcctKernel. Provides the same API surface
 * but every operation runs off the main thread.
 */
export declare class OcctWorker {
    #private;
    private constructor();
    /**
     * Spawn a new Web Worker running an OcctKernel instance.
     *
     * @param options.wasm - URL or path to the .wasm file (passed to `OcctKernel.init`)
     * @param options.worker - Optional pre-created Worker instance. If omitted,
     *   a new Worker is created from the built-in worker entry point.
     *
     * @example
     * ```ts
     * const worker = await OcctWorker.spawn({ wasm: '/occt-wasm.wasm' });
     * const box = await worker.makeBox(10, 20, 30);
     * worker.terminate();
     * ```
     */
    static spawn(options?: InitOptions & {
        worker?: Worker;
    }): Promise<OcctWorker>;
    /** Access the proxied kernel methods. */
    get kernel(): OcctWorkerProxy;
    makeBox(dx: number, dy: number, dz: number): Promise<ShapeHandle>;
    makeCylinder(radius: number, height: number): Promise<ShapeHandle>;
    makeSphere(radius: number): Promise<ShapeHandle>;
    fuse(a: ShapeHandle, b: ShapeHandle): Promise<ShapeHandle>;
    cut(a: ShapeHandle, b: ShapeHandle): Promise<ShapeHandle>;
    common(a: ShapeHandle, b: ShapeHandle): Promise<ShapeHandle>;
    extrude(shape: ShapeHandle, dx: number, dy: number, dz: number): Promise<ShapeHandle>;
    fillet(solid: ShapeHandle, edges: ShapeHandle[], radius: number): Promise<ShapeHandle>;
    tessellate(shape: ShapeHandle, options?: TessellateOptions): Promise<Mesh>;
    meshShape(shape: ShapeHandle, options?: TessellateOptions): Promise<Mesh>;
    meshBatch(shapes: ShapeHandle[], options?: TessellateOptions): Promise<MeshBatchData>;
    wireframe(shape: ShapeHandle, options?: number | WireframeOptions): Promise<EdgeData>;
    translate(shape: ShapeHandle, dx: number, dy: number, dz: number): Promise<ShapeHandle>;
    rotate(shape: ShapeHandle, axis: {
        point: Vec3;
        direction: Vec3;
    }, angleRad: number): Promise<ShapeHandle>;
    importStep(data: string | ArrayBuffer): Promise<ShapeHandle>;
    exportStep(shape: ShapeHandle): Promise<string>;
    cacheStep(data: string | ArrayBuffer): Promise<string>;
    loadCached(brep: string): Promise<ShapeHandle>;
    getBoundingBox(shape: ShapeHandle, options?: boolean | BoundingBoxOptions): Promise<BoundingBox>;
    getVolume(shape: ShapeHandle): Promise<number>;
    getSurfaceArea(shape: ShapeHandle): Promise<number>;
    getShapeType(shape: ShapeHandle): Promise<"compound" | "compsolid" | "edge" | "face" | "shape" | "shell" | "solid" | "vertex" | "wire">;
    release(shape: ShapeHandle): Promise<void>;
    releaseAll(): Promise<void>;
    queryBatch(shapes: ShapeHandle[]): Promise<ShapeQueryResult[]>;
    filletBatch(ops: Array<{
        solid: ShapeHandle;
        edges: ShapeHandle[];
        radius: number;
    }>): Promise<ShapeHandle[]>;
    transformBatch(shapes: ShapeHandle[], matrices: number[]): Promise<ShapeHandle[]>;
    rotateBatch(shapes: ShapeHandle[], params: number[]): Promise<ShapeHandle[]>;
    scaleBatch(shapes: ShapeHandle[], params: number[]): Promise<ShapeHandle[]>;
    mirrorBatch(shapes: ShapeHandle[], params: number[]): Promise<ShapeHandle[]>;
    /** Terminate the underlying Web Worker. */
    terminate(): void;
}
