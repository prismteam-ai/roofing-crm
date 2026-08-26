/**
 * Design tests for HUD pin drag: move (no copy-plus), pin-only ghost, drop → center.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { SEARCH_PIN_DRAG_MIME_TYPE } from "../../src/map/search-pin-welcome-copy";
import {
  allowSearchPinDragOver,
  beginSearchPinDrag,
  endSearchPinDrag,
  isSearchPinDropPayload,
  mapPointerToSearchCenter,
} from "../../src/map/search-pin-drag";

afterEach(() => {
  endSearchPinDrag();
});

function createMockDataTransfer(): DataTransfer {
  const data = new Map<string, string>();
  const types: string[] = [];
  return {
    dropEffect: "none",
    effectAllowed: "uninitialized",
    files: [] as unknown as FileList,
    items: [] as unknown as DataTransferItemList,
    types,
    setData(format: string, value: string) {
      data.set(format, value);
      if (!types.includes(format)) {
        types.push(format);
      }
    },
    getData(format: string) {
      return data.get(format) ?? "";
    },
    clearData() {
      data.clear();
      types.splice(0, types.length);
    },
    setDragImage: vi.fn(),
  } as unknown as DataTransfer;
}

function createPinHandle(): HTMLButtonElement {
  const handle = document.createElement("button");
  handle.innerHTML = '<svg aria-hidden="true"><path d="M12 2z" /></svg>';
  document.body.append(handle);
  return handle;
}

describe("search pin drag", () => {
  it("starts a move drag with a pin-only ghost instead of a copy-plus", () => {
    const dataTransfer = createMockDataTransfer();
    const handle = createPinHandle();

    beginSearchPinDrag(dataTransfer, handle);

    expect(dataTransfer.effectAllowed).toBe("move");
    expect(dataTransfer.getData(SEARCH_PIN_DRAG_MIME_TYPE)).toBe("pin");
    expect(dataTransfer.setDragImage).toHaveBeenCalled();
    const [ghost] = (dataTransfer.setDragImage as ReturnType<typeof vi.fn>).mock
      .calls[0] as [HTMLElement, number, number];
    expect(ghost.querySelector("svg")).toBeTruthy();
    expect(ghost.textContent).not.toContain("+");
    expect(ghost.dataset.testid).toBe("search-pin-drag-ghost");
  });

  it("sets dropEffect to move so the browser does not badge a plus", () => {
    const dataTransfer = createMockDataTransfer();
    beginSearchPinDrag(dataTransfer, createPinHandle());

    const allowed = allowSearchPinDragOver(dataTransfer);

    expect(allowed).toBe(true);
    expect(dataTransfer.dropEffect).toBe("move");
    expect(dataTransfer.dropEffect).not.toBe("copy");
  });

  it("still accepts dragover when the browser hides the custom MIME type", () => {
    beginSearchPinDrag(createMockDataTransfer(), createPinHandle());
    const safariTransfer = createMockDataTransfer();
    safariTransfer.types.splice(0, safariTransfer.types.length);

    expect(allowSearchPinDragOver(safariTransfer)).toBe(true);
    expect(safariTransfer.dropEffect).toBe("move");
  });

  it("rejects dragover when no pin drag is in flight", () => {
    const dataTransfer = createMockDataTransfer();
    dataTransfer.setData("text/plain", "random text");

    expect(allowSearchPinDragOver(dataTransfer)).toBe(false);
    expect(dataTransfer.dropEffect).not.toBe("move");
  });

  it("reads a pin drop payload after dragstart", () => {
    const dataTransfer = createMockDataTransfer();
    beginSearchPinDrag(dataTransfer, createPinHandle());

    expect(isSearchPinDropPayload(dataTransfer)).toBe(true);
  });

  it("maps the drop pointer onto a search center so the filter circle can sit there", () => {
    const center = mapPointerToSearchCenter({
      clientX: 150,
      clientY: 80,
      containerRect: { left: 50, top: 20 },
      unproject: ([x, y]) => ({ lng: x / 10, lat: y / 10 }),
    });

    expect(center).toEqual({ longitude: 10, latitude: 6 });
  });
});
