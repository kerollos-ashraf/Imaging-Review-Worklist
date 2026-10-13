import { cache, metaData } from '@cornerstonejs/core';
import type { ImageInfo } from './types';

interface DicomDate {
  year?: number;
  month?: number;
  day?: number;
}

interface PlaneModule {
  rows?: number;
  columns?: number;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function formatStudyDate(date: DicomDate | undefined): string {
  if (!date?.year || !date.month || !date.day) {
    return 'Unknown';
  }
  return `${date.year}-${pad(date.month)}-${pad(date.day)}`;
}

function readModality(imageId: string): string {
  const series = metaData.get('generalSeriesModule', imageId) as { modality?: string } | undefined;
  return series?.modality ?? 'Unknown';
}

function readStudyDate(imageId: string): string {
  const study = metaData.get('generalStudyModule', imageId) as { studyDate?: DicomDate } | undefined;
  return formatStudyDate(study?.studyDate);
}

function readDimensions(imageId: string): { rows: number; columns: number } {
  const plane = metaData.get('imagePlaneModule', imageId) as PlaneModule | undefined;
  const image = cache.getImage(imageId);
  return {
    rows: plane?.rows ?? image?.rows ?? 0,
    columns: plane?.columns ?? image?.columns ?? 0,
  };
}

/**
 * Reads only the fields the UI may show: modality, study date, dimensions
 * (plus pixel range for window/level). No other tag is read, returned or logged.
 */
export function readImageInfo(imageId: string): ImageInfo {
  const image = cache.getImage(imageId);
  return {
    modality: readModality(imageId),
    studyDate: readStudyDate(imageId),
    ...readDimensions(imageId),
    minPixel: image?.minPixelValue ?? 0,
    maxPixel: image?.maxPixelValue ?? 1,
  };
}
