// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";

const slotsApi = {
  slots: vi.fn(),
  createSlot: vi.fn(),
  removeSlot: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
};

vi.mock("../../services/palco-session", () => ({
  palcoSession: {
    slotId: "0",
    setSlot: vi.fn(),
    isElectron: true,
  },
}));

vi.mock("@design-system/index", () => ({
  GlassCard: {
    name: "GlassCard",
    template: `<div class="stub-glass-card"><slot /></div>`,
    props: ["padding"],
  },
}));

vi.mock("vue-i18n", () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

const palcoSession = (await import("../../services/palco-session")).palcoSession;

type Slot = {
  id: string
  label: string
  running: boolean
  clients: number
  httpPort: number
  wsPort: number
  receiverIps?: string[]
}

const slot = (over: Partial<Slot> = {}): Slot => ({
  id: "1",
  label: "TV 2",
  running: false,
  clients: 0,
  httpPort: 8101,
  wsPort: 8201,
  ...over,
});

async function make() {
  const { default: PalcoSlotsCard } = await import("../PalcoSlotsCard.vue");
  const w = mount(PalcoSlotsCard);
  await flushPromises();
  return w;
}

beforeEach(() => {
  vi.useFakeTimers();
  (globalThis as never as { louvorja: unknown }).louvorja = { palco: slotsApi };
  slotsApi.slots.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  delete (globalThis as never as { louvorja?: unknown }).louvorja;
});

describe("PalcoSlotsCard.vue", () => {
  it("isElectron=false: não chama slots da bridge", async () => {
    (palcoSession as unknown as { isElectron: boolean }).isElectron = false;
    const w = await make();
    expect(slotsApi.slots).not.toHaveBeenCalled();
    (palcoSession as unknown as { isElectron: boolean }).isElectron = true;
    w.unmount();
  });

  it("monta com isElectron=true e lista slots da bridge", async () => {
    slotsApi.slots.mockResolvedValue([
      slot({ id: "0", label: "Principal", running: true, clients: 2, receiverIps: ["192.168.0.10"] }),
      slot(),
    ]);
    const w = await make();
    expect(slotsApi.slots).toHaveBeenCalled();
    expect(w.findAll(".palco-slot")).toHaveLength(2);
    expect(w.text()).toContain("192.168.0.10");
    // slot 0 sem botão de remover; slot 1 tem
    expect(w.find(".palco-slot__remove").exists()).toBe(true);
    w.unmount();
  });

  it("bridge retorna null → lista vazia sem erro", async () => {
    slotsApi.slots.mockResolvedValue(null);
    const w = await make();
    expect(w.findAll(".palco-slot")).toHaveLength(0);
    w.unmount();
  });

  it("dot de clientes: running com 0 clientes apaga dot; parado com clients mantém apagado", async () => {
    slotsApi.slots.mockResolvedValue([
      slot({ id: "1", running: true, clients: 0 }),
      slot({ id: "2", running: false, clients: 3 }),
    ]);
    const w = await make();
    const dots = w.findAll(".palco-slot__dot");
    expect(dots[0].classes()).not.toContain("palco-slot__dot--on");
    expect(dots[1].classes()).not.toContain("palco-slot__dot--on");
    w.unmount();
  });

  it("unmount sem timer ativo: branch false do clearInterval não explode", async () => {
    // montar com isElectron=false não agenda timer; onUnmounted cai no if falso
    (palcoSession as unknown as { isElectron: boolean }).isElectron = false;
    const w = await make();
    w.unmount();
    (palcoSession as unknown as { isElectron: boolean }).isElectron = true;
  });

  it("poll de 3s chama refresh novamente; unmount para o timer", async () => {
    const w = await make();
    expect(slotsApi.slots).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(3100);
    expect(slotsApi.slots).toHaveBeenCalledTimes(2);
    w.unmount();
    await vi.advanceTimersByTimeAsync(9000);
    expect(slotsApi.slots).toHaveBeenCalledTimes(2);
  });

  it("addSlot: cria TV com label e recarrega; loading desliga no fim", async () => {
    slotsApi.createSlot.mockResolvedValue(slot({ id: "2" }));
    const w = await make();
    await w.find(".palco-slots-card__add").trigger("click");
    await flushPromises();
    expect(slotsApi.createSlot).toHaveBeenCalledTimes(1);
    expect(w.vm.loading).toBe(false);
    expect(slotsApi.slots).toHaveBeenCalledTimes(2);
    w.unmount();
  });

  it("addSlot: erro da bridge ainda desliga loading (rejeição vira unhandled mas finally roda)", async () => {
    slotsApi.createSlot.mockRejectedValue(new Error("boom"));
    // @ts-expect-error handler do test runner
    const orig = process.listeners("unhandledRejection");
    const mute = (): void => undefined;
    process.on("unhandledRejection", mute);
    const w = await make();
    await w.find(".palco-slots-card__add").trigger("click");
    await flushPromises();
    await flushPromises();
    expect(w.vm.loading).toBe(false);
    w.unmount();
    for (const l of orig) process.off("unhandledRejection", l);
    process.off("unhandledRejection", mute);
  });

  it("toggleSlot: slot rodando → stop; parado → start", async () => {
    slotsApi.slots.mockResolvedValue([slot({ running: true }), slot({ id: "2", running: false })]);
    const w = await make();
    const powers = w.findAll(".palco-slot__power");
    await powers[0].trigger("click");
    await flushPromises();
    expect(slotsApi.stop).toHaveBeenCalledWith("1");
    await powers[1].trigger("click");
    await flushPromises();
    expect(slotsApi.start).toHaveBeenCalledWith("2");
    w.unmount();
  });

  it("removeSlot via botão trash do slot (id != 0)", async () => {
    slotsApi.slots.mockResolvedValue([slot({ id: "0", label: "Principal" }), slot({ id: "1" })]);
    const w = await make();
    slotsApi.removeSlot.mockResolvedValue(true);
    await w.find(".palco-slot__remove").trigger("click");
    await flushPromises();
    expect(slotsApi.removeSlot).toHaveBeenCalledWith("1");
    expect(slotsApi.slots).toHaveBeenCalledTimes(2);
    w.unmount();
  });

  it("removeSlot: id 0 é ignorado; outro remove e volta seleção se ativa", async () => {
    slotsApi.slots.mockResolvedValue([slot({ id: "0", label: "Principal" }), slot({ id: "1" })]);
    const w = await make();
    const selects = w.findAll(".palco-slot__select");
    await selects[1].trigger("click");
    expect(palcoSession.setSlot).toHaveBeenCalledWith("1");
    const vm = w.vm as unknown as { removeSlot(s: Slot): Promise<void> };
    await vm.removeSlot({ ...slot({ id: "0" }), id: "0" });
    expect(slotsApi.removeSlot).not.toHaveBeenCalled();
    await vm.removeSlot({ id: "1" } as Slot);
    expect(slotsApi.removeSlot).toHaveBeenCalledWith("1");
    expect(palcoSession.setSlot).toHaveBeenCalledWith("0");
    w.unmount();
  });

  it("selectSlot via clique atualiza activeId e badge", async () => {
    slotsApi.slots.mockResolvedValue([slot()]);
    const w = await make();
    expect(w.find(".palco-slot__badge").exists()).toBe(false);
    await w.find(".palco-slot__select").trigger("click");
    await flushPromises();
    expect(w.find(".palco-slot__badge").exists()).toBe(true);
    w.unmount();
  });
});
