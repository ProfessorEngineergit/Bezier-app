/**
 * occt-wasm — OCCT compiled to WASM with clean TypeScript bindings.
 *
 * @example
 * ```ts
 * import { OcctKernel } from 'occt-wasm';
 *
 * const kernel = await OcctKernel.init();
 * const box = kernel.makeBox(10, 20, 30);
 * const mesh = kernel.tessellate(box);
 * console.log(`${mesh.triangleCount} triangles`);
 * kernel.release(box);
 * ```
 */
export { BooleanOp, JoinType, OcctError, OcctErrorCode, SweepContact, SweepLaw, SweepMode, TransitionMode, type AddChildOptions, type AddShapeOptions, type AlignAnchor, type BoundingBox, type BoundingBoxOptions, type Color3, type CurveKind, type CurvatureData, type EdgeData, type EvolutionData, type GLTFExportOptions, type InitOptions, type LabelInfo, type LabelOptions, type LabelTag, type Location, type Mesh, type MeshBatchData, type NurbsCurveData, type ShapeQueryResult, type PointClassification, type ProjectionData, type ShapeHandle, type ShapeOrientation, type ShapeType, type SurfaceKind, type SweepAdvancedOptions, type SweepFullOptions, type SweepOrientedOptions, type SweepToleranceOptions, type TessellateOptions, type UVBounds, type Vec3, type WireframeOptions, type WireframeSource, } from "./types.js";
export { XCAFDocument, type EmscriptenFS } from "./xcaf-document.js";
import { XCAFDocument as XCAFDocumentImpl } from "./xcaf-document.js";
export { renderMultiviewSVG, renderShapeSVG, type MultiviewSvgOptions, type SvgViewOptions, type ViewName, } from "./svg.js";
import { type MultiviewSvgOptions, type SvgViewOptions, type ViewName } from "./svg.js";
import type { AlignAnchor, BoundingBox, CurveKind, CurvatureData, EdgeData, EvolutionData, InitOptions, Mesh, MeshBatchData, NurbsCurveData, PointClassification, ProjectionData, ShapeHandle, ShapeQueryResult, ShapeOrientation, ShapeType, SurfaceKind, SweepAdvancedOptions, SweepFullOptions, SweepOrientedOptions, TessellateOptions, WireframeOptions, BoundingBoxOptions, BooleanOp, UVBounds, Vec3 } from "./types.js";
import { JoinType, SweepMode, TransitionMode } from "./types.js";
import type { OcctWasmModule, OcctRawKernel } from "./raw-types.js";
export type { OcctWasmModule, OcctRawKernel } from "./raw-types.js";
/**
 * OCCT kernel compiled to WASM. Arena-based shape management
 * with branded handle types for type safety.
 *
 * Create via `OcctKernel.init()`. Dispose via `kernel[Symbol.dispose]()` or
 * the `using` keyword. A FinalizationRegistry safety net catches leaked
 * instances, but deterministic disposal is strongly preferred.
 */
export declare class OcctKernel {
    #private;
    private constructor();
    /**
     * Initialize the WASM module and create a kernel instance.
     *
     * @example
     * ```ts
     * // Auto-detect (works in browser, Node.js, and Workers):
     * const kernel = await OcctKernel.init();
     *
     * // Explicit WASM location:
     * const kernel = await OcctKernel.init({ wasm: '/path/to/occt-wasm.wasm' });
     *
     * // From pre-fetched binary:
     * const binary = await fetch('/occt-wasm.wasm').then(r => r.arrayBuffer());
     * const kernel = await OcctKernel.init({ wasm: binary });
     * ```
     */
    static init(options?: InitOptions): Promise<OcctKernel>;
    /** Create an axis-aligned box solid with the given dimensions (BRepPrimAPI_MakeBox).
     * @throws OcctError if dimensions are non-positive */
    makeBox(dx: number, dy: number, dz: number): ShapeHandle;
    /** Create a box solid from two opposite corner points.
     * @throws OcctError if corners are coincident */
    makeBoxFromCorners(corner1: Vec3, corner2: Vec3): ShapeHandle;
    /** Create a cylinder solid centered on the Z axis (BRepPrimAPI_MakeCylinder).
     * @throws OcctError */
    makeCylinder(radius: number, height: number): ShapeHandle;
    /** Create a sphere solid at the origin (BRepPrimAPI_MakeSphere).
     * @throws OcctError */
    makeSphere(radius: number): ShapeHandle;
    /** Create a cone (or truncated cone) solid along the Z axis (BRepPrimAPI_MakeCone).
     * @param r1 - bottom radius
     * @param r2 - top radius (0 for a full cone)
     * @throws OcctError */
    makeCone(r1: number, r2: number, height: number): ShapeHandle;
    /** Create a torus solid at the origin (BRepPrimAPI_MakeTorus).
     * @throws OcctError */
    makeTorus(majorRadius: number, minorRadius: number): ShapeHandle;
    /**
     * Infinite half-space solid bounded by the plane through `origin` with the
     * given `normal`. The solid fills the side the normal points into — useful
     * as an unbounded boolean cutting tool.
     */
    halfSpace(origin: Vec3, normal: Vec3): ShapeHandle;
    /** Create an ellipsoid solid at the origin by scaling a sphere.
     * @param rx - radius along X
     * @param ry - radius along Y
     * @param rz - radius along Z
     * @throws OcctError */
    makeEllipsoid(rx: number, ry: number, rz: number): ShapeHandle;
    /** Create a rectangular planar face on the XY plane at the origin.
     * @throws OcctError */
    makeRectangle(width: number, height: number): ShapeHandle;
    /** Boolean union (BRepAlgoAPI_Fuse). Combines two shapes into one.
     * @throws OcctError */
    fuse(a: ShapeHandle, b: ShapeHandle): ShapeHandle;
    /** Boolean subtraction (BRepAlgoAPI_Cut). Removes b from a.
     * @throws OcctError */
    cut(a: ShapeHandle, b: ShapeHandle): ShapeHandle;
    /** Boolean intersection (BRepAlgoAPI_Common). Keeps only the overlapping volume.
     * @throws OcctError */
    common(a: ShapeHandle, b: ShapeHandle): ShapeHandle;
    /** Boolean intersection — alias for common (BRepAlgoAPI_Common).
     * @throws OcctError */
    intersect(a: ShapeHandle, b: ShapeHandle): ShapeHandle;
    /** Compute the intersection edges/vertices of two shapes (BRepAlgoAPI_Section).
     * @returns A compound of edges/vertices at the intersection
     * @throws OcctError */
    section(a: ShapeHandle, b: ShapeHandle): ShapeHandle;
    /**
     * Section `shape` with the infinite plane through `origin` with the given
     * `normal`. Returns a compound of the intersection edges.
     *
     * The plane overload of {@link OcctKernel.section}: no face has to be built
     * and sized to span the shape. The edges keep their analytic geometry — the
     * section of a cylinder is a circle edge with an exact radius — so lengths
     * and areas measured from the result do not carry a tessellation error.
     * @throws OcctError */
    sectionPlane(shape: ShapeHandle, origin: Vec3, normal: Vec3): ShapeHandle;
    /** Fuse all shapes in the array into a single shape.
     * @throws OcctError */
    fuseAll(shapes: ShapeHandle[]): ShapeHandle;
    /** Subtract all tool shapes from the base shape.
     * @throws OcctError */
    cutAll(shape: ShapeHandle, tools: ShapeHandle[]): ShapeHandle;
    /** Split a shape using tool shapes as splitting surfaces (BOPAlgo_Splitter).
     * @returns A compound of the split fragments
     * @throws OcctError */
    split(shape: ShapeHandle, tools: ShapeHandle[]): ShapeHandle;
    /**
     * General-fuse cell selection: the union of all regions covered by two or
     * more of the inputs. Unlike {@link fuseAll} (which keeps every cell), this
     * keeps only the overlap regions via BOPAlgo_CellsBuilder.
     */
    intersectionCells(shapes: ShapeHandle[]): ShapeHandle;
    /** Extrude a shape along a direction vector (BRepPrimAPI_MakePrism).
     * @param dx - extrusion vector X component
     * @param dy - extrusion vector Y component
     * @param dz - extrusion vector Z component
     * @throws OcctError */
    extrude(shape: ShapeHandle, dx: number, dy: number, dz: number): ShapeHandle;
    /** Revolve a shape around an axis (BRepPrimAPI_MakeRevol).
     * @param axis - rotation axis defined by a point and direction
     * @param angleRad - sweep angle in radians (2*PI for full revolution)
     * @throws OcctError */
    revolve(shape: ShapeHandle, axis: {
        point: Vec3;
        direction: Vec3;
    }, angleRad: number): ShapeHandle;
    /** Apply a constant-radius fillet to edges of a solid (BRepFilletAPI_MakeFillet).
     * @throws OcctError */
    fillet(solid: ShapeHandle, edges: ShapeHandle[], radius: number): ShapeHandle;
    chamfer(solid: ShapeHandle, edges: ShapeHandle[], distance: number): ShapeHandle;
    chamferDistAngle(solid: ShapeHandle, edges: ShapeHandle[], distance: number, angleDeg: number): ShapeHandle;
    /** Apply an asymmetric (two-distance) chamfer to a single edge
     * (BRepFilletAPI_MakeChamfer): `distance1` is set back on the reference face,
     * `distance2` on the edge's other adjacent face. Omit `referenceFace` to use
     * the first face adjacent to the edge; pass one (or swap the two distances)
     * to control which side gets `distance1`. A given `referenceFace` must be
     * adjacent to `edge`.
     * @throws OcctError */
    chamferAsymmetric(solid: ShapeHandle, edge: ShapeHandle, distance1: number, distance2: number, referenceFace?: ShapeHandle): ShapeHandle;
    /**
     * Hollow a solid by removing the listed faces and offsetting remaining
     * faces inward by `thickness`.
     *
     * @param tolerance - OCCT precision for the thick-solid reconstruction.
     *     Use `1e-6` for precise shells (matches brepjs default); `1e-3` is a
     *     coarser legacy value that survives more inputs but produces
     *     different topology than brepjs.
     */
    shell(solid: ShapeHandle, facesToRemove: ShapeHandle[], thickness: number, tolerance: number): ShapeHandle;
    /**
     * Offset all faces of a solid by `distance`.
     *
     * @param tolerance - OCCT precision for the offset reconstruction. Use
     *     `1e-6` for precise offsets (matches brepjs default); `1e-3` is a
     *     coarser legacy value.
     */
    offset(solid: ShapeHandle, distance: number, tolerance: number): ShapeHandle;
    draft(shape: ShapeHandle, face: ShapeHandle, angleRad: number, direction: Vec3): ShapeHandle;
    pipe(profile: ShapeHandle, spine: ShapeHandle): ShapeHandle;
    simplePipe(profile: ShapeHandle, spine: ShapeHandle): ShapeHandle;
    /**
     * Loft a solid (or shell) through a sequence of wire profiles.
     *
     * @param ruled - When `true`, sections are joined by ruled (linear)
     *     surfaces; when `false`, by smooth B-spline surfaces. The two modes
     *     produce dramatically different topology for the same input.
     */
    loft(wires: ShapeHandle[], isSolid: boolean, ruled: boolean): ShapeHandle;
    loftWithVertices(wires: ShapeHandle[], isSolid: boolean, ruled: boolean, startVertex: ShapeHandle, endVertex: ShapeHandle): ShapeHandle;
    sweep(wire: ShapeHandle, spine: ShapeHandle, transitionMode?: TransitionMode): ShapeHandle;
    sweepPipeShell(profile: ShapeHandle, spine: ShapeHandle, freenet?: boolean, smooth?: boolean): ShapeHandle;
    /**
     * Sweep a profile wire along a spine wire with explicit profile-orientation
     * control. `up` is required for {@link SweepMode.FixedUp} (the constant
     * binormal direction); `auxSpine` is required for {@link SweepMode.Auxiliary}
     * (the guide wire). Both are ignored for the other modes.
     *
     * In `options`, `curvilinearEquivalence` and `contact` apply to
     * {@link SweepMode.Auxiliary} only; the tolerances apply to every mode and
     * are absolute, not relative to model size. See
     * {@link SweepOrientedOptions}.
     */
    sweepOriented(profile: ShapeHandle, spine: ShapeHandle, mode?: SweepMode, up?: Vec3, auxSpine?: ShapeHandle, options?: SweepOrientedOptions): ShapeHandle;
    /**
     * Sweep a profile along a spine with the full control surface: the
     * orientation modes of {@link OcctKernel.sweepOriented}, the corner
     * transitions of {@link OcctKernel.sweepPipeShell}, and the profile
     * placement neither of them exposes.
     *
     * Prefer this for new code. The other two remain for callers bound to
     * their existing raw arity.
     */
    sweepAdvanced(profile: ShapeHandle, spine: ShapeHandle, options?: SweepAdvancedOptions): ShapeHandle;
    /**
     * Sweep with the complete control surface: everything
     * {@link OcctKernel.sweepAdvanced} accepts, plus a spine support surface,
     * the approximation budget, and a homothetic scaling law.
     *
     * Prefer this for new code. The narrower sweep entry points remain for
     * callers bound to their existing raw arity.
     */
    sweepFull(profile: ShapeHandle, spine: ShapeHandle, options?: SweepFullOptions): ShapeHandle;
    draftPrism(shape: ShapeHandle, dx: number, dy: number, dz: number, angleDeg: number): ShapeHandle;
    makeVertex(x: number, y: number, z: number): ShapeHandle;
    makeEdge(v1: ShapeHandle, v2: ShapeHandle): ShapeHandle;
    makeLineEdge(start: Vec3, end: Vec3): ShapeHandle;
    makeCircleEdge(center: Vec3, normal: Vec3, radius: number): ShapeHandle;
    makeCircleArc(center: Vec3, normal: Vec3, radius: number, startAngle: number, endAngle: number): ShapeHandle;
    makeArcEdge(start: Vec3, mid: Vec3, end: Vec3): ShapeHandle;
    makeEllipseEdge(center: Vec3, normal: Vec3, majorRadius: number, minorRadius: number): ShapeHandle;
    makeEllipseArc(center: Vec3, normal: Vec3, majorRadius: number, minorRadius: number, startAngle: number, endAngle: number): ShapeHandle;
    makeBezierEdge(controlPoints: Vec3[]): ShapeHandle;
    makeBSplineEdge(poles: number[], weights: number[], knots: number[], multiplicities: number[], degree: number, periodic?: boolean): ShapeHandle;
    makeTangentArc(start: Vec3, tangent: Vec3, end: Vec3): ShapeHandle;
    makeHelixWire(origin: Vec3, axis: Vec3, pitch: number, height: number, radius: number): ShapeHandle;
    /**
     * A helix with an explicit handedness: right-handed (the default) winds
     * counter-clockwise about `axis` as it climbs, left-handed clockwise. The
     * two are mirror images over the same pitch, height and radius.
     *
     * Prefer this for new code. {@link OcctKernel.makeHelixWire} remains for
     * callers bound to its existing raw arity, and is always right-handed.
     */
    makeHelixWireHanded(origin: Vec3, axis: Vec3, pitch: number, height: number, radius: number, leftHanded?: boolean): ShapeHandle;
    makeWire(edges: ShapeHandle[]): ShapeHandle;
    makeFace(wire: ShapeHandle): ShapeHandle;
    makeNonPlanarFace(wire: ShapeHandle): ShapeHandle;
    addHolesInFace(face: ShapeHandle, holeWires: ShapeHandle[]): ShapeHandle;
    removeHolesFromFace(face: ShapeHandle, holeIndices: number[]): ShapeHandle;
    makeSolid(shell: ShapeHandle): ShapeHandle;
    sew(shapes: ShapeHandle[], tolerance?: number): ShapeHandle;
    sewAndSolidify(faces: ShapeHandle[], tolerance?: number): ShapeHandle;
    buildSolidFromFaces(faces: ShapeHandle[], tolerance?: number): ShapeHandle;
    makeCompound(shapes: ShapeHandle[]): ShapeHandle;
    buildTriFace(a: Vec3, b: Vec3, c: Vec3): ShapeHandle;
    makeFaceOnSurface(face: ShapeHandle, wire: ShapeHandle): ShapeHandle;
    makeNullShape(): ShapeHandle;
    translate(shape: ShapeHandle, dx: number, dy: number, dz: number): ShapeHandle;
    /**
     * Translate along X so the chosen bounding-box anchor lands at `target`.
     * Returns a new shape; the input is left untouched.
     */
    alignX(shape: ShapeHandle, target?: number, anchor?: AlignAnchor): ShapeHandle;
    /** Translate along Y so the chosen bounding-box anchor lands at `target`. */
    alignY(shape: ShapeHandle, target?: number, anchor?: AlignAnchor): ShapeHandle;
    /** Translate along Z so the chosen bounding-box anchor lands at `target`. */
    alignZ(shape: ShapeHandle, target?: number, anchor?: AlignAnchor): ShapeHandle;
    rotate(shape: ShapeHandle, axis: {
        point: Vec3;
        direction: Vec3;
    }, angleRad: number): ShapeHandle;
    scale(shape: ShapeHandle, center: Vec3, factor: number): ShapeHandle;
    mirror(shape: ShapeHandle, point: Vec3, normal: Vec3): ShapeHandle;
    copy(shape: ShapeHandle): ShapeHandle;
    /** Apply a 3x4 row-major affine transformation matrix (12 doubles: [r00,r01,r02,tx, r10,r11,r12,ty, r20,r21,r22,tz]). */
    transform(shape: ShapeHandle, matrix: number[]): ShapeHandle;
    /**
     * Re-tag a shape with a `TopLoc_Location` from a 3x4 row-major affine matrix
     * (same 12-double layout as {@link transform}). Shares the underlying topology
     * instead of deep-copying it, so a pure move is O(1).
     */
    located(shape: ShapeHandle, matrix: number[]): ShapeHandle;
    /** Apply a general (possibly non-affine) 3x4 row-major transformation matrix (12 doubles). */
    generalTransform(shape: ShapeHandle, matrix: number[]): ShapeHandle;
    linearPattern(shape: ShapeHandle, direction: Vec3, spacing: number, count: number): ShapeHandle;
    circularPattern(shape: ShapeHandle, center: Vec3, axis: Vec3, angle: number, count: number): ShapeHandle;
    /** Compose two 3x4 row-major transformation matrices. Returns a 12-element array. */
    composeTransform(m1: number[], m2: number[]): number[];
    /** Translate multiple shapes by their respective offsets in a single WASM call. */
    translateBatch(shapes: ShapeHandle[], offsets: number[]): ShapeHandle[];
    /** Chain boolean operations in a single WASM call. */
    booleanPipeline(base: ShapeHandle, opCodes: BooleanOp[], tools: ShapeHandle[]): ShapeHandle;
    /** Query multiple shapes in a single WASM call: bbox, volume, area, center of mass, type, validity. */
    queryBatch(shapes: ShapeHandle[]): ShapeQueryResult[];
    /** Fillet multiple solids in a single WASM call. */
    filletBatch(ops: Array<{
        solid: ShapeHandle;
        edges: ShapeHandle[];
        radius: number;
    }>): ShapeHandle[];
    /** Apply 3x4 affine transforms to multiple shapes in a single WASM call. */
    transformBatch(shapes: ShapeHandle[], matrices: number[]): ShapeHandle[];
    /** Rotate multiple shapes in a single WASM call. */
    rotateBatch(shapes: ShapeHandle[], params: number[]): ShapeHandle[];
    /** Scale multiple shapes in a single WASM call. */
    scaleBatch(shapes: ShapeHandle[], params: number[]): ShapeHandle[];
    /** Mirror multiple shapes in a single WASM call. */
    mirrorBatch(shapes: ShapeHandle[], params: number[]): ShapeHandle[];
    getShapeType(shape: ShapeHandle): ShapeType;
    /** True if the shape is a compound. */
    isCompound(shape: ShapeHandle): boolean;
    /** True if the shape is a comp-solid. */
    isCompSolid(shape: ShapeHandle): boolean;
    /** True if the shape is a solid. */
    isSolid(shape: ShapeHandle): boolean;
    /** True if the shape is a shell. */
    isShell(shape: ShapeHandle): boolean;
    /** True if the shape is a face. */
    isFace(shape: ShapeHandle): boolean;
    /** True if the shape is a wire. */
    isWire(shape: ShapeHandle): boolean;
    /** True if the shape is an edge. */
    isEdge(shape: ShapeHandle): boolean;
    /** True if the shape is a vertex. */
    isVertex(shape: ShapeHandle): boolean;
    getSubShapes(shape: ShapeHandle, type: "vertex" | "edge" | "wire" | "face" | "shell" | "solid"): ShapeHandle[];
    /** Count sub-shapes of a type without materialising a handle per sub-shape. */
    subShapeCount(shape: ShapeHandle, type: "vertex" | "edge" | "wire" | "face" | "shell" | "solid"): number;
    /**
     * Deduplicated hashes of a shape's sub-shapes, with no per-sub-shape handle
     * allocation. Use for hash-only paths (face-hash collection, tagging) that
     * would otherwise iterate {@link getSubShapes} handles just to release them.
     */
    subShapeHashes(shape: ShapeHandle, type: "vertex" | "edge" | "wire" | "face" | "shell" | "solid", hashUpperBound: number): number[];
    downcast(shape: ShapeHandle, targetType: "vertex" | "edge" | "wire" | "face" | "shell" | "solid"): ShapeHandle;
    distanceBetween(a: ShapeHandle, b: ShapeHandle): number;
    isSame(a: ShapeHandle, b: ShapeHandle): boolean;
    isEqual(a: ShapeHandle, b: ShapeHandle): boolean;
    isNull(shape: ShapeHandle): boolean;
    hashCode(shape: ShapeHandle, upperBound: number): number;
    shapeOrientation(shape: ShapeHandle): ShapeOrientation;
    sharedEdges(faceA: ShapeHandle, faceB: ShapeHandle): ShapeHandle[];
    adjacentFaces(shape: ShapeHandle, face: ShapeHandle): ShapeHandle[];
    iterShapes(shape: ShapeHandle): ShapeHandle[];
    /** Returns a flat array mapping edge hashes to face hashes. */
    edgeToFaceMap(shape: ShapeHandle, hashUpperBound: number): number[];
    /** Tessellate a shape into a triangle mesh. Returns copied data (safe to keep). */
    tessellate(shape: ShapeHandle, options?: TessellateOptions): Mesh;
    /**
     * Sample edges as polylines for wireframe rendering.
     *
     * Degenerate edges (sphere poles, cone apexes) are skipped. Pass a number
     * for the chord deflection, or a `WireframeOptions` to source the points
     * from the stored mesh polygons instead (see `WireframeSource`).
     */
    wireframe(shape: ShapeHandle, options?: number | WireframeOptions): EdgeData;
    hasTriangulation(shape: ShapeHandle): boolean;
    /** Tessellate with face group data (per-face triangle ranges + hashes). */
    meshShape(shape: ShapeHandle, options?: TessellateOptions): Mesh;
    /** Tessellate multiple shapes in a single WASM call. */
    meshBatch(shapes: ShapeHandle[], options?: TessellateOptions): MeshBatchData;
    importStep(data: string | ArrayBuffer): ShapeHandle;
    /** Read an IGES file into one shape (solids, surfaces or wires, as the file has them). */
    importIges(data: string | ArrayBuffer): ShapeHandle;
    exportStep(shape: ShapeHandle): string;
    /**
     * Import an STL mesh. A string is ASCII STL; bytes may be binary or ASCII
     * STL and are passed through untouched (no text decoding).
     */
    importStl(data: string | ArrayBuffer | Uint8Array): ShapeHandle;
    /**
     * Export STL. Binary STL (the default) comes back as bytes; pass
     * `ascii: true` for the text format as a string.
     */
    exportStl(shape: ShapeHandle, linearDeflection?: number, ascii?: false): Uint8Array;
    exportStl(shape: ShapeHandle, linearDeflection: number | undefined, ascii: true): string;
    exportStl(shape: ShapeHandle, linearDeflection: number | undefined, ascii: boolean): string | Uint8Array;
    toBREP(shape: ShapeHandle): string;
    fromBREP(data: string): ShapeHandle;
    /** Serialize a shape to binary BREP (smaller/faster than the text format). */
    toBREPBinary(shape: ShapeHandle): Uint8Array;
    /** Load a shape from binary BREP produced by {@link toBREPBinary}. */
    fromBREPBinary(data: Uint8Array): ShapeHandle;
    cacheStep(stepData: string | ArrayBuffer): string;
    loadCached(brep: string): ShapeHandle;
    /**
     * Compute the axis-aligned bounding box of a shape.
     *
     * By default the box is precise: `BRepBndLib::AddOptimal` finds each
     * surface's true extrema, so the bounds are the same whether or not the
     * shape has been tessellated. (Loose bounds were the source of the uniform
     * 1.2 mm shift versus brepjs in occt-wasm 2.0.) That extremum search is
     * what costs time on BSpline geometry with no mesh: a filleted box takes
     * ~5 ms precise versus ~0.06 ms loose. On analytic shapes both take a few
     * microseconds.
     *
     * `{ precise: false }` switches to `BRepBndLib::Add`: analytic extents,
     * BSpline control hulls, plus the shape tolerance. The result always
     * contains the precise box, which makes it the right choice for culling
     * or scene fitting of unmeshed freeform geometry (fillets, lofts, STEP
     * imports).
     *
     * `{ useTriangulation: true }` bounds an existing triangulation instead,
     * in either mode. Far faster on a meshed shape, but only as tight as that
     * mesh: on a 2.0-deflection mesh it overshot a 26 mm extent by 1.8 mm, and
     * on a 0.1-deflection mesh by 0.16 mm. With no triangulation present it
     * changes nothing.
     */
    getBoundingBox(shape: ShapeHandle, options?: BoundingBoxOptions): BoundingBox;
    /** @deprecated Pass `{ useTriangulation }` instead. */
    getBoundingBox(shape: ShapeHandle, useTriangulation: boolean): BoundingBox;
    getVolume(shape: ShapeHandle): number;
    getSurfaceArea(shape: ShapeHandle): number;
    getLength(shape: ShapeHandle): number;
    getCenterOfMass(shape: ShapeHandle): Vec3;
    /**
     * Matrix of inertia about the center of mass, as a row-major 3×3 array
     * (length 9). Symmetric: `[1]==[3]`, `[2]==[6]`, `[5]==[7]`.
     */
    getInertia(shape: ShapeHandle): number[];
    /** True if `point` lies inside (or on the boundary of) a solid. */
    containsPoint(shape: ShapeHandle, point: Vec3, tolerance?: number): boolean;
    /**
     * Surface (area-weighted) center of mass for a face. Equivalent to
     * `BRepGProp::SurfaceProperties(face, props).CentreOfMass()`.
     *
     * Use this for face fingerprinting and finder predicates rather than a
     * tessellation-based centroid — for non-planar faces (cylinders, holed
     * planes) the two diverge.
     */
    getSurfaceCenterOfMass(face: ShapeHandle): Vec3;
    getLinearCenterOfMass(shape: ShapeHandle): Vec3;
    surfaceCurvature(face: ShapeHandle, u: number, v: number): CurvatureData;
    vertexPosition(vertex: ShapeHandle): Vec3;
    surfaceType(face: ShapeHandle): SurfaceKind;
    surfaceNormal(face: ShapeHandle, u: number, v: number): Vec3;
    pointOnSurface(face: ShapeHandle, u: number, v: number): Vec3;
    outerWire(face: ShapeHandle): ShapeHandle;
    /**
     * Reverse a surface's U parametric direction (OCCT `Geom_Surface::UReverse`),
     * returning a new face proxy whose surface is the U-reversed original.
     * `pointOnSurface(result, u, v)` then evaluates the original surface at
     * `origSurface.UReversedParameter(u)` — for a full-period cylinder that is
     * `uFirst + uLast - u`.
     */
    reverseSurfaceU(face: ShapeHandle): ShapeHandle;
    uvBounds(face: ShapeHandle): UVBounds;
    /** Project a 3D point onto a face, returning [u, v]. */
    uvFromPoint(face: ShapeHandle, point: Vec3): {
        u: number;
        v: number;
    };
    /**
     * Extract cylinder data from a cylindrical face.
     *
     * Returns `null` when the face's underlying surface is not a cylinder,
     * otherwise `{ radius, isDirect }` where `isDirect` mirrors
     * `gp_Cylinder::Direct()` (i.e. whether U and V form a right-handed pair).
     */
    getFaceCylinderData(face: ShapeHandle): {
        radius: number;
        isDirect: boolean;
    } | null;
    /** Project a 3D point onto a face, returning the closest point as Vec3. */
    projectPointOnFace(face: ShapeHandle, point: Vec3): Vec3;
    /** Classify a UV point relative to a face boundary. */
    classifyPointOnFace(face: ShapeHandle, u: number, v: number): PointClassification;
    /** Create a BSpline surface from a grid of control points. */
    bsplineSurface(controlPoints: Vec3[], rows: number, cols: number): ShapeHandle;
    curveType(edge: ShapeHandle): CurveKind;
    curvePointAtParam(edge: ShapeHandle, param: number): Vec3;
    curveTangent(edge: ShapeHandle, param: number): Vec3;
    /** Returns [firstParam, lastParam]. */
    curveParameters(edge: ShapeHandle): {
        first: number;
        last: number;
    };
    curveIsClosed(edge: ShapeHandle): boolean;
    curveIsPeriodic(edge: ShapeHandle): boolean;
    curveLength(edge: ShapeHandle): number;
    interpolatePoints(points: Vec3[], periodic?: boolean): ShapeHandle;
    /**
     * Interpolate a cubic B-spline through the points with clamped start/end
     * tangent directions.
     */
    interpolatePointsWithTangents(points: Vec3[], startTangent: Vec3, endTangent: Vec3): ShapeHandle;
    /** Closest point on an edge to `point`, with the curve tangent and parameter there. */
    projectPointOnEdge(edge: ShapeHandle, point: Vec3): {
        point: Vec3;
        tangent: Vec3;
        parameter: number;
    };
    approximatePoints(points: Vec3[], tolerance?: number): ShapeHandle;
    getNurbsCurveData(edge: ShapeHandle): NurbsCurveData;
    curveDegreeElevate(edge: ShapeHandle, elevateBy: number): ShapeHandle;
    curveKnotInsert(edge: ShapeHandle, knot: number, times: number): ShapeHandle;
    curveKnotRemove(edge: ShapeHandle, knot: number, tolerance: number): ShapeHandle;
    curveSplit(edge: ShapeHandle, param: number): [ShapeHandle, ShapeHandle];
    liftCurve2dToPlane(points2d: Array<{
        x: number;
        y: number;
    }>, planeOrigin: Vec3, planeZ: Vec3, planeX: Vec3): ShapeHandle;
    /**
     * Hidden-line removal (HLRBRep) of `shape` as seen by a camera on the
     * `viewDirection` side of `viewOrigin`: `viewDirection` is the view-plane
     * normal pointing from the scene toward the viewer, `xAxis` is screen-right
     * (OCCT picks one when omitted). The returned edges lie in that plane, with
     * x along `xAxis`, y along `viewDirection × xAxis` and z = 0. Edges the
     * shape occludes from that camera land in the `hidden*` compounds.
     * @throws OcctError */
    projectEdges(shape: ShapeHandle, viewOrigin: Vec3, viewDirection: Vec3, xAxis?: Vec3): ProjectionData;
    /**
     * Render a single named view of a shape to a standalone SVG string via
     * hidden-line removal. Visible edges are solid, hidden edges dashed.
     */
    toSVG(shape: ShapeHandle, view?: ViewName, options?: SvgViewOptions): string;
    /**
     * Render a multiview grid (default Front / Top / Right / Iso) of a shape to
     * a single SVG string, with per-view gnomons and an overall size annotation.
     * Aimed at giving an automated agent a readable picture of the geometry.
     */
    toMultiviewSVG(shape: ShapeHandle, options?: MultiviewSvgOptions): string;
    /**
     * Thicken a face/shell into a solid (or grow a solid uniformly).
     *
     * @param tolerance - OCCT precision for the offset reconstruction. Use
     *     `1e-6` for precise thickening (matches brepjs default); `1e-3` is a
     *     coarser legacy value.
     */
    thicken(shape: ShapeHandle, thickness: number, tolerance: number): ShapeHandle;
    /**
     * Remove complete features such as holes, bosses, chamfers, or fillets and
     * heal the surrounding faces. Arbitrary isolated faces are not guaranteed
     * to be removable.
     *
     * @param tolerance - Additional fuzzy tolerance used while reconstructing
     *     the surrounding geometry. Pass `0` to use OCCT's defaults.
     */
    defeature(shape: ShapeHandle, faces: ShapeHandle[], tolerance: number): ShapeHandle;
    reverseShape(shape: ShapeHandle): ShapeHandle;
    simplify(shape: ShapeHandle): ShapeHandle;
    filletVariable(solid: ShapeHandle, edge: ShapeHandle, startRadius: number, endRadius: number): ShapeHandle;
    /** Offset a 2D wire. */
    offsetWire2D(wire: ShapeHandle, offset: number, joinType?: JoinType): ShapeHandle;
    translateWithHistory(shape: ShapeHandle, dx: number, dy: number, dz: number, inputFaceHashes: number[], hashUpperBound: number): EvolutionData;
    fuseWithHistory(a: ShapeHandle, b: ShapeHandle, inputFaceHashes: number[], hashUpperBound: number): EvolutionData;
    cutWithHistory(a: ShapeHandle, b: ShapeHandle, inputFaceHashes: number[], hashUpperBound: number): EvolutionData;
    filletWithHistory(solid: ShapeHandle, edges: ShapeHandle[], radius: number, inputFaceHashes: number[], hashUpperBound: number): EvolutionData;
    rotateWithHistory(shape: ShapeHandle, axis: {
        point: Vec3;
        direction: Vec3;
    }, angleRad: number, inputFaceHashes: number[], hashUpperBound: number): EvolutionData;
    mirrorWithHistory(shape: ShapeHandle, point: Vec3, normal: Vec3, inputFaceHashes: number[], hashUpperBound: number): EvolutionData;
    scaleWithHistory(shape: ShapeHandle, center: Vec3, factor: number, inputFaceHashes: number[], hashUpperBound: number): EvolutionData;
    intersectWithHistory(a: ShapeHandle, b: ShapeHandle, inputFaceHashes: number[], hashUpperBound: number): EvolutionData;
    chamferWithHistory(solid: ShapeHandle, edges: ShapeHandle[], distance: number, inputFaceHashes: number[], hashUpperBound: number): EvolutionData;
    /**
     * A bevel with two legs on each edge: `distance1` on the first face beside it (as the solid
     * lists its faces, the same on every rebuild), `distance2` on the other.
     */
    chamferTwoWithHistory(solid: ShapeHandle, edges: ShapeHandle[], distance1: number, distance2: number, inputFaceHashes: number[], hashUpperBound: number): EvolutionData;
    /**
     * Move faces of a solid and let the rest of it follow, as direct modellers do: each face's
     * surface is carried by a rigid motion (`motions`, twelve numbers per face: a row-major 3x4
     * matrix) and then offset along its outward normal (`offsets`, one per face); every edge and
     * vertex touching a moved face is found again where the new surfaces meet. Topology is kept;
     * a move that has no such solution throws.
     */
    tweakFacesWithHistory(solid: ShapeHandle, faces: ShapeHandle[], motions: number[], offsets: number[], inputFaceHashes: number[], hashUpperBound: number): EvolutionData;
    /**
     * Remove faces (a chamfer, a rounding, a boss) and let the faces around them grow over the gap,
     * with the face history of the other `...WithHistory` operations.
     */
    defeatureWithHistory(solid: ShapeHandle, faces: ShapeHandle[], inputFaceHashes: number[], hashUpperBound: number): EvolutionData;
    shellWithHistory(solid: ShapeHandle, faces: ShapeHandle[], thickness: number, tolerance: number, inputFaceHashes: number[], hashUpperBound: number): EvolutionData;
    offsetWithHistory(solid: ShapeHandle, distance: number, tolerance: number, inputFaceHashes: number[], hashUpperBound: number): EvolutionData;
    thickenWithHistory(shape: ShapeHandle, thickness: number, tolerance: number, inputFaceHashes: number[], hashUpperBound: number): EvolutionData;
    buildExtrusionLaw(profile: string, length: number, endFactor: number): ShapeHandle;
    trimLaw(law: ShapeHandle, first: number, last: number): ShapeHandle;
    sweepWithLaw(profile: ShapeHandle, spine: ShapeHandle, law: ShapeHandle): ShapeHandle;
    fixShape(shape: ShapeHandle): ShapeHandle;
    unifySameDomain(shape: ShapeHandle): ShapeHandle;
    isValid(shape: ShapeHandle): boolean;
    healSolid(shape: ShapeHandle, tolerance?: number): ShapeHandle;
    healFace(shape: ShapeHandle, tolerance?: number): ShapeHandle;
    healWire(shape: ShapeHandle, tolerance?: number): ShapeHandle;
    fixFaceOrientations(shape: ShapeHandle): ShapeHandle;
    removeDegenerateEdges(shape: ShapeHandle): ShapeHandle;
    buildCurves3d(wire: ShapeHandle): void;
    fixWireOnFace(wire: ShapeHandle, face: ShapeHandle, tolerance?: number): ShapeHandle;
    /**
     * Create a new XCAF document with the Emscripten FS pre-injected.
     * This allows `doc.exportGLTF()` to work without passing FS explicitly.
     */
    createXCAFDocument(): XCAFDocumentImpl;
    /**
     * Import a STEP file into a new XCAF document with the Emscripten FS pre-injected.
     * Preserves colors, names, and assembly structure from the STEP file.
     */
    importXCAFFromSTEP(stepData: string): XCAFDocumentImpl;
    release(shape: ShapeHandle): void;
    releaseAll(): void;
    /**
     * Mark the current arena high-water point. Every handle produced after this
     * call can be reclaimed in one step with {@link releaseSince}. Pair the two
     * around a logical operation to bulk-free intermediates instead of tracking
     * each id for individual {@link release}.
     */
    checkpoint(): number;
    /**
     * Release every handle allocated at or after `mark` (a value from a prior
     * {@link checkpoint}). Handles the caller wants to keep must be produced
     * before the checkpoint, or copied out; ids created after the mark become
     * invalid once this returns.
     */
    releaseSince(mark: number): void;
    get shapeCount(): number;
    /** Return a human-readable summary of a shape for debugging. */
    describe(shape: ShapeHandle): string;
    [Symbol.dispose](): void;
    /**
     * Return the underlying Emscripten module. Intended for integrators who
     * need to hand the raw module to a third-party adapter (e.g.
     * `brepjs.OcctWasmAdapter`) without bypassing {@link OcctKernel.init}.
     *
     * The module is owned by this `OcctKernel` instance — disposing the
     * kernel does not invalidate the module reference, but the raw kernel
     * obtained via {@link getRawKernel} *will* be deleted.
     */
    getRawModule(): OcctWasmModule;
    /**
     * Return the underlying raw Embind kernel. Intended for integrators who
     * need to hand the raw kernel to a third-party adapter (e.g.
     * `brepjs.OcctWasmAdapter`).
     *
     * Lifecycle: the raw kernel is owned by this `OcctKernel`. Calling
     * `kernel[Symbol.dispose]()` (or letting the FinalizationRegistry collect
     * the wrapper) will `releaseAll()` and `delete()` the raw kernel — so the
     * adapter must not outlive the `OcctKernel` it was constructed from.
     * Do not call `delete()` or `releaseAll()` on the raw kernel directly.
     */
    getRawKernel(): OcctRawKernel;
}
