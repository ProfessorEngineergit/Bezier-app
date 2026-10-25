/**
 * Multiview SVG rendering for OCCT shapes.
 *
 * Renders a shape to compact, deterministic SVG by running OCCT hidden-line
 * removal (`projectEdges`) per view, discretizing the projected edges
 * (`wireframe`), and mapping the flattened 3D points into 2D screen space.
 *
 * The default output is a 4-up Front / Top / Right / Isometric grid with
 * visible edges drawn solid and hidden edges dashed, a per-view XYZ gnomon,
 * and an overall bounding-box annotation — a layout aimed at letting an
 * automated agent reason about geometry it cannot otherwise see.
 *
 * @module
 */
import type { BoundingBox, BoundingBoxOptions, ProjectionData, ShapeHandle, Vec3 } from "./types.js";
/** The subset of the kernel API the SVG renderer depends on. */
export interface SvgKernel {
    getBoundingBox(shape: ShapeHandle, options?: BoundingBoxOptions): BoundingBox;
    projectEdges(shape: ShapeHandle, viewOrigin: Vec3, viewDirection: Vec3, xAxis?: Vec3): ProjectionData;
    wireframe(shape: ShapeHandle, deflection?: number): {
        points: Float32Array;
        edgeGroups: Int32Array;
    };
    release(shape: ShapeHandle): void;
}
/** A named orthographic or isometric viewpoint. */
export type ViewName = "front" | "back" | "top" | "bottom" | "left" | "right" | "iso";
/** Options shared by single-view and multiview rendering. */
export interface SvgViewOptions {
    /** Panel width in px (default 240). */
    width?: number;
    /** Panel height in px (default 240). */
    height?: number;
    /** Inner padding in px (default 14). */
    padding?: number;
    /**
     * Wireframe sampling deflection in model units. Defaults to ~0.2% of the
     * bounding-box diagonal so output is scale-independent.
     */
    deflection?: number;
    /** Draw hidden (occluded) edges dashed (default true). */
    showHidden?: boolean;
    /** Draw a small XYZ axis gnomon in each panel (default true). */
    showGnomon?: boolean;
    /** Stroke width for visible edges in px (default 1). */
    strokeWidth?: number;
    /** Panel background fill (default "#ffffff"). */
    background?: string;
    /** Visible-edge stroke color (default "#111111"). */
    visibleColor?: string;
    /** Hidden-edge stroke color (default "#9aa0a6"). */
    hiddenColor?: string;
}
/** Options for the multiview grid. */
export interface MultiviewSvgOptions extends SvgViewOptions {
    /** Views to render, in order (default front, top, right, iso). */
    views?: ViewName[];
    /** Panels per row (default 2). */
    columns?: number;
    /** Draw the per-view name label (default true). */
    showLabels?: boolean;
    /** Annotate overall X×Y×Z size in a footer (default true). */
    showDimensions?: boolean;
}
/**
 * Render a single named view of `shape` to a standalone SVG string.
 */
export declare function renderShapeSVG(kernel: SvgKernel, shape: ShapeHandle, view?: ViewName, options?: SvgViewOptions): string;
/**
 * Render a multiview grid (default Front / Top / Right / Iso) of `shape` to a
 * single SVG string. All orthographic panels share one scale; an optional
 * footer annotates the overall X×Y×Z size.
 */
export declare function renderMultiviewSVG(kernel: SvgKernel, shape: ShapeHandle, options?: MultiviewSvgOptions): string;
