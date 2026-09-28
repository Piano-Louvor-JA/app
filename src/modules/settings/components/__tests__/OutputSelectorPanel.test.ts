// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createI18n } from "vue-i18n";

/**
 * OutputSelectorPanel — lista unificada de destinos (cabeados + slots Palco).
 * Modo 'assign' (select de módulo) e modo 'pick' (checkbox + emit).
 * Mocka output-registry (já coberto) e palco-session.
 */
const mocks = vi.hoisted(() => ({
  targets: null as unknown as { value: Array<{ id: string; module: string | null }> },
  syncDetected: vi.fn(),
  setModule: vi.fn(),
  slots: vi.fn(async () => [] as Array<{ id: string; label: string; clients: number; running: boolean }>),
}));

vi.mock("../../services/output-registry", async () => {
  const { ref } = await import("vue");
  mocks.targets = ref([]);
  return {
    useOutputRegistry: vi.fn(() => ({
      targets: mocks.targets,
      syncDetected: mocks.syncDetected,
      setModule: mocks.setModule,
    })),
  };
});

vi.mock("../../services/palco-session", () => ({
  palcoSession: {
    slots: mocks.slots,
  },
}));

import OutputSelectorPanel from "../OutputSelectorPanel.vue";

const i18n = createI18n({
  legacy: false,
  locale: "pt-BR",
  messages: {
    "pt-BR": {
      settings: {
        outputs: {
          hint: "Escolha o destino",
          mirror: "Espelhar",
          bible: "Bíblia",
          media: "Mídia",
          video: "Vídeo",
          pdf: "PDF",
          ppt: "PPT",
          monitor: "Monitor",
          tvConnected: "TV conectada",
          tvOffline: "TV offline",
          assign: "Atribuir {output}",
        },
      },
    },
  } as never,
});

function setWindowBridge(displays: Array<{ id: number; bounds?: { width: number; height: number } }>) {
  (window as unknown as Record<string, unknown>).louvorja = {
    displays: {
      list: vi.fn(async () => displays),
      onChanged: vi.fn((cb: () => void) => {
        cb;
        return () => undefined;
      }),
    },
  };
}

function mountPanel(over: { mode?: "assign" | "pick"; modelValue?: string[] } = {}) {
  return mount(OutputSelectorPanel, {
    props: { mode: "assign", modelValue: [], ...over },
    global: { plugins: [i18n] },
  });
}

describe("OutputSelectorPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.targets.value = [];
    mocks.slots.mockResolvedValue([]);
    setWindowBridge([]);
  });

  it("sem displays nem slots: lista vazia, só hint", async () => {
    const wrapper = mountPanel();
    await new Promise((r) => setTimeout(r, 0));
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".output-selector__hint").text()).toBe(
      "Escolha o destino",
    );
    expect(wrapper.findAll(".output-selector__item")).toHaveLength(0);
  });

  it("modo assign: monitor cabeado vira item com select; syncDetected recebe os detectados", async () => {
    setWindowBridge([{ id: 1, bounds: { width: 1920, height: 1080 } }]);
    mocks.slots.mockResolvedValue([
      { id: "slotA", label: "TV Sala", clients: 1, running: true },
    ]);
    const wrapper = mountPanel();
    await new Promise((r) => setTimeout(r, 0));
    await wrapper.vm.$nextTick();

    const items = wrapper.findAll(".output-selector__item");
    expect(items).toHaveLength(2);
    expect(items[0]!.text()).toContain("Monitor 1");
    expect(items[0]!.text()).toContain("1920 × 1080");
    expect(items[1]!.text()).toContain("TV Sala");
    expect(items[1]!.text()).toContain("TV conectada");
    // computed reexecuta a cada mudança de displays/slots — valida a última sync
    expect(mocks.syncDetected).toHaveBeenCalled();
    const lastSync = mocks.syncDetected.mock.calls.at(-1)![0] as Array<{ id: string }>;
    expect(lastSync.map((s) => s.id)).toEqual(["cable:1", "palco:slotA"]);
  });

  it("slot sem clients mostra TV offline e classe is-off", async () => {
    mocks.slots.mockResolvedValue([
      { id: "s1", label: "TV Quarto", clients: 0, running: true },
    ]);
    const wrapper = mountPanel();
    await new Promise((r) => setTimeout(r, 0));
    await wrapper.vm.$nextTick();

    expect(wrapper.find(".output-selector__detail").classes()).toContain(
      "is-off",
    );
    expect(wrapper.find(".output-selector__detail").text()).toBe("TV offline");
  });

  it("assign: change no select chama registry.setModule", async () => {
    setWindowBridge([{ id: 7 }]);
    const wrapper = mountPanel();
    await new Promise((r) => setTimeout(r, 0));
    await wrapper.vm.$nextTick();

    const select = wrapper.find(".output-selector__select");
    await select.setValue("bible");
    expect(mocks.setModule).toHaveBeenCalledWith("cable:7", "bible");
  });

  it("pick: checkbox marca/desmarca e emite update:modelValue", async () => {
    setWindowBridge([{ id: 1 }, { id: 2 }]);
    const wrapper = mountPanel({ mode: "pick" });
    await new Promise((r) => setTimeout(r, 0));
    await wrapper.vm.$nextTick();

    expect(wrapper.find(".output-selector__select").exists()).toBe(false);
    const boxes = wrapper.findAll('input[type="checkbox"]');
    expect(boxes).toHaveLength(2);

    await boxes[0]!.setValue(true);
    expect(wrapper.emitted("update:modelValue")!.at(-1)).toEqual([["cable:1"]]);

    await boxes[1]!.setValue(true);
    expect(wrapper.emitted("update:modelValue")!.at(-1)).toEqual([
      ["cable:1", "cable:2"],
    ]);

    await boxes[0]!.setValue(false);
    expect(wrapper.emitted("update:modelValue")!.at(-1)).toEqual([["cable:2"]]);
  });

  it("pick: modelValue inicial pré-marca checkboxes", async () => {
    setWindowBridge([{ id: 1 }, { id: 2 }]);
    const wrapper = mountPanel({ mode: "pick", modelValue: ["cable:2"] });
    await new Promise((r) => setTimeout(r, 0));
    await wrapper.vm.$nextTick();

    const boxes = wrapper.findAll('input[type="checkbox"]');
    expect((boxes[0]!.element as HTMLInputElement).checked).toBe(false);
    expect((boxes[1]!.element as HTMLInputElement).checked).toBe(true);
  });

  it("bridge ausente/quebrada: displays=[] sem crash", async () => {
    (window as unknown as Record<string, unknown>).louvorja = {};
    const wrapper = mountPanel();
    await new Promise((r) => setTimeout(r, 0));
    await wrapper.vm.$nextTick();
    expect(wrapper.findAll(".output-selector__item")).toHaveLength(0);
  });

  it("module atribuído no registry aparece no select", async () => {
    setWindowBridge([{ id: 3 }]);
    mocks.targets.value = [{ id: "cable:3", module: "media" }];
    const wrapper = mountPanel();
    await new Promise((r) => setTimeout(r, 0));
    await wrapper.vm.$nextTick();

    const select = wrapper.find(".output-selector__select");
    expect((select.element as HTMLSelectElement).value).toBe("media");
  });
});
