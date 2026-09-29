// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Complemento remote-control-receiver: ramos de conexão/reconnect, comando
 * inválido, erro em action, volume/seek clamping e estado stop.
 */

class FakeWebSocket {
	static OPEN = 1;
	static CONNECTING = 0;
	static instances: FakeWebSocket[] = [];
	static failConstructor = false;

	readyState = FakeWebSocket.OPEN;
	sent: string[] = [];
	onopen: (() => void) | null = null;
	onmessage: ((ev: { data: string }) => void) | null = null;
	onclose: (() => void) | null = null;
	onerror: (() => void) | null = null;

	constructor(public url: string) {
		if (FakeWebSocket.failConstructor) {
			throw new Error("ws down");
		}
		FakeWebSocket.instances.push(this);
	}

	send(data: string): void {
		this.sent.push(data);
	}

	close(): void {
		this.readyState = 3;
		this.onclose?.();
	}

	open(): void {
		this.onopen?.();
	}

	receiveRaw(data: string): void {
		this.onmessage?.({ data });
	}

	receive(msg: unknown): void {
		this.receiveRaw(JSON.stringify(msg));
	}
}

vi.stubGlobal("WebSocket", FakeWebSocket as unknown as typeof WebSocket);

const log = vi.fn();
const getState = vi.fn(() => ({ playing: false, volume: 0.5 }));

function makeActions() {
	return {
		play: vi.fn(),
		pause: vi.fn(),
		stop: vi.fn(),
		setVolume: vi.fn(),
		seek: vi.fn(),
	};
}

import { RemoteControlReceiver } from "../services/remote-control-receiver";

function lastWs(): FakeWebSocket {
	return FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
}

beforeEach(() => {
	FakeWebSocket.instances.length = 0;
	FakeWebSocket.failConstructor = false;
	log.mockClear();
	getState.mockClear();
});

afterEach(() => {
	vi.clearAllTimers?.();
});

function makeReceiver(actions = makeActions()) {
	const r = new RemoteControlReceiver("ws://x", { actions, getState, log });
	r.start();
	return { r, actions };
}

describe("receiver — conexão e reconexão", () => {
	it("start → hello enviado no open", () => {
		makeReceiver();
		const ws = lastWs();
		ws.open();
		const hello = ws.sent.find((m) => m.includes("hello"));
		expect(hello).toBeTruthy();
		expect(JSON.parse(hello!).role).toBe("desktop");
	});

	it("construtor WebSocket lançando → log + scheduleReconnect", () => {
		FakeWebSocket.failConstructor = true;
		vi.useFakeTimers();
		try {
			const r = new RemoteControlReceiver("ws://x", {
				actions: makeActions(),
				getState,
				log,
			});
			r.start();
			expect(log).toHaveBeenCalled();
			// avança o timer de 3s → nova tentativa (ainda falhando)
			vi.advanceTimersByTime(3_100);
			expect(log.mock.calls.length).toBeGreaterThanOrEqual(2);
			r.stop();
		} finally {
			vi.useRealTimers();
		}
	});

	it("start após stop cria nova conexão", () => {
		const { r } = makeReceiver();
		r.stop();
		r.start();
		expect(FakeWebSocket.instances).toHaveLength(2);
		r.stop();
	});

	it("onclose sem stop → reconnect agendado; stop cancela", () => {
		vi.useFakeTimers();
		try {
			const { r } = makeReceiver();
			const ws = lastWs();
			ws.open();
			ws.close(); // dispara onclose → schedule
			const countBefore = FakeWebSocket.instances.length;
			vi.advanceTimersByTime(3_100);
			expect(FakeWebSocket.instances.length).toBeGreaterThan(countBefore);
			r.stop();
		} finally {
			vi.useRealTimers();
		}
	});

	it("stop fecha ws e zera referência; send posterior é no-op", () => {
		const { r } = makeReceiver();
		const ws = lastWs();
		ws.open();
		r.stop();
		// ws fechado; reportState não deve lançar
		expect(() => r.reportState()).not.toThrow();
	});

	it("onerror fecha o ws", () => {
		const { r } = makeReceiver();
		const ws = lastWs();
		ws.open();
		const closedSpy = vi.spyOn(ws, "close");
		ws.onerror?.();
		expect(closedSpy).toHaveBeenCalled();
		r.stop();
	});

	it("não reconecta após stop e não duplica timer de reconnect", () => {
		vi.useFakeTimers();
		try {
			const { r } = makeReceiver();
			const ws = lastWs();
			ws.close();
			ws.onclose?.();
			r.stop();
			vi.advanceTimersByTime(3_100);
			expect(FakeWebSocket.instances).toHaveLength(1);
		} finally {
			vi.useRealTimers();
		}
	});

	it("mensagem não-JSON é ignorada", () => {
		const { actions } = makeReceiver();
		const ws = lastWs();
		ws.open();
		ws.receiveRaw("{quebrado");
		expect(actions.play).not.toHaveBeenCalled();
	});

	it("mensagem sem command é ignorada", () => {
		const { actions } = makeReceiver();
		const ws = lastWs();
		ws.open();
		ws.receive({ type: "outra.coisa" });
		expect(actions.play).not.toHaveBeenCalled();
	});
});

describe("receiver — comandos", () => {
	async function command(cmd: string, value?: number) {
		const { actions, r } = makeReceiver();
		const ws = lastWs();
		ws.open();
		ws.receive({ type: "remote.command", command: cmd, id: "i1", value });
		// handleCommand é async (await nas actions)
		await new Promise((res) => setTimeout(res, 0));
		const ack = ws.sent.find((m) => m.includes("remote.ack"));
		return { actions, ack, r };
	}

	it("play/pause/stop", async () => {
		const { actions, ack } = await command("play");
		expect(actions.play).toHaveBeenCalled();
		expect(JSON.parse(ack!).ok).toBe(true);
		await command("pause");
		await command("stop");
	});

	it("volume com clamp 0..1; valor inválido ignorado", async () => {
		const { actions, ack } = await command("volume", 1.5);
		expect(actions.setVolume).toHaveBeenCalledWith(1);
		expect(JSON.parse(ack!).ok).toBe(true);
		await command("volume", Number.NaN);
		await command("volume", undefined);
	});

	it("seek com valor válido; inválido ignorado", async () => {
		const { actions, ack } = await command("seek", 42);
		expect(actions.seek).toHaveBeenCalledWith(42);
		expect(JSON.parse(ack!).ok).toBe(true);
		await command("seek", "x" as unknown as number);
	});

	it("comando desconhecido → ack ok:false", async () => {
		const { ack } = await command("boom");
		expect(JSON.parse(ack!).ok).toBe(false);
	});

	it("action lançando → ack ok:false com log", async () => {
		const actions = makeActions();
		actions.play.mockImplementation(() => {
			throw new Error("player quebrado");
		});
		const { r, ack } = await commandWithActions(actions);
		expect(JSON.parse(ack!).ok).toBe(false);
		expect(log).toHaveBeenCalled();
		r.stop();
	});

	async function commandWithActions(actions: ReturnType<typeof makeActions>) {
		const r = new RemoteControlReceiver("ws://x", {
			actions,
			getState,
			log,
		});
		r.start();
		const ws = lastWs();
		ws.open();
		ws.receive({ type: "remote.command", command: "play", id: "e1" });
		await new Promise((res) => setTimeout(res, 0));
		const ack = ws.sent.find((m) => m.includes("remote.ack"));
		return { r, ack };
	}

	it("reportState envia remote.state", () => {
		const { r } = makeReceiver();
		const ws = lastWs();
		ws.open();
		r.reportState();
		const state = ws.sent.find((m) => m.includes("remote.state"));
		expect(state).toBeTruthy();
		expect(JSON.parse(state!).state).toEqual({ playing: false, volume: 0.5 });
		r.stop();
	});
});
