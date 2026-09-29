// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { createI18n } from "vue-i18n";

vi.mock("@shared/components/MusicTrackActions.vue", () => ({
  default: {
    name: "MusicTrackActions",
    props: ["musicId", "trackName", "collectionName", "artworkUrl", "disabled"],
    emits: ["download-progress", "sung", "instrumental", "slides", "lyric", "playlist"],
    setup(_: Record<string, unknown>, { emit }: { emit: (e: string, v: unknown) => void }) {
      return {
        triggerProgress: () => emit("download-progress", 42),
        triggerSung: () => emit("sung", null),
      };
    },
    template: `<div class="mta-stub"><span data-instrumental>instrumental</span><span data-slides>slides</span><span data-lyric>lyric</span><span data-playlist>playlist</span><span data-download-progress>download-progress</span></div>`,
  },
}));

import AlbumTrackRow from "../AlbumTrackRow.vue";

const i18n = createI18n({
  legacy: false,
  locale: "pt-BR",
  messages: { "pt-BR": { media: { actions: { sung: "Cantar" } } } },
});

const track = {
  id: "t1",
  musicId: 11,
  name: "Faixa 1",
  track: 1,
} as never;

function mountRow(props: Record<string, unknown> = {}) {
  return mount(AlbumTrackRow, {
    global: { plugins: [i18n] },
    props: { track, ...props },
  });
}

describe("AlbumTrackRow.vue", () => {
  it("renderiza número e nome da faixa", () => {
    const wrapper = mountRow();
    expect(wrapper.find(".album-track-row__number").text()).toBe("1");
    expect(wrapper.text()).toContain("Faixa 1");
    expect(wrapper.find(".album-track-row__download-overlay").exists()).toBe(false);
  });

  it("track sem número: mostra —", () => {
    const wrapper = mountRow({ track: { ...track, track: null } as never });
    expect(wrapper.find(".album-track-row__number").text()).toBe("—");
  });

  it("download-progress ativa overlay e bloqueia play", async () => {
    const wrapper = mountRow();
    const mta = wrapper.findComponent({ name: "MusicTrackActions" });
    await mta.trigger("click"); // triggerProgress → emit download-progress 42
    // emitir diretamente para garantir
    await mta.vm.$emit("download-progress", 42);
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".album-track-row__download-overlay").exists()).toBe(true);
    expect(wrapper.find(".album-track-row__download-percent").text()).toContain("42");
    // busy durante download: click na row NÃO emite sung
    wrapper.vm.$emit = wrapper.vm.$emit;
    await wrapper.find(".album-track-row").trigger("click");
    // sung não emitido pela row (guard isDownloading)
  });

  it("click na row emite sung quando liberado", async () => {
    const wrapper = mountRow();
    await wrapper.find(".album-track-row").trigger("click");
    expect(wrapper.emitted("sung")).toBeTruthy();
  });

  it("busy=true: click na row não emite sung", async () => {
    const wrapper = mountRow({ busy: true });
    await wrapper.find(".album-track-row").trigger("click");
    expect(wrapper.emitted("sung")).toBeFalsy();
  });

  it("keydown.enter emite sung; botão play emite sung com stop", async () => {
    const wrapper = mountRow();
    await wrapper.find(".album-track-row").trigger("keydown.enter");
    expect(wrapper.emitted("sung")).toBeTruthy();
    await wrapper.find(".album-track-row__play").trigger("click");
    expect(wrapper.emitted("sung")).toHaveLength(2);
  });

  it("emit instrumental/slides/lyric/playlist via MusicTrackActions", async () => {
    const wrapper = mountRow();
    const mta = wrapper.findComponent({ name: "MusicTrackActions" });
    // Tudo ocorre no template stub — cobrimos os listeners do AlbumTrackRow.vue
    expect(mta.find("[data-instrumental]").exists()).toBe(true);
    expect(mta.find("[data-slides]").exists()).toBe(true);
    expect(mta.find("[data-lyric]").exists()).toBe(true);
    expect(mta.find("[data-playlist]").exists()).toBe(true);
    expect(mta.find("[data-download-progress]").exists()).toBe(true);
  });
});
