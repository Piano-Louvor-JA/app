// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { setActivePinia, createPinia } from "pinia";

/**
 * useRemoteControl — liga o RemoteControlReceiver ao useMediaPlayer.
 * Ambos mockados: o receiver é uma classe fake gravável (start/stop/connected)
 * e o player é um objeto com vi.fn()s + refs de estado.
 * localStorage é limpo entre testes (chave remote.senderUrl).
 */
const playerMock = vi.hoisted(() => ({
  play: vi.fn(),
  pause: vi.fn(),
  requestClose: vi.fn(),
  setVolume: vi.fn(),
  seekTo: vi.fn(),
  isPlaying: { value: true },
  volume: { value: 42 },
  currentTimeSec: { value: 12 },
  durationSec: { value: 240 },
}));

vi.mock("../../media/composables/useMediaPlayer", () => ({
  useMediaPlayer: () => {
    setActivePinia(createPinia());
    return playerMock;
  },
}));

describe("useRemoteControl", () => {
  const receiverInstances = vi.hoisted(() => ({
    instances: [] as Array<{
      url: string;
      opts: Record<string, unknown>;
      start: ReturnType<typeof vi.fn>;
      stop: ReturnType<typeof vi.fn>;
      connected: boolean;
    }>,
  }));

  const FakeReceiver = vi.fn(
    class {
      start = vi.fn();
      stop = vi.fn();
      connected = false;
      constructor(
        public url: string,
        public opts: Record<string, unknown>,
      ) {
        receiverInstances.instances.push({
          url,
          opts,
          start: this.start,
          stop: this.stop,
          connected: false,
        });
      }
    }
  );

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    receiverInstances.instances.length = 0;
  });

  it("começa desligado e desconectado; senderUrl cai no default sem storage", async () => {
    vi.mock("../services/remote-control-receiver", () => ({
      RemoteControlReceiver: FakeReceiver,
    }));

    const { useRemoteControl } = await import("../useRemoteControl");
    const rc = useRemoteControl();

    expect(rc.enabled.value).toBe(false);
    expect(rc.connected.value).toBe(false);
    expect(rc.senderUrl.value).toBe("ws://192.168.1.10:7081/palco");
    expect(receiverInstances.instances.length).toBe(0);
  });

  it("senderUrl inicial vem do localStorage quando presente", async () => {
    localStorage.setItem("remote.senderUrl", "ws://10.0.0.5:7081/palco");
    vi.mock("../services/remote-control-receiver", () => ({
      RemoteControlReceiver: FakeReceiver,
    }));

    const { useRemoteControl } = await import("../useRemoteControl");
    const rc = useRemoteControl();

    expect(rc.senderUrl.value).toBe("ws://10.0.0.5:7081/palco");
  });

  it("enable true cria receiver, chama start e expõe connected via poll", async () => {
    vi.mock("../services/remote-control-receiver", () => ({
      RemoteControlReceiver: FakeReceiver,
    }));

    const { useRemoteControl } = await import("../useRemoteControl");
    const rc = useRemoteControl();

    rc.enabled.value = true;
    expect(receiverInstances.instances.length).toBe(1);
    expect(receiverInstances.instances[0]!.start).toHaveBeenCalled();
    expect(rc.senderUrl.value).toBe(receiverInstances.instances[0]!.url);

    // poll de 1s reflete receiver.connected
    vi.useFakeTimers();
    receiverInstances.instances[0]!.connected = true;
    vi.advanceTimersByTime(1100);
    expect(rc.connected.value).toBe(true);

    receiverInstances.instances[0]!.connected = false;
    vi.advanceTimersByTime(1100);
    expect(rc.connected.value).toBe(false);
    vi.useRealTimers();
  });

  it("enable false para o receiver e zera connected", async () => {
    vi.mock("../services/remote-control-receiver", () => ({
      RemoteControlReceiver: FakeReceiver,
    }));

    const { useRemoteControl } = await import("../useRemoteControl");
    const rc = useRemoteControl();

    rc.enabled.value = true;
    const first = receiverInstances.instances[0]!;
    expect(first.start).toHaveBeenCalled();

    rc.enabled.value = false;
    expect(first.stop).toHaveBeenCalled();
    expect(rc.connected.value).toBe(false);
  });

  it("setSenderUrl trima e persiste no localStorage", async () => {
    vi.mock("../services/remote-control-receiver", () => ({
      RemoteControlReceiver: FakeReceiver,
    }));

    const { useRemoteControl } = await import("../useRemoteControl");
    const rc = useRemoteControl();

    rc.setSenderUrl("  ws://192.168.0.99:7081/palco  ");
    await nextTick();

    expect(rc.senderUrl.value).toBe("ws://192.168.0.99:7081/palco");
    expect(localStorage.getItem("remote.senderUrl")).toBe(
      "ws://192.168.0.99:7081/palco",
    );
  });

  it("mudar URL com controle ligado reinicia o receiver apontando pra URL nova", async () => {
    vi.mock("../services/remote-control-receiver", () => ({
      RemoteControlReceiver: FakeReceiver,
    }));

    const { useRemoteControl } = await import("../useRemoteControl");
    const rc = useRemoteControl();

    rc.enabled.value = true;
    expect(receiverInstances.instances.length).toBe(1);

    rc.setSenderUrl("ws://172.16.0.1:7081/palco");
    await nextTick();

    expect(receiverInstances.instances.length).toBe(2);
    expect(receiverInstances.instances[0]!.stop).toHaveBeenCalled();
    expect(receiverInstances.instances[1]!.url).toBe("ws://172.16.0.1:7081/palco");
    expect(receiverInstances.instances[1]!.start).toHaveBeenCalled();
    expect(localStorage.getItem("remote.senderUrl")).toBe(
      "ws://172.16.0.1:7081/palco",
    );
  });

  it("ações do receiver delegam no player (play/pause/stop/volume/seek)", async () => {
    vi.mock("../services/remote-control-receiver", () => ({
      RemoteControlReceiver: FakeReceiver,
    }));

    const { useRemoteControl } = await import("../useRemoteControl");
    const rc = useRemoteControl();
    rc.enabled.value = true;

    const opts = receiverInstances.instances[0]!.opts as {
      actions: Record<string, (v?: unknown) => unknown>;
      getState: () => Record<string, unknown>;
    };

    opts.actions.play();
    expect(playerMock.play).toHaveBeenCalled();

    opts.actions.pause();
    expect(playerMock.pause).toHaveBeenCalled();

    opts.actions.stop();
    expect(playerMock.requestClose).toHaveBeenCalled();

    opts.actions.setVolume(77);
    expect(playerMock.setVolume).toHaveBeenCalledWith(77);

    opts.actions.seek(33);
    expect(playerMock.seekTo).toHaveBeenCalledWith(33);

    expect(opts.getState()).toEqual({
      playing: true,
      volume: 42,
      positionSec: 12,
      durationSec: 240,
    });
  });
});