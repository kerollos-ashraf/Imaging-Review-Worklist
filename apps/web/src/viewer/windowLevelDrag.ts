import { instrumentation } from './instrumentation';

/**
 * Called while the user drags on the image. Both values are the movement since
 * the previous event as a fraction of the element's size, so the caller can
 * scale them to the image's pixel range.
 */
export type DragListener = (horizontal: number, vertical: number) => void;

/**
 * Adds the usual imaging gesture: press and drag on the image to change the
 * window (horizontal) and level (vertical). The sliders remain the keyboard
 * route to the same adjustment.
 *
 * Every listener goes through the instrumentation helper, so the returned
 * cleanup function provably removes all of them.
 */
export function attachWindowLevelDrag(element: HTMLElement, onDrag: DragListener): () => void {
  let activePointer: number | null = null;
  let lastX = 0;
  let lastY = 0;

  const start = (event: Event): void => {
    const pointer = event as PointerEvent;
    if (pointer.button !== 0) {
      return;
    }
    activePointer = pointer.pointerId;
    lastX = pointer.clientX;
    lastY = pointer.clientY;
    element.setPointerCapture(pointer.pointerId);
    element.classList.add('dragging');
  };

  const move = (event: Event): void => {
    const pointer = event as PointerEvent;
    if (pointer.pointerId !== activePointer) {
      return;
    }
    const { width, height } = element.getBoundingClientRect();
    if (width > 0 && height > 0) {
      onDrag((pointer.clientX - lastX) / width, (pointer.clientY - lastY) / height);
    }
    lastX = pointer.clientX;
    lastY = pointer.clientY;
  };

  const stop = (event: Event): void => {
    const pointer = event as PointerEvent;
    if (pointer.pointerId !== activePointer) {
      return;
    }
    activePointer = null;
    element.classList.remove('dragging');
    if (element.hasPointerCapture(pointer.pointerId)) {
      element.releasePointerCapture(pointer.pointerId);
    }
  };

  const removers = [
    instrumentation.trackListener(element, 'pointerdown', start),
    instrumentation.trackListener(element, 'pointermove', move),
    instrumentation.trackListener(element, 'pointerup', stop),
    instrumentation.trackListener(element, 'pointercancel', stop),
  ];
  return () => {
    element.classList.remove('dragging');
    for (const remove of removers) {
      remove();
    }
  };
}
