import { ApiError, NetworkError } from '../api/StudyApi';
import { ViewerLoadError } from './types';

/** Turns a load failure into a short, user-facing explanation. */
export function describeViewerError(error: unknown): string {
  if (error instanceof ViewerLoadError) {
    // Already specific: says whether the file is corrupt or merely unsupported.
    return error.message;
  }
  if (error instanceof ApiError && error.status === 404) {
    return 'The image file for this study was not found.';
  }
  if (error instanceof NetworkError) {
    return 'The image could not be downloaded. Check your connection and try again.';
  }
  if (error instanceof ApiError) {
    return `The image could not be loaded (${error.code}).`;
  }
  return 'This image could not be decoded. Its pixel data may be damaged.';
}
