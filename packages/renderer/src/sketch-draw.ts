/**
 * Sketch drawing, and projecting the cursor onto the sketch plane (both directions of the same
 * plane-to-screen mapping). The plane is infinite here, unlike the datum quads in
 * `sketch-planes.ts`. Sketch geometry is never in the pick BVH; the application interprets the
 * pointer.
 */

/// <reference lib="dom" />

import { drawnGeometry, type PlaneBasis, planeToWorld, sketchRegions } from '@bezier/core';
import type { Sketch, SketchId, SketchPoint, SketchPrimitive } from '@bezier/solver';
import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  Points,
  PointsMaterial,
  Ray,
  ShapeUtils,
  Vector2,
  Vector3,
} from 'three';
import type { ActiveCamera } from './camera.js';
import { OUTLINE_COLOUR } from './highlight.js';
import { curvePoints, type Point2Like } from './sketch-curve-sample.js';

export type { Point2Like } from './sketch-curve-sample.js';

/** Committed geometry, and the segment currently being dragged out. */
const DRAWN = 0x2f67ff;
const PENDING = 0xd88700;

/**
 * Picked sketch elements use the shared selection colour (audit D12). Module-level so it applies to
 * existing and future drawings.
 */
let selectedHex = OUTLINE_COLOUR;
const pickedMaterials = new Set<MeshBasicMaterial | PointsMaterial>();

/** The selection colour for picked sketch lines and points, `0xRRGGBB`. */
export function setSketchSelectionColour(hex: number): void {
  selectedHex = hex;
  for (const material of pickedMaterials) material.color.setHex(hex);
}
const VERTEX = DRAWN;
/** Fully constrained geometry is green, the common CAD convention. Free geometry is blue. */
const DEFINED = 0x2a9d62;
/** Construction geometry: guides, not outline, so quieter and broken up. */
const CONSTRUCTION = 0x8a93a6;
const DASH_PX = 7;
const GAP_PX = 5;

/** Line and point weights in screen pixels, so a sketch reads the same at every zoom. */
const POINT_SIZE = 6;
const LINE_WIDTH_PX = 2;
const SELECTED_WIDTH_PX = 3.2;

export interface SketchDraw {
  group: Group;
  /**
   * World size of one screen pixel, pushed from the scene each frame. Invisible changes are ignored
   * to avoid rebuilding the ribbons every frame.
   */
  setScale(worldPerPixel: number): void;
  /**
   * Replaces what is drawn; null clears and hides the overlay. Closed areas are filled (holes open)
   * except those in `unfilled`, already used by a feature.
   */
  set(
    plane: PlaneBasis | null,
    sketch: Sketch | null,
    pending: readonly Point2Like[],
    selected: ReadonlySet<SketchId>,
    unfilled?: ReadonlySet<string>,
    /** Elements the constraints hold entirely, drawn as defined. */
    defined?: ReadonlySet<SketchId>,
  ): void;
  /**
   * Where a screen ray meets the plane, in plane coordinates. Null when parallel to the plane or
   * behind the camera.
   */
  hit(camera: ActiveCamera, basis: PlaneBasis, ndcX: number, ndcY: number): Point2Like | null;
  dispose(): void;
}

const scratchRay = new Ray();
const scratchNdc = new Vector2();
const scratchOrigin = new Vector3();
const scratchNormal = new Vector3();

/**
 * `overlay` draws on top of the model, used for the active sketch so a sketch inside or under a
 * body stays visible. Sketches shown outside sketch mode keep the scene's depth.
 */
export function createSketchDraw(overlay = false): SketchDraw {
  const group = new Group();
  // Drawn over the body: a sketch on a face would z-fight with it, which is the common case.
  group.renderOrder = 3;

  const lineGeometry = new BufferGeometry();
  const fillGeometry = new BufferGeometry();
  const fill = new Mesh(
    fillGeometry,
    new MeshBasicMaterial({
      color: DRAWN,
      depthTest: !overlay,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      depthWrite: false,
      opacity: 0.16,
      transparent: true,
      side: DoubleSide,
    }),
  );
  fill.renderOrder = 2;

  const lineMaterial = new MeshBasicMaterial({
    color: DRAWN,
    depthTest: !overlay,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    depthWrite: false,
    transparent: true,
    side: DoubleSide,
  });
  const lines = new Mesh(lineGeometry, lineMaterial);
  lines.renderOrder = 3;

  const definedGeometry = new BufferGeometry();
  const definedLines = new Mesh(
    definedGeometry,
    new MeshBasicMaterial({
      color: DEFINED,
      depthTest: !overlay,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      depthWrite: false,
      transparent: true,
      side: DoubleSide,
    }),
  );
  definedLines.renderOrder = 3;

  const constructionGeometry = new BufferGeometry();
  const constructionLines = new Mesh(
    constructionGeometry,
    new MeshBasicMaterial({
      color: CONSTRUCTION,
      depthTest: !overlay,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      depthWrite: false,
      transparent: true,
      side: DoubleSide,
    }),
  );
  constructionLines.renderOrder = 3;

  const pendingGeometry = new BufferGeometry();
  const pendingMaterial = new MeshBasicMaterial({
    color: PENDING,
    depthTest: !overlay,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    depthWrite: false,
    transparent: true,
    side: DoubleSide,
  });
  const pending = new Mesh(pendingGeometry, pendingMaterial);
  pending.renderOrder = 4;

  const selectedGeometry = new BufferGeometry();
  const selectedMaterial = new MeshBasicMaterial({
    color: selectedHex,
    depthTest: !overlay,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    depthWrite: false,
    transparent: true,
    side: DoubleSide,
  });
  const selectedLines = new Mesh(selectedGeometry, selectedMaterial);
  pickedMaterials.add(selectedMaterial);
  selectedLines.renderOrder = 4;

  const vertexGeometry = new BufferGeometry();
  const vertices = new Points(
    vertexGeometry,
    new PointsMaterial({
      color: VERTEX,
      size: POINT_SIZE,
      depthTest: !overlay,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      depthWrite: false,
      transparent: true,
      sizeAttenuation: false,
    }),
  );
  vertices.renderOrder = 5;

  // Picked points, a size up and in the selection colour (points are picked alone for Point on,
  // Midpoint and Symmetric).
  const pickedVertexMaterial = new PointsMaterial({
    color: selectedHex,
    size: POINT_SIZE + 3,
    depthTest: !overlay,
    depthWrite: false,
    transparent: true,
    sizeAttenuation: false,
  });
  pickedMaterials.add(pickedVertexMaterial);
  const pickedVertexGeometry = new BufferGeometry();
  const pickedVertices = new Points(pickedVertexGeometry, pickedVertexMaterial);
  pickedVertices.renderOrder = 6;

  const definedVertexGeometry = new BufferGeometry();
  const definedVertices = new Points(
    definedVertexGeometry,
    new PointsMaterial({
      color: DEFINED,
      size: POINT_SIZE,
      depthTest: !overlay,
      depthWrite: false,
      transparent: true,
      sizeAttenuation: false,
    }),
  );
  definedVertices.renderOrder = 5;

  group.add(
    fill,
    lines,
    definedLines,
    constructionLines,
    pending,
    selectedLines,
    vertices,
    definedVertices,
    pickedVertices,
  );
  group.visible = false;

  /** The last drawing, so a change of scale can redraw it without new input. */
  let last: Parameters<SketchDraw['set']> | null = null;
  let worldPerPixel = 1;

  return {
    group,

    setScale(next) {
      if (!Number.isFinite(next) || next <= 0) return;
      // Below 4% the difference is narrower than the line itself.
      if (Math.abs(next - worldPerPixel) / worldPerPixel < 0.04) return;
      worldPerPixel = next;
      if (last !== null) this.set(...last);
    },

    set(basis, sketch, pendingPoints, selected, unfilled, defined) {
      last = [basis, sketch, pendingPoints, selected, unfilled, defined];
      if (basis === null) {
        group.visible = false;
        return;
      }
      group.visible = true;

      const points = new Map<SketchId, SketchPoint>();
      for (const primitive of sketch?.primitives ?? []) {
        if (primitive.kind === 'point') points.set(primitive.id, primitive);
      }

      write(fillGeometry, fillPositions(basis, sketch, unfilled));

      const segments: number[] = [];
      const selectedSegments: number[] = [];
      const constructionSegments: number[] = [];
      const definedSegments: number[] = [];
      for (const primitive of sketch?.primitives ?? []) {
        if (primitive.kind === 'point') continue;
        const picked = selected.has(primitive.id);
        const construction = primitive.construction === true;
        const into = picked
          ? selectedSegments
          : construction
            ? constructionSegments
            : defined?.has(primitive.id) === true
              ? definedSegments
              : segments;
        const width = (picked ? SELECTED_WIDTH_PX : LINE_WIDTH_PX) * worldPerPixel;
        let path: readonly Point2Like[] = [];
        if (primitive.kind === 'line') {
          const a = points.get(primitive.start);
          const b = points.get(primitive.end);
          if (a !== undefined && b !== undefined)
            path = [
              { u: a.x, v: a.y },
              { u: b.x, v: b.y },
            ];
        } else {
          path = curvePoints(primitive, points);
        }
        if (construction) {
          pushDashedRibbon(
            into,
            basis,
            path,
            width,
            DASH_PX * worldPerPixel,
            GAP_PX * worldPerPixel,
          );
        } else {
          pushPathRibbon(into, basis, path, width);
        }
      }
      write(lineGeometry, segments);
      write(constructionGeometry, constructionSegments);
      write(definedGeometry, definedSegments);
      write(selectedGeometry, selectedSegments);

      const trail: number[] = [];
      for (let i = 0; i + 1 < pendingPoints.length; i++) {
        const a = pendingPoints[i];
        const b = pendingPoints[i + 1];
        if (a === undefined || b === undefined) continue;
        pushRibbon(trail, basis, a.u, a.v, b.u, b.v, LINE_WIDTH_PX * worldPerPixel);
      }
      write(pendingGeometry, trail);

      const dots: number[] = [];
      const pickedDots: number[] = [];
      const definedDots: number[] = [];
      // Text outlines have hundreds of points; only draw those something else uses.
      const quiet = new Set<SketchId>();
      const loud = new Set<SketchId>();
      for (const primitive of sketch?.primitives ?? []) {
        if (primitive.kind === 'point') continue;
        const into = 'group' in primitive && primitive.group !== undefined ? quiet : loud;
        for (const id of ownPoints(primitive)) into.add(id);
      }
      for (const point of points.values()) {
        if (quiet.has(point.id) && !loud.has(point.id) && !selected.has(point.id)) continue;
        push(defined?.has(point.id) === true ? definedDots : dots, basis, point.x, point.y);
        if (selected.has(point.id)) push(pickedDots, basis, point.x, point.y);
      }
      write(pickedVertexGeometry, pickedDots);
      write(definedVertexGeometry, definedDots);
      // Sampled curves have no editable vertices at each raster segment.
      if (pendingPoints.length <= 5)
        for (const point of pendingPoints) push(dots, basis, point.u, point.v);
      write(vertexGeometry, dots);
    },

    hit(camera, basis, ndcX, ndcY) {
      scratchNdc.set(ndcX, ndcY);
      scratchRay.origin.setFromMatrixPosition(camera.matrixWorld);

      if (camera.type === 'PerspectiveCamera') {
        scratchRay.direction
          .set(ndcX, ndcY, 0.5)
          .unproject(camera)
          .sub(scratchRay.origin)
          .normalize();
      } else {
        // Orthographic rays share the view direction and differ in origin.
        scratchRay.origin.set(ndcX, ndcY, -1).unproject(camera);
        scratchRay.direction.set(0, 0, -1).transformDirection(camera.matrixWorld);
      }

      scratchNormal.set(basis.normal.x, basis.normal.y, basis.normal.z);
      scratchOrigin.set(basis.origin.x, basis.origin.y, basis.origin.z);

      const facing = scratchRay.direction.dot(scratchNormal);
      // Edge-on: the plane is a line on screen, so the answer would be unstable.
      if (Math.abs(facing) < 1e-6) return null;

      const distance = scratchOrigin.sub(scratchRay.origin).dot(scratchNormal) / facing;
      if (distance < 0) return null;

      const at = scratchRay.at(distance, new Vector3());
      const dx = at.x - basis.origin.x;
      const dy = at.y - basis.origin.y;
      const dz = at.z - basis.origin.z;
      return {
        u: dx * basis.xDirection.x + dy * basis.xDirection.y + dz * basis.xDirection.z,
        v: dx * basis.yDirection.x + dy * basis.yDirection.y + dz * basis.yDirection.z,
      };
    },

    dispose() {
      pickedMaterials.delete(selectedMaterial);
      pickedMaterials.delete(pickedVertexMaterial);
      for (const object of [
        fill,
        lines,
        definedLines,
        pending,
        selectedLines,
        vertices,
        definedVertices,
        pickedVertices,
      ]) {
        object.geometry.dispose();
        object.material.dispose();
      }
      group.clear();
    },
  };
}

/**
 * Triangles covering every closed area, holes left open, from the core's `sketchRegions` (the same
 * areas a click offers and an extrude builds).
 */
function ownPoints(primitive: Exclude<SketchPrimitive, { kind: 'point' }>): readonly SketchId[] {
  if (primitive.kind === 'line') return [primitive.start, primitive.end];
  if (primitive.kind === 'circle') return [primitive.center];
  if (primitive.kind === 'arc') return [primitive.center, primitive.start, primitive.end];
  if (primitive.kind === 'spline') return primitive.points;
  return [primitive.center, primitive.vertex];
}

function fillPositions(
  basis: PlaneBasis,
  sketch: Sketch | null,
  unfilled: ReadonlySet<string> | undefined,
): readonly number[] {
  if (sketch === null) return [];
  const positions: number[] = [];
  for (const area of sketchRegions(sketch, drawnGeometry(sketch))) {
    if (unfilled?.has(area.key) === true) continue;
    const contour = area.outline.map((point) => new Vector2(point.x, point.y));
    const holes = area.holes.map((hole) => hole.map((point) => new Vector2(point.x, point.y)));
    const all = [...contour, ...holes.flat()];
    for (const triangle of ShapeUtils.triangulateShape(contour, holes)) {
      for (const index of triangle) {
        const point = all[index];
        if (point !== undefined) push(positions, basis, point.x, point.y);
      }
    }
  }
  return positions;
}

function pushPathRibbon(
  into: number[],
  basis: PlaneBasis,
  points: readonly Point2Like[],
  width: number,
): void {
  for (let index = 0; index + 1 < points.length; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    if (start !== undefined && end !== undefined) {
      pushRibbon(into, basis, start.u, start.v, end.u, end.v, width);
    }
  }
}

/** A path as dashes, continuing across corners so a sampled curve is evenly dashed. */
function pushDashedRibbon(
  into: number[],
  basis: PlaneBasis,
  points: readonly Point2Like[],
  width: number,
  dash: number,
  gap: number,
): void {
  const period = dash + gap;
  if (!(period > 0)) return;
  let phase = 0;
  for (let index = 0; index + 1 < points.length; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    if (start === undefined || end === undefined) continue;
    const length = Math.hypot(end.u - start.u, end.v - start.v);
    if (length < 1e-9) continue;
    let along = 0;
    while (along < length) {
      const inDash = phase < dash;
      const step = Math.min(length - along, inDash ? dash - phase : period - phase);
      if (inDash) {
        const t0 = along / length;
        const t1 = (along + step) / length;
        pushRibbon(
          into,
          basis,
          start.u + (end.u - start.u) * t0,
          start.v + (end.v - start.v) * t0,
          start.u + (end.u - start.u) * t1,
          start.v + (end.v - start.v) * t1,
          width,
        );
      }
      along += step;
      phase = (phase + step) % period;
    }
  }
}

/** Append one plane point to a flat world-position list. */
function push(into: number[], basis: PlaneBasis, u: number, v: number): void {
  const world = planeToWorld(basis, u, v);
  into.push(world.x, world.y, world.z);
}

/**
 * Replaces a geometry's positions with a fresh attribute; sketches change at human speed, so
 * reusing a buffer is not worth tracking capacity and draw range.
 */
function write(geometry: BufferGeometry, positions: readonly number[]): void {
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.computeBoundingSphere();
}

function pushRibbon(
  into: number[],
  basis: PlaneBasis,
  startU: number,
  startV: number,
  endU: number,
  endV: number,
  width: number,
): void {
  const du = endU - startU;
  const dv = endV - startV;
  const length = Math.hypot(du, dv);
  if (length < 1e-9) return;
  const offsetU = (-dv / length) * (width / 2);
  const offsetV = (du / length) * (width / 2);
  const corners = [
    planeToWorld(basis, startU + offsetU, startV + offsetV),
    planeToWorld(basis, startU - offsetU, startV - offsetV),
    planeToWorld(basis, endU + offsetU, endV + offsetV),
    planeToWorld(basis, endU - offsetU, endV - offsetV),
  ];
  for (const index of [0, 1, 2, 2, 1, 3]) {
    const point = corners[index];
    if (point !== undefined) into.push(point.x, point.y, point.z);
  }
}
