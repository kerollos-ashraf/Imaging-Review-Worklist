/** @jest-environment node */
// Node types are needed only here (reading fixtures); the app itself is browser code.
/// <reference types="node" />
import fs from 'node:fs';
import path from 'node:path';
import { inspectDicom } from './dicomInspection';
import { ViewerLoadError } from './types';

const SAMPLES = path.resolve(__dirname, '../../../../samples');

function fixture(name: string): Buffer {
  return fs.readFileSync(path.join(SAMPLES, name));
}

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  const copy = new ArrayBuffer(buffer.byteLength);
  new Uint8Array(copy).set(buffer);
  return copy;
}

/** Replaces an ASCII value in place with one of the same length. */
function patched(name: string, from: string, to: string): ArrayBuffer {
  expect(to).toHaveLength(from.length);
  const buffer = Buffer.from(fixture(name));
  const index = buffer.indexOf(from, 0, 'latin1');
  expect(index).toBeGreaterThan(-1);
  buffer.write(to, index, 'latin1');
  return toArrayBuffer(buffer);
}

function failureOf(bytes: ArrayBuffer): ViewerLoadError {
  try {
    inspectDicom(bytes);
  } catch (error) {
    if (error instanceof ViewerLoadError) {
      return error;
    }
    throw error;
  }
  throw new Error('inspectDicom was expected to fail');
}

describe('inspectDicom', () => {
  it.each(['gradient.dcm', 'checkerboard.dcm'])('accepts the valid fixture %s', (name) => {
    expect(() => {
      inspectDicom(toArrayBuffer(fixture(name)));
    }).not.toThrow();
  });

  it('reports the corrupt fixture as corrupt', () => {
    const failure = failureOf(toArrayBuffer(fixture('corrupt.dcm')));
    expect(failure.failure).toBe('corrupt');
    expect(failure.message).toMatch(/corrupt|incomplete/i);
  });

  it('reports an empty file as corrupt', () => {
    expect(failureOf(new ArrayBuffer(0)).failure).toBe('corrupt');
  });

  it('reports a non-MONOCHROME2 image as unsupported, not corrupt', () => {
    const failure = failureOf(patched('gradient.dcm', 'MONOCHROME2', 'MONOCHROME1'));
    expect(failure.failure).toBe('unsupported');
    expect(failure.message).toMatch(/MONOCHROME2/);
  });

  it('reports a compressed transfer syntax as unsupported', () => {
    // Explicit VR Little Endian -> JPEG Baseline, same length when padded.
    const failure = failureOf(
      patched('gradient.dcm', '1.2.840.10008.1.2.1\0', '1.2.840.10008.1.2.4.'),
    );
    expect(failure.failure).toBe('unsupported');
    expect(failure.message).toMatch(/compressed/i);
  });
});
