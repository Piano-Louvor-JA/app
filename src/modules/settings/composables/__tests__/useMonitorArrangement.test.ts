// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, ref, type Ref } from "vue";
import { createPinia, setActivePinia } from "pinia";

/**
 * useMonitorArrangement — canvas de arranjo físico de monitores com drag.
 * Store real (100% coberta) + jsdom p/ pointer events e ResizeObserver stub.
 * desktop-bridge mockado: isDesktopApp=false → display-service usa os 3
 * PREVIEW_DISPLAYS (id 1, 2, 3) via refreshDisplays real da store.
 */
const bridgeMocks = vi.hoisted(() => ({
  isDesktopApp: vi.fn(() => false),
  getDesktopBridge: vi.fn(() => null),
}));

vi.mock("@shared/services/desktop-bridge", () => ({
  isDesktopApp: bridgeMocks.isDesktopApp,
  getDesktopBridge: bridgeMocks.getDesktopBridge,
}));

/**
 * useMonitorArrangement — canvas de arranjo físico de monitores com drag.
 * Store real (100% coberta) + jsdom p/ pointer events e ResizeObserver stub.
 */
vi.mock("../../services/monitor-layout", async () => {
  const actual =
    await vi.importActual<typeof import("../../services/monitor-layout")>(
      "../../services/monitor-layout",
    );
  return {
    ...actual,
    canvasDeltaToVirtual: vi.fn(
      (dx: number, dy: number, _scale: number) => ({ x: dx, y: dy }),
    ),
  };
});

import { useMonitorArrangement } from "../useMonitorArrangement";
import { useProjectionStore } from "../../stores/useProjectionStore";
import { canvasDeltaToVirtual } from "../../services/monitor-layout";

// jsdom não tem ResizeObserver
class ResizeObserverStub {
  callback: () => void;
  constructor(cb: () => void) {
    this.callback = cb;
  }
  observe(): void {}
  disconnect(): void {}
  unobserve(): void {}
}
(vi.stubGlobal("ResizeObserver", ResizeObserverStub), undefined);

function withSetup<T>(fn: (stage: Ref<HTMLElement | null>) => T): T {
  let result!: T;
  const stage = ref<HTMLElement | null>(null);
  const pinia = createPinia();
  setActivePinia(pinia); // mesma instância do teste
  const app = createApp(
    defineComponent({
      setup() {
        result = fn(stage);
        return () =>
          h("div", {
            ref: (el: unknown) => {
              stage.value = el as HTMLElement | null;
            },
            style: "width: 640px; height: 352px;",
            "data-stage": "true",
          });
      },
    }),
  );
  app.use(pinia);
  app.mount(document.createElement("div"));
  return result;
}

function pointerEvent(over: Partial<PointerEvent> = {}): PointerEvent {
  return {
    button: 0,
    pointerId: 1,
    clientX: 0,
    clientY: 0,
    preventDefault: vi.fn(),
    currentTarget: null,
    ...over,
  } as unknown as PointerEvent;
}

describe("useMonitorArrangement", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("sem displays: tiles vazio, draggingId null, hasCustomArrangement false", () => {
    const result = withSetup((stage) => useMonitorArrangement(stage));
    expect(result.tiles.value).toEqual([]);
    expect(result.draggingId.value).toBeNull();
    expect(result.hasCustomArrangement.value).toBe(false);
  });

  it("com displays (preview x3): tiles derivados do layout; drag+commit move tile", async () => {
    const result = withSetup((stage) => useMonitorArrangement(stage));
    // store do MESMO pinia do withSetup (setActivePinia dentro dele)
    const store = useProjectionStore();

    await store.refreshDisplays();
    await new Promise((r) => setTimeout(r, 0));

    expect(result.tiles.value.length).toBe(3);
    const tile1 = result.tiles.value[0]!;
    expect(tile1.id).toBe(1);

    // drag completo: pointerdown → move → up (commit via canvasDeltaToVirtual mock)
    result.onPointerDown(
      pointerEvent({
        clientX: 100,
        clientY: 50,
        currentTarget: document.createElement("div"),
      }),
      tile1.id,
    );
    expect(result.draggingId.value).toBe(tile1.id);
    expect(result.tiles.value[0]!.left).toBe(tile1.left);

    result.onPointerMove(pointerEvent({ clientX: 180, clientY: 90 }));
    expect(result.tiles.value[0]!.left).toBe(tile1.left + 80);
    expect(result.tiles.value[0]!.top).toBe(tile1.top + 40);

    result.onPointerUp(pointerEvent({ clientX: 180, clientY: 90 }));
    expect(canvasDeltaToVirtual).toHaveBeenCalledWith(80, 40, expect.anything());
    expect(result.draggingId.value).toBeNull();
    expect(result.hasCustomArrangement.value).toBe(true);
  });

  it("pointerdown com botão direito ou tile inexistente ignora", () => {
    const result = withSetup((stage) => useMonitorArrangement(stage));
    result.onPointerDown(pointerEvent({ button: 2 }), 99);
    expect(result.draggingId.value).toBeNull();
    result.onPointerDown(pointerEvent(), 999);
    expect(result.draggingId.value).toBeNull();
  });

  it("pointermove sem drag ativo não faz nada; pointerup idem", () => {
    const result = withSetup((stage) => useMonitorArrangement(stage));
    expect(() =>
      result.onPointerMove(pointerEvent({ clientX: 10, clientY: 10 })),
    ).not.toThrow();
    expect(() => result.onPointerUp(pointerEvent())).not.toThrow();
    expect(result.draggingId.value).toBeNull();
  });

  it("pointerCancel descarta o drag sem commit", async () => {
    const result = withSetup((stage) => useMonitorArrangement(stage));
    const store = useProjectionStore();
    await store.refreshDisplays();
    await new Promise((r) => setTimeout(r, 0));

    const tile1 = result.tiles.value[0]!;
    result.onPointerDown(
      pointerEvent({ clientX: 0, clientY: 0 }),
      tile1.id,
    );
    result.onPointerMove(pointerEvent({ clientX: 50, clientY: 50 }));
    result.onPointerCancel(pointerEvent({ clientX: 50, clientY: 50 }));

    expect(canvasDeltaToVirtual).not.toHaveBeenCalled();
    expect(result.draggingId.value).toBeNull();
  });

  it("commitDrag sem drag: só zera estado", () => {
    const result = withSetup((stage) => useMonitorArrangement(stage));
    // dispara up sem down anterior
    expect(() => result.onPointerUp(pointerEvent())).not.toThrow();
    expect(result.draggingId.value).toBeNull();
  });

  it("resetLayout chama resetMonitorArrangement (hasCustomArrangement volta a false)", () => {
    const result = withSetup((stage) => useMonitorArrangement(stage));
    result.resetLayout();
    expect(result.hasCustomArrangement.value).toBe(false);
  });
});
