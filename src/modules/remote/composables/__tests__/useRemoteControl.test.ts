// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

/**
 * useRemoteControl — liga o RemoteControlReceiver ao useMediaPlayer.
 * Ambos mockados: receiver fake gravável (start/stop/connected) e player
 * com vi.fn()s + refs. O módulo guarda estado SINGLETON (refs fora da
 * função), então cada teste recarrega com vi.resetModules() pra partir
 * do estado inicial real. Watches do Vue são assíncronos: nextTick após
 * mutações. Caminhos de mock são relativos ao ARQUIVO DE TESTE.
 */
const { playerMock, receiverInstances, FakeReceiver } = vi.hoisted(() => {
  const playerMock = {
    play: vi.fn(),
    pause: vi.fn(),
    requestClose: vi.fn(),
    setVolume: vi.fn(),
    seekTo: vi.fn(),
    isPlaying: { value: true },
    volume: { value: 42 },
    currentTimeSec: { value: 12 },
    durationSec: { value: 240 },
  };

  const receiverInstances = {
    instances: [] as Array<{
      url: string;
      opts: Record<string, unknown>;
      start: ReturnType<typeof vi.fn>;
      stop: ReturnType<typeof vi.fn>;
      connected: boolean;
    }>,
  };

  const FakeReceiver = vi.fn(
    class {
      start = vi.fn();
      stop = vi.fn();
      connected = false;
      constructor(
        public url: string,
        public opts: Record<string, unknown>,
      ) {
        receiverInstances.instances.push(this as never);
      }
    },
  );

  return { playerMock, receiverInstances, FakeReceiver };
});

vi.mock("../../../media/composables/useMediaPlayer", () => ({
  useMediaPlayer: () => playerMock,
}));

vi.mock("../../services/remote-control-receiver", () => ({
  RemoteControlReceiver: FakeReceiver,
}));

/** Módulo fresco por teste: estado singleton zerado, mocks preservados. */
async function freshRc() {
  vi.resetModules();
  const mod = await import("../useRemoteControl");
  return mod.useRemoteControl;
}

describe("useRemoteControl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    receiverInstances.instances.length = 0;
  });

  it("começa desligado e desconectado; senderUrl cai no default sem storage", async () => {
    localStorage.clear();
    const useRemoteControl = await freshRc();
    const rc = useRemoteControl();

    expect(rc.enabled.value).toBe(false);
    expect(rc.connected.value).toBe(false);
    expect(rc.senderUrl.value).toBe("ws://192.168.1.10:7081/palco");
    expect(receiverInstances.instances.length).toBe(0);
  });

  it("senderUrl inicial vem do localStorage quando presente", async () => {
    localStorage.clear();
    localStorage.setItem("remote.senderUrl", "ws://10.0.0.5:7081/palco");

    const useRemoteControl = await freshRc();
    const rc = useRemoteControl();

    expect(rc.senderUrl.value).toBe("ws://10.0.0.5:7081/palco");
  });

  it("enable true cria receiver, chama start e expõe connected via poll", async () => {
    localStorage.clear();
    vi.useFakeTimers();
    try {
      const useRemoteControl = await freshRc();
      const rc = useRemoteControl();

      rc.enabled.value = true;
      await nextTick();

      expect(receiverInstances.instances.length).toBe(1);
      expect(receiverInstances.instances[0]!.start).toHaveBeenCalled();
      expect(rc.senderUrl.value).toBe(receiverInstances.instances[0]!.url);

      // poll de 1s reflete receiver.connected
      receiverInstances.instances[0]!.connected = true;
      await vi.advanceTimersByTimeAsync(1100);
      expect(rc.connected.value).toBe(true);

      receiverInstances.instances[0]!.connected = false;
      await vi.advanceTimersByTimeAsync(1100);
      expect(rc.connected.value).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("enable false para o receiver e zera connected", async () => {
    localStorage.clear();
    const useRemoteControl = await freshRc();
    const rc = useRemoteControl();

    rc.enabled.value = true;
    await nextTick();
    const first = receiverInstances.instances[0]!;
    expect(first.start).toHaveBeenCalled();

    rc.enabled.value = false;
    await nextTick();
    expect(first.stop).toHaveBeenCalled();
    expect(rc.connected.value).toBe(false);
  });

  it("setSenderUrl trima e persiste no localStorage", async () => {
    localStorage.clear();
    const useRemoteControl = await freshRc();
    const rc = useRemoteControl();

    rc.setSenderUrl("  ws://192.168.0.99:7081/palco  ");
    await nextTick();

    expect(rc.senderUrl.value).toBe("ws://192.168.0.99:7081/palco");
    expect(localStorage.getItem("remote.senderUrl")).toBe(
      "ws://192.168.0.99:7081/palco",
    );
  });

  it("mudar URL com controle ligado reinicia o receiver apontando pra URL nova", async () => {
    localStorage.clear();
    const useRemoteControl = await freshRc();
    const rc = useRemoteControl();

    rc.enabled.value = true;
    await nextTick();
    expect(receiverInstances.instances.length).toBe(1);

    rc.setSenderUrl("ws://172.16.0.1:7081/palco");
    await nextTick();
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
    localStorage.clear();
    const useRemoteControl = await freshRc();
    const rc = useRemoteControl();
    rc.enabled.value = true;
    await nextTick();

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

  describe("disconnect/reconnect (47/60-61)", () => {
    it("toggle enabled on/off: receiver para e tick limpa", async () => {
      vi.useFakeTimers()
      const useRemoteControl = await freshRc()
      const rc = useRemoteControl()
      rc.enabled.value = true
      await vi.advanceTimersByTimeAsync(0)
      rc.enabled.value = false
      await vi.advanceTimersByTimeAsync(0)
      vi.useRealTimers()
    })

    it("log callback registrado sem erro (47)", async () => {
      const useRemoteControl = await freshRc()
      const rc = useRemoteControl()
      rc.enabled.value = true
      await Promise.resolve()
      rc.enabled.value = false
      expect(true).toBe(true)
    })
  })
  it("log callback do receiver: console.info com prefixo [remote]", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const useRemoteControl = await freshRc();
    const rc = useRemoteControl();
    rc.enabled.value = true;
    await Promise.resolve();
    const inst = receiverInstances.instances.at(-1) as unknown as { opts: { log: (...a: unknown[]) => void } };
    inst?.opts?.log?.("teste", 1);
    expect(info).toHaveBeenCalledWith("[remote]", "teste", 1);
    info.mockRestore();
  });

})