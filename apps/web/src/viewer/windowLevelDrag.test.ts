import { attachWindowLevelDrag } from './windowLevelDrag';

interface PointerInit {
  pointerId?: number;
  button?: number;
  clientX?: number;
  clientY?: number;
}

/** jsdom has no PointerEvent, so a plain event carries the fields the code reads. */
function pointer(type: string, init: PointerInit = {}): Event {
  return Object.assign(new Event(type, { bubbles: true }), {
    pointerId: 1,
    button: 0,
    clientX: 0,
    clientY: 0,
    ...init,
  });
}

function setup(): { element: HTMLElement; drags: [number, number][]; detach: () => void } {
  const element = document.createElement('div');
  const captured = new Set<number>();
  Object.assign(element, {
    setPointerCapture: (id: number) => captured.add(id),
    releasePointerCapture: (id: number) => captured.delete(id),
    hasPointerCapture: (id: number) => captured.has(id),
    getBoundingClientRect: () => ({ width: 200, height: 100 }),
  });
  const drags: [number, number][] = [];
  const detach = attachWindowLevelDrag(element, (horizontal, vertical) => {
    drags.push([horizontal, vertical]);
  });
  return { element, drags, detach };
}

describe('attachWindowLevelDrag', () => {
  it('reports movement as a fraction of the element size while dragging', () => {
    const { element, drags } = setup();
    element.dispatchEvent(pointer('pointerdown', { clientX: 10, clientY: 10 }));
    expect(element.classList.contains('dragging')).toBe(true);

    element.dispatchEvent(pointer('pointermove', { clientX: 60, clientY: 30 }));
    element.dispatchEvent(pointer('pointermove', { clientX: 60, clientY: 20 }));
    expect(drags).toEqual([
      [0.25, 0.2],
      [0, -0.1],
    ]);

    element.dispatchEvent(pointer('pointerup', { clientX: 60, clientY: 20 }));
    expect(element.classList.contains('dragging')).toBe(false);
  });

  it('ignores movement when no drag is in progress', () => {
    const { element, drags } = setup();
    element.dispatchEvent(pointer('pointermove', { clientX: 50, clientY: 50 }));
    expect(drags).toEqual([]);
  });

  it('ignores secondary buttons and other pointers', () => {
    const { element, drags } = setup();
    element.dispatchEvent(pointer('pointerdown', { button: 2 }));
    element.dispatchEvent(pointer('pointermove', { clientX: 50 }));
    expect(drags).toEqual([]);

    element.dispatchEvent(pointer('pointerdown', { pointerId: 1 }));
    element.dispatchEvent(pointer('pointermove', { pointerId: 2, clientX: 50 }));
    expect(drags).toEqual([]);
  });

  it('stops reporting after the pointer is released or cancelled', () => {
    const { element, drags } = setup();
    element.dispatchEvent(pointer('pointerdown'));
    element.dispatchEvent(pointer('pointercancel'));
    element.dispatchEvent(pointer('pointermove', { clientX: 80 }));
    expect(drags).toEqual([]);
  });

  it('removes every listener on cleanup', () => {
    const { element, drags, detach } = setup();
    detach();
    element.dispatchEvent(pointer('pointerdown'));
    element.dispatchEvent(pointer('pointermove', { clientX: 80 }));
    expect(drags).toEqual([]);
    expect(element.classList.contains('dragging')).toBe(false);
  });
});
