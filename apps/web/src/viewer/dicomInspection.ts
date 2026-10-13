import { parseDicom } from 'dicom-parser';
import type { DataSet } from 'dicom-parser';
import { ViewerLoadError } from './types';

/** Transfer syntaxes whose pixel data is stored uncompressed. */
const UNCOMPRESSED_TRANSFER_SYNTAXES: ReadonlySet<string> = new Set([
  '1.2.840.10008.1.2', // Implicit VR Little Endian
  '1.2.840.10008.1.2.1', // Explicit VR Little Endian
  '1.2.840.10008.1.2.2', // Explicit VR Big Endian
]);

const TRANSFER_SYNTAX = 'x00020010';
const PHOTOMETRIC_INTERPRETATION = 'x00280004';
const NUMBER_OF_FRAMES = 'x00280008';
const ROWS = 'x00280010';
const COLUMNS = 'x00280011';
const PIXEL_DATA = 'x7fe00010';

function parse(bytes: ArrayBuffer): DataSet {
  try {
    return parseDicom(new Uint8Array(bytes));
  } catch {
    throw new ViewerLoadError(
      'corrupt',
      'This file is not a readable DICOM image. It may be corrupt or incomplete.',
    );
  }
}

function assertSupported(dataSet: DataSet): void {
  const transferSyntax = dataSet.string(TRANSFER_SYNTAX)?.trim() ?? '';
  if (!UNCOMPRESSED_TRANSFER_SYNTAXES.has(transferSyntax)) {
    throw new ViewerLoadError(
      'unsupported',
      'This image uses a compressed format that this viewer does not support.',
    );
  }
  const photometric = dataSet.string(PHOTOMETRIC_INTERPRETATION)?.trim() ?? '';
  if (photometric !== 'MONOCHROME2') {
    throw new ViewerLoadError(
      'unsupported',
      'Only MONOCHROME2 greyscale images are supported by this viewer.',
    );
  }
  if ((dataSet.intString(NUMBER_OF_FRAMES) ?? 1) > 1) {
    throw new ViewerLoadError('unsupported', 'Multi-frame images are not supported by this viewer.');
  }
}

function assertHasPixels(dataSet: DataSet): void {
  const hasSize = (dataSet.uint16(ROWS) ?? 0) > 0 && (dataSet.uint16(COLUMNS) ?? 0) > 0;
  if (!hasSize || dataSet.elements[PIXEL_DATA] === undefined) {
    throw new ViewerLoadError('corrupt', 'This DICOM file contains no image data.');
  }
}

/**
 * Checks, with the established `dicom-parser` library, that the file is one this
 * viewer can display, so the user gets a specific reason instead of a generic
 * failure. Only structural tags are read; nothing identifying is touched.
 *
 * @throws ViewerLoadError when the file is corrupt or unsupported.
 */
export function inspectDicom(bytes: ArrayBuffer): void {
  const dataSet = parse(bytes);
  assertSupported(dataSet);
  assertHasPixels(dataSet);
}
