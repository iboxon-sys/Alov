import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeAdaptiveFaceFrame,
  computeObjectCoverProjection,
  projectPointObjectCover,
  smoothLandmarksEMA,
  type FacePoint,
} from './faceId.ts';

function makeTilted68Landmarks(centerX: number, centerY: number, tiltRad: number, scale = 1): FacePoint[] {
  const pts: FacePoint[] = [];
  const cos = Math.cos(tiltRad);
  const sin = Math.sin(tiltRad);
  const rotate = (lx: number, ly: number): FacePoint => ({
    x: centerX + (lx * cos - ly * sin) * scale,
    y: centerY + (lx * sin + ly * cos) * scale,
  });

  // 0..16 jaw
  for (let i = 0; i <= 16; i++) {
    const t = (i - 8) / 8;
    pts.push(rotate(t * 50, 35 - Math.abs(t) * 28));
  }
  // 17..26 brows
  for (let i = 0; i < 5; i++) pts.push(rotate(-32 + i * 6, -24));
  for (let i = 0; i < 5; i++) pts.push(rotate(8 + i * 6, -24));
  // 27..35 nose
  for (let i = 0; i < 9; i++) pts.push(rotate(0, -14 + i * 3));
  // 36..41 left eye
  for (let i = 0; i < 6; i++) pts.push(rotate(-26 + i * 3, -12));
  // 42..47 right eye
  for (let i = 0; i < 6; i++) pts.push(rotate(14 + i * 3, -12));
  // 48..67 mouth
  for (let i = 0; i < 20; i++) pts.push(rotate(-14 + (i % 10) * 3, 20));
  return pts;
}

describe('Face ID object-cover projection, EMA smoothing, and adaptive frame', () => {
  it('computes uniform object-cover scale and horizontal/vertical crop offsets without aspect distortion', () => {
    // 16:9 landscape webcam (360x203) inside 3:4 portrait container (290x387)
    const proj = computeObjectCoverProjection(360, 203, 290, 387);
    assert.ok(proj.scale > 1.8);
    assert.equal(proj.offsetY, 0);
    assert.ok(proj.offsetX > 180);

    // Center of source maps to exact center of destination
    const center = projectPointObjectCover({ x: 180, y: 101.5 }, proj);
    assert.ok(Math.abs(center.x - 145) < 0.01);
    assert.ok(Math.abs(center.y - 193.5) < 0.01);
  });

  it('smooths landmark coordinates using EMA and resets cleanly when previous array differs', () => {
    const first = smoothLandmarksEMA(null, [{ x: 100, y: 100 }], 0.5);
    assert.deepEqual(first, [{ x: 100, y: 100 }]);

    const second = smoothLandmarksEMA(first, [{ x: 120, y: 140 }], 0.5);
    assert.deepEqual(second, [{ x: 110, y: 120 }]);

    const reset = smoothLandmarksEMA(second, [{ x: 10, y: 20 }, { x: 30, y: 40 }], 0.5);
    assert.equal(reset.length, 2);
    assert.deepEqual(reset[0], { x: 10, y: 20 });
  });

  it('adapts oval center, radii, and tilt angle dynamically to the user face position and scale', () => {
    const smallLeft = makeTilted68Landmarks(80, 120, 0.22, 0.75);
    const largeRight = makeTilted68Landmarks(210, 220, -0.18, 1.35);

    const frameA = computeAdaptiveFaceFrame(smallLeft);
    const frameB = computeAdaptiveFaceFrame(largeRight);

    assert.ok(frameA && frameB);
    assert.ok(frameA.cx < frameB.cx);
    assert.ok(frameA.cy < frameB.cy);
    assert.ok(frameB.rx > frameA.rx * 1.4);
    assert.ok(frameB.ry > frameA.ry * 1.4);
    assert.ok(Math.abs(frameA.angleRad - 0.22) < 0.05);
    assert.ok(Math.abs(frameB.angleRad + 0.18) < 0.05);
  });
});
