// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";

/**
 * MediaView — aba de mídia das configurações.
 * Filhos mockados (cada card tem teste próprio).
 */
vi.mock("../PptEngineCard.vue", () => ({
  default: { name: "PptEngineCard", template: "<div class='stub-ppt' />" },
}));
vi.mock("../ExternalPlayerCard.vue", () => ({
  default: { name: "ExternalPlayerCard", template: "<div class='stub-ext' />" },
}));
vi.mock("../YoutubeAccountCard.vue", () => ({
  default: { name: "YoutubeAccountCard", template: "<div class='stub-yt' />" },
}));
vi.mock("../../components/PptEngineCard.vue", () => ({
  default: { name: "PptEngineCard", template: "<div class='stub-ppt' />" },
}));
vi.mock("../../components/ExternalPlayerCard.vue", () => ({
  default: { name: "ExternalPlayerCard", template: "<div class='stub-ext' />" },
}));
vi.mock("../../components/YoutubeAccountCard.vue", () => ({
  default: { name: "YoutubeAccountCard", template: "<div class='stub-yt' />" },
}));
vi.mock("../../components/YoutubeOfflineCard.vue", () => ({
  default: { name: "YoutubeOfflineCard", template: "<div class='stub-yt-offline' />" },
}));

vi.mock("@modules/albums/components/DisabledAlbumsCard.vue", () => ({
  default: { name: "DisabledAlbumsCard", template: "<div class='stub-albums' />" },
}));

import MediaView from "../MediaView.vue";

describe("MediaView", () => {
  it("renderiza os 4 cards de mídia empilhados", () => {
    const wrapper = mount(MediaView);
    expect(wrapper.find(".media-view").exists()).toBe(true);
    expect(wrapper.find(".stub-yt").exists()).toBe(true);
    expect(wrapper.find(".stub-yt-offline").exists()).toBe(true);
    expect(wrapper.find(".stub-ppt").exists()).toBe(true);
    expect(wrapper.find(".stub-ext").exists()).toBe(true);
  });

  it("álbuns ativos (desativar álbum, paridade Classic) vem por último", () => {
    const html = mount(MediaView).html();
    expect(html).toContain("stub-albums");
    expect(html.indexOf("stub-ext")).toBeLessThan(html.indexOf("stub-albums"));
  });

  it("ordem: YoutubeAccount, YoutubeOffline, PptEngine, ExternalPlayer", () => {
    const wrapper = mount(MediaView);
    const html = wrapper.html();
    expect(html.indexOf("stub-yt")).toBeLessThan(html.indexOf("stub-yt-offline"));
    expect(html.indexOf("stub-yt-offline")).toBeLessThan(html.indexOf("stub-ppt"));
    expect(html.indexOf("stub-ppt")).toBeLessThan(html.indexOf("stub-ext"));
  });
});
