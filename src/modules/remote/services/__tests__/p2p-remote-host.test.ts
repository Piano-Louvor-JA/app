// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { P2pRemoteHost } from "../p2p-remote-host";

/**
 * P2pRemoteHost — WebRTC 2-QR (offer → answer → DataChannel).
 * RTCPeerConnection/RTCDataChannel são GLOBAIS no módulo (sem import),
 * então o teste stuba globalThis com fakes controláveis: ICE gathering
 * instantâneo/completo, DataChannel com readyState manipulável.
 */

class FakeDataChannel {
  readyState = "connecting";
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;

  send(data: string) {
    this.sent.push(data);
  }

  close = vi.fn(() => {
    this.readyState = "closed";
    this.onclose?.();
  });

  openIt() {
    this.readyState = "open";
    this.onopen?.();
  }

  receive(data: unknown) {
    this.onmessage?.({
      data: typeof data === "string" ? data : JSON.stringify(data),
    });
  }
}

class FakePC {
  static last: FakePC | null = null;
  static lastChannel: FakeDataChannel | null = null;

  iceGatheringState = "complete";
  localDescription: RTCSessionDescriptionInit | null = {
    type: "offer",
    sdp: "sdp-offer",
  };
  createDataChannel = vi.fn(() => {
    FakePC.lastChannel = new FakeDataChannel();
    return FakePC.lastChannel;
  });
  createOffer = vi.fn(async () => ({ type: "offer", sdp: "sdp-novo" }));
  setLocalDescription = vi.fn(async () => {});
  setRemoteDescription = vi.fn(async () => {});
  addEventListener = vi.fn();
  removeEventListener = vi.fn();
  close = vi.fn();

  constructor() {
    FakePC.last = this;
  }
}

/** PC cujo ICE gathering nunca completa sozinho (teste de evento/timeout). */
class SlowIcePC extends FakePC {
  override iceGatheringState = "new";

  /** Dispara manualmente o listener registrado pra icegatheringstatechange. */
  fireIceChange() {
    const call = this.addEventListener.mock.calls.find(
      ([ev]) => ev === "icegatheringstatechange",
    );
    (call?.[1] as () => void)();
  }
}

beforeEach(() => {
  vi.stubGlobal("RTCPeerConnection", FakePC);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("P2pRemoteHost", () => {
  it("createOffer cria pc + channel, espera ICE e retorna SDP em JSON", async () => {
    const host = new P2pRemoteHost();

    const offer = await host.createOffer();

    expect(FakePC.last).toBeTruthy();
    expect(FakePC.last!.createDataChannel).toHaveBeenCalledWith(
      "louvorja-remote",
      { ordered: true },
    );
    expect(JSON.parse(offer)).toEqual({ type: "offer", sdp: "sdp-offer" });
  });

  it("createOffer de uma segunda vez fecha o pc anterior (cleanup)", async () => {
    const host = new P2pRemoteHost();
    await host.createOffer();
    const first = FakePC.last!;

    await host.createOffer();

    expect(first.close).toHaveBeenCalled();
  });

  it("waitForIce resolve no evento icegatheringstatechange quando ICE demora", async () => {
    vi.stubGlobal("RTCPeerConnection", SlowIcePC);
    const host = new P2pRemoteHost();

    const pending = host.createOffer();
    // ICE ainda "new": microtasks esgotam sem resolver
    await Promise.resolve();
    await Promise.resolve();
    const pc = FakePC.last as SlowIcePC;
    pc.iceGatheringState = "complete";
    pc.fireIceChange();

    await expect(pending).resolves.toBeTypeOf("string");
    expect(pc.removeEventListener).toHaveBeenCalledWith(
      "icegatheringstatechange",
      expect.any(Function),
    );
  });

  it("waitForIce ignora eventos enquanto ICE não está completo", async () => {
    vi.stubGlobal("RTCPeerConnection", SlowIcePC);
    const host = new P2pRemoteHost();

    const pending = host.createOffer();
    await Promise.resolve();
    await Promise.resolve();
    const pc = FakePC.last as SlowIcePC;
    pc.fireIceChange();
    expect(pc.removeEventListener).not.toHaveBeenCalled();
    pc.iceGatheringState = "complete";
    pc.fireIceChange();

    await expect(pending).resolves.toBeTypeOf("string");
  });

  it("waitForIce cai no timeout de 5s quando ICE nunca completa", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("RTCPeerConnection", SlowIcePC);
    const host = new P2pRemoteHost();

    const pending = host.createOffer();
    await vi.advanceTimersByTimeAsync(5000);

    await expect(pending).resolves.toBeTypeOf("string");
  });

  it("acceptAnswer sem offer prévio retorna false (pc null)", async () => {
    const host = new P2pRemoteHost();

    await expect(
      host.acceptAnswer('{"type":"answer","sdp":"x"}'),
    ).resolves.toBe(false);
  });

  it("acceptAnswer aplica answer válido no remote description", async () => {
    const host = new P2pRemoteHost();
    await host.createOffer();

    await expect(
      host.acceptAnswer('{"type":"answer","sdp":"sdp-answer"}'),
    ).resolves.toBe(true);
    expect(FakePC.last!.setRemoteDescription).toHaveBeenCalledWith({
      type: "answer",
      sdp: "sdp-answer",
    });
  });

  it("acceptAnswer com JSON inválido retorna false sem quebrar", async () => {
    const host = new P2pRemoteHost();
    await host.createOffer();

    await expect(host.acceptAnswer("nao-e-json")).resolves.toBe(false);
  });

  it("send só transmite com channel open", async () => {
    const host = new P2pRemoteHost();
    await host.createOffer();
    const ch = FakePC.lastChannel!;

    // ainda connecting: descarta
    host.send({ tipo: "noop" });
    expect(ch.sent).toEqual([]);

    ch.openIt();
    host.send({ tipo: "cmd", acao: "play" });
    expect(JSON.parse(ch.sent[0]!)).toEqual({ tipo: "cmd", acao: "play" });
  });

  it("isOpen reflete o readyState do channel", async () => {
    const host = new P2pRemoteHost();

    // sem channel: false
    expect(new P2pRemoteHost().isOpen).toBe(false);

    await host.createOffer();
    expect(host.isOpen).toBe(false);

    FakePC.lastChannel!.openIt();
    expect(host.isOpen).toBe(true);
  });

  it("callbacks onOpen/onClose/onMessage ligados ao channel", async () => {
    const host = new P2pRemoteHost();
    const onOpen = vi.fn();
    const onClose = vi.fn();
    const onMessage = vi.fn();
    host.onOpen = onOpen;
    host.onClose = onClose;
    host.onMessage = onMessage;

    await host.createOffer();
    const ch = FakePC.lastChannel!;

    ch.openIt();
    expect(onOpen).toHaveBeenCalled();

    ch.receive({ tipo: "cmd" });
    expect(onMessage).toHaveBeenCalledWith({ tipo: "cmd" });

    // payload não-JSON é ignorado, não explode
    expect(() => ch.receive("<<<lixo>>>")).not.toThrow();
    expect(onMessage).toHaveBeenCalledTimes(1);

    ch.close();
    expect(onClose).toHaveBeenCalled();
  });

  it("destroy fecha channel e pc; dupla chamada é segura", async () => {
    const host = new P2pRemoteHost();
    await host.createOffer();
    const pc = FakePC.last!;
    const ch = FakePC.lastChannel!;

    host.destroy();
    expect(ch.close).toHaveBeenCalled();
    expect(pc.close).toHaveBeenCalled();

    // sem referências vivas: não explode
    expect(() => host.destroy()).not.toThrow();
  });
});