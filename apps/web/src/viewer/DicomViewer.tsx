import { useEffect, useRef, useState } from 'react';
import type { MutableRefObject, ReactElement, RefObject } from 'react';
import { useApi } from '../api/ApiContext';
import { CornerstoneRenderer } from './CornerstoneRenderer';
import { describeViewerError } from './describeViewerError';
import { inspectDicom } from './dicomInspection';
import type { ReadyState, ViewerState, WindowLevel } from './types';
import { ViewerController } from './ViewerController';

interface Props {
  studyId: string;
}

function WindowLevelControls({
  state,
  onChange,
}: {
  state: ReadyState;
  onChange: (windowLevel: WindowLevel) => void;
}): ReactElement {
  const { minPixel, maxPixel } = state.info;
  const range = Math.max(1, maxPixel - minPixel);
  const { width, center } = state.windowLevel;
  return (
    <div className="wl-controls">
      <div className="field">
        <label htmlFor="viewer-window">Window width: {Math.round(width)}</label>
        <input
          id="viewer-window"
          type="range"
          min={1}
          max={Math.ceil(range * 2)}
          step={1}
          value={Math.min(Math.round(width), Math.ceil(range * 2))}
          onChange={(event) => {
            onChange({ width: Number(event.target.value), center });
          }}
        />
      </div>
      <div className="field">
        <label htmlFor="viewer-level">Window level: {Math.round(center)}</label>
        <input
          id="viewer-level"
          type="range"
          min={Math.floor(minPixel - range / 2)}
          max={Math.ceil(maxPixel + range / 2)}
          step={1}
          value={Math.round(center)}
          onChange={(event) => {
            onChange({ width, center: Number(event.target.value) });
          }}
        />
      </div>
    </div>
  );
}

function ImageSummary({
  state,
}: {
  state: ReadyState;
}): ReactElement {
  const { info } = state;
  return (
    <div role="group" aria-label="Image information">
    <dl className="summary">
      <dt>Modality</dt>
      <dd>{info.modality}</dd>
      <dt>Study date</dt>
      <dd>{info.studyDate}</dd>
      <dt>Dimensions</dt>
      <dd>
        {info.columns} x {info.rows} px
      </dd>
    </dl>
    </div>
  );
}

/**
 * Hosts one ViewerController for the lifetime of the component. Closing or
 * unmounting disposes it, which aborts in-flight loads and releases everything.
 */
function useViewerController(studyId: string): {
  containerRef: RefObject<HTMLDivElement>;
  controllerRef: MutableRefObject<ViewerController | null>;
  state: ViewerState;
} {
  const api = useApi();
  const containerRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<ViewerController | null>(null);
  const [state, setState] = useState<ViewerState>({ kind: 'idle' });

  useEffect(() => {
    const element = containerRef.current;
    if (element === null) {
      return undefined;
    }
    const controller = new ViewerController({
      element,
      renderer: new CornerstoneRenderer(element),
      loadFile: (id, signal) => api.getStudyFile(id, signal),
      inspect: inspectDicom,
      describeError: describeViewerError,
      onState: setState,
    });
    controllerRef.current = controller;
    return () => {
      controller.dispose();
      controllerRef.current = null;
    };
  }, [api]);

  useEffect(() => {
    void controllerRef.current?.load(studyId);
  }, [studyId]);

  return { containerRef, controllerRef, state };
}

/**
 * Hosts one ViewerController for the lifetime of the component. Closing or
 * unmounting disposes it, which aborts in-flight loads and releases everything.
 */
export function DicomViewer({ studyId }: Props): ReactElement {
  const { containerRef, controllerRef, state } = useViewerController(studyId);
  const ready = state.kind === 'ready' ? state : null;
  return (
    <div className="viewer">
      <div className="viewer-stage">
        <div
          ref={containerRef}
          className="viewer-canvas"
          data-testid="viewer-canvas"
          role="img"
          aria-label="DICOM image"
        />
        {state.kind === 'loading' && (
          <div className="viewer-overlay" role="status">
            Loading image...
          </div>
        )}
        {state.kind === 'error' && (
          <div className="viewer-overlay error" role="alert">
            {state.message}
          </div>
        )}
      </div>
      {ready !== null && (
        <>
          <ImageSummary state={ready} />
          <div className="actions">
            <button type="button" onClick={() => controllerRef.current?.fit()}>
              Fit
            </button>
            <button type="button" onClick={() => controllerRef.current?.reset()}>
              Reset
            </button>
          </div>
          <WindowLevelControls
            state={ready}
            onChange={(windowLevel) => controllerRef.current?.setWindowLevel(windowLevel)}
          />
        </>
      )}
    </div>
  );
}
