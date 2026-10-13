import { init as initCore } from '@cornerstonejs/core';
import { init as initDicomImageLoader } from '@cornerstonejs/dicom-image-loader';

let initialized = false;

/** One-time, idempotent setup shared by every viewer instance. */
export function ensureCornerstone(): Promise<void> {
  if (!initialized) {
    try {
      initCore();
      initDicomImageLoader({ maxWebWorkers: 1 });
      initialized = true;
    } catch (error) {
      // Leave `initialized` false so a later attempt can retry.
      return Promise.reject(error instanceof Error ? error : new Error('Viewer init failed'));
    }
  }
  return Promise.resolve();
}
