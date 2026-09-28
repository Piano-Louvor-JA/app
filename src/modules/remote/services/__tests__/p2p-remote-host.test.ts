// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { RTCPeerConnection, RTCDataChannel } from "mock-rtc";

/**
 * P2pRemoteHost — serviço P2P usando RTCPeerConnection + DataChannel para controle remoto.
 * Simula o fluxo completo de oferta/resposta com QR codes, sem sinais externos.
 */
const mockPc = vi.fn();
const mockChannel = vi.fn();
vi.mock("mock-rtc", () => ({
  RTCPeerConnection: mockPc,
  RTCDataChannel: mockChannel,
}));

describe("P2pRemoteHost", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("cria novo peer connection e data channel ao fazer offer", async () => {
    const { P2pRemoteHost } = await import("../p2p-remote-host");
    const host = new P2pRemoteHost();

    const offer = await host.createOffer();
    expect(offer).toBeTypeOf("string");
    expect(mockPc).toHaveBeenCalled();
    expect(mockChannel).toHaveBeenCalled();
  });

  it("aceita answer JSON e faz parse", async () => {
    const { P2pRemoteHost } = await import("../p2p-remote-host");
    const host = new P2pRemoteHost();

    await host.createOffer();
    const success = await host.acceptAnswer('{ "type": "answer", "sdp": "mock-answer" }');
    expect(success).toBe(true);
  });

  it("falha ao aceitar answer inválido", async () => {
    const { P2pRemoteHost } = await import("../p2p-remote-host");
    const host = new P2pRemoteHost();

    await host.createOffer();
    const success = await host.acceptAnswer("invalid-json");
    expect(success).toBe(false);
  });

  it("destrói conexão e libera recursos", async () => {
    const { P2pRemoteHost } = await import("../p2p-remote-host");
    const host = new P2pRemoteHost();

    await host.createOffer();
    host.destroy();
    expect(host.isOpen).toBe(false);
  });
});