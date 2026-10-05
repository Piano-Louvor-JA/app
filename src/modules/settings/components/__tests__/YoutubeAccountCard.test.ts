// @vitest-environment jsdom

import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("vue-i18n", () => ({
	useI18n: () => ({ t: (key: string) => key, locale: { value: "pt-BR" } }),
}));

const statusMock = vi.fn();
const loginMock = vi.fn();
const logoutMock = vi.fn();
const adblockStatusMock = vi.fn();
const adblockSetMock = vi.fn();

const originalLouvorja = window.louvorja;

function setBridge(bridge: unknown) {
	Object.defineProperty(window, "louvorja", {
		value: bridge,
		configurable: true,
		writable: true,
	});
}

import YoutubeAccountCard from "../YoutubeAccountCard.vue";

const i18nStub = {
	global: {
		config: {
			globalProperties: {
				$t: (key: string) => key,
			},
		},
	},
};

function mountCard() {
	return mount(YoutubeAccountCard, i18nStub as never);
}

describe("YoutubeAccountCard", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		setBridge(originalLouvorja);
	});

	it("sem bridge (web): mostra aviso desktopOnly e sem botões", async () => {
		setBridge(undefined);
		const wrapper = mountCard();
		await flushPromises();
		expect(wrapper.text()).toContain("settings.youtube.desktopOnly");
		expect(wrapper.find('[data-test="youtube-login-button"]').exists()).toBe(
			false,
		);
	});

	it("deslogado: mostra signedOut + botão Entrar com Google", async () => {
		setBridge({
			isElectron: true,
			ytAuth: { status: statusMock, login: loginMock, logout: logoutMock },
			ytAdblock: { status: adblockStatusMock, set: adblockSetMock },
		});
		statusMock.mockResolvedValue({ signedIn: false, premium: null });
		adblockStatusMock.mockResolvedValue({ enabled: false });

		const wrapper = mountCard();
		await flushPromises();

		expect(wrapper.find('[data-test="youtube-auth-status"]').text()).toContain(
			"settings.youtube.signedOut",
		);
		const btn = wrapper.find('[data-test="youtube-login-button"]');
		expect(btn.exists()).toBe(true);
	});

	it("logado com Premium: mostra premiumActive e botão Sair", async () => {
		setBridge({
			isElectron: true,
			ytAuth: { status: statusMock, login: loginMock, logout: logoutMock },
			ytAdblock: { status: adblockStatusMock, set: adblockSetMock },
		});
		statusMock.mockResolvedValue({ signedIn: true, premium: true });
		adblockStatusMock.mockResolvedValue({ enabled: false });

		const wrapper = mountCard();
		await flushPromises();

		expect(wrapper.find('[data-test="youtube-auth-status"]').text()).toContain(
			"settings.youtube.premiumActive",
		);
		expect(wrapper.find('[data-test="youtube-logout-button"]').exists()).toBe(
			true,
		);
		expect(wrapper.find('[data-test="youtube-login-button"]').exists()).toBe(
			false,
		);
	});

	it("logado sem Premium: mostra hint do adblock", async () => {
		setBridge({
			isElectron: true,
			ytAuth: { status: statusMock, login: loginMock, logout: logoutMock },
			ytAdblock: { status: adblockStatusMock, set: adblockSetMock },
		});
		statusMock.mockResolvedValue({ signedIn: true, premium: false });
		adblockStatusMock.mockResolvedValue({ enabled: false });

		const wrapper = mountCard();
		await flushPromises();

		expect(wrapper.text()).toContain("settings.youtube.notPremiumHint");
	});

	it("toggle adblock chama ytAdblock.set(true) e reflete estado", async () => {
		setBridge({
			isElectron: true,
			ytAuth: { status: statusMock, login: loginMock, logout: logoutMock },
			ytAdblock: { status: adblockStatusMock, set: adblockSetMock },
		});
		statusMock.mockResolvedValue({ signedIn: false, premium: null });
		adblockStatusMock.mockResolvedValue({ enabled: false });
		adblockSetMock.mockResolvedValue({ ok: true });

		const wrapper = mountCard();
		await flushPromises();

		const toggle = wrapper.find('[data-test="youtube-adblock-toggle"] input');
		expect((toggle.element as HTMLInputElement).checked).toBe(false);
		await toggle.setValue(true);
		await flushPromises();

		expect(adblockSetMock).toHaveBeenCalledWith(true);
		expect(
			(
				wrapper.find('[data-test="youtube-adblock-toggle"] input')
					.element as HTMLInputElement
			).checked,
		).toBe(true);
	});

	it("login atualiza status após retorno", async () => {
		setBridge({
			isElectron: true,
			ytAuth: { status: statusMock, login: loginMock, logout: logoutMock },
			ytAdblock: { status: adblockStatusMock, set: adblockSetMock },
		});
		statusMock
			.mockResolvedValueOnce({ signedIn: false, premium: null })
			.mockResolvedValueOnce({ signedIn: true, premium: true });
		loginMock.mockResolvedValue({ ok: true, signedIn: true });
		adblockStatusMock.mockResolvedValue({ enabled: false });

		const wrapper = mountCard();
		await flushPromises();

		await wrapper.find('[data-test="youtube-login-button"]').trigger("click");
		await flushPromises();

		expect(loginMock).toHaveBeenCalled();
		expect(wrapper.find('[data-test="youtube-auth-status"]').text()).toContain(
			"settings.youtube.premiumActive",
		);
	});

describe("gaps YoutubeAccountCard", () => {
	it("mount: ytAuth.status rejeita e ytAdblock ausente (L22 + 24 arm1)", async () => {
		setBridge({
			isElectron: true,
			ytAuth: { status: statusMock, login: loginMock, logout: logoutMock },
		});
		statusMock.mockRejectedValue(new Error("boom"));
		const w = mountCard();
		await flushPromises();
		expect(w.find('[data-test="youtube-auth-status"]').text()).toContain(
			"settings.youtube.signedOut",
		);
		w.unmount();
	});

	it("mount: adblock status rejeita → enabled false (L29)", async () => {
		setBridge({
			isElectron: true,
			ytAuth: { status: statusMock, login: loginMock, logout: logoutMock },
			ytAdblock: { status: adblockStatusMock, set: adblockSetMock },
		});
		statusMock.mockResolvedValue({ signedIn: true, premium: true });
		adblockStatusMock.mockRejectedValue(new Error("x"));
		const w = mountCard();
		await flushPromises();
		const tg = w.find('[data-test="youtube-adblock-toggle"]');
		expect(tg.exists()).toBe(true);
		w.unmount();
	});

	it("login: signedIn false e rejeição (L40 arm0, L44)", async () => {
		setBridge({
			isElectron: true,
			ytAuth: { status: statusMock, login: loginMock, logout: logoutMock },
		});
		statusMock.mockResolvedValue({ signedIn: false, premium: null });
		loginMock.mockResolvedValue({ signedIn: false });
		let w = mountCard();
		await flushPromises();
		await w.find('[data-test="youtube-login-button"]').trigger("click");
		await flushPromises();
		expect(w.text()).toContain("settings.youtube.signedOut");
		w.unmount();

		const err = vi.spyOn(console, "error").mockImplementation(() => {});
		statusMock.mockResolvedValue({ signedIn: false, premium: null });
		loginMock.mockRejectedValue(new Error("popup"));
		w = mountCard();
		await flushPromises();
		await w.find('[data-test="youtube-login-button"]').trigger("click");
		await flushPromises();
		expect(err).toHaveBeenCalled();
		err.mockRestore();
		w.unmount();
	});

	it("logout: happy path, rejeição e reentrância busy (L51-59)", async () => {
		setBridge({
			isElectron: true,
			ytAuth: { status: statusMock, login: loginMock, logout: logoutMock },
		});
		statusMock.mockResolvedValue({ signedIn: true, premium: true });
		let release!: (v?: unknown) => void;
		logoutMock.mockImplementationOnce(() => new Promise((r) => (release = r)));
		const w = mountCard();
		await flushPromises();
		const btn = w.find('[data-test="youtube-logout-button"]');
		const p1 = btn.trigger("click");
		// 2ª chamada durante busy → guard L51 arm1
		await w.find('[data-test="youtube-logout-button"]').trigger("click");
		release();
		await p1;
		await flushPromises();
		expect(logoutMock).toHaveBeenCalledTimes(1);
		w.unmount();

		const err = vi.spyOn(console, "error").mockImplementation(() => {});
		statusMock.mockResolvedValue({ signedIn: true, premium: true });
		logoutMock.mockRejectedValue(new Error("x"));
		const w2 = mountCard();
		await flushPromises();
		await w2.find('[data-test="youtube-logout-button"]').trigger("click");
		await flushPromises();
		expect(err).toHaveBeenCalled();
		err.mockRestore();
		w2.unmount();
	});

	it("toggle adblock: set ok false, rejeição e reentrância (L64/69 arm1/71)", async () => {
		setBridge({
			isElectron: true,
			ytAuth: { status: statusMock, login: loginMock, logout: logoutMock },
			ytAdblock: { status: adblockStatusMock, set: adblockSetMock },
		});
		statusMock.mockResolvedValue({ signedIn: true, premium: null });
		adblockStatusMock.mockResolvedValue({ enabled: false });
		adblockSetMock.mockResolvedValue({ ok: false });
		const w = mountCard();
		await flushPromises();
		await w.find('[data-test="youtube-adblock-toggle"] input').trigger("change");
		await flushPromises();
		// estado não mudou (ok false)
		expect(adblockSetMock).toHaveBeenCalledWith(true);
		w.unmount();

		const err = vi.spyOn(console, "error").mockImplementation(() => {});
		adblockStatusMock.mockResolvedValue({ enabled: false });
		adblockSetMock.mockRejectedValue(new Error("y"));
		const w2 = mountCard();
		await flushPromises();
		await w2.find('[data-test="youtube-adblock-toggle"] input').trigger("change");
		await flushPromises();
		expect(err).toHaveBeenCalled();
		err.mockRestore();
		w2.unmount();

		// reentrância: set pendente + 2º clique → guard L64 arm1
		adblockStatusMock.mockResolvedValue({ enabled: false });
		let rel!: (v?: unknown) => void;
		adblockSetMock.mockImplementationOnce(() => new Promise((r) => (rel = r)));
		const w3 = mountCard();
		await flushPromises();
		const p = w3.find('[data-test="youtube-adblock-toggle"] input').trigger("change");
		await w3.find('[data-test="youtube-adblock-toggle"] input').trigger("change");
		rel();
		await p;
		await flushPromises();
		expect(adblockSetMock).toHaveBeenCalledTimes(3);
		w3.unmount();
	});
});

	it("login reentrante durante pendência → guard L35 arm1", async () => {
		setBridge({
			isElectron: true,
			ytAuth: { status: statusMock, login: loginMock, logout: logoutMock },
		});
		statusMock.mockResolvedValue({ signedIn: false, premium: null });
		let relL!: (v?: unknown) => void;
		loginMock.mockImplementationOnce(() => new Promise((r) => (relL = r)));
		const w4 = mountCard();
		await flushPromises();
		const pL = w4.find('[data-test="youtube-login-button"]').trigger("click");
		await w4.find('[data-test="youtube-login-button"]').trigger("click");
		relL();
		await pL;
		await flushPromises();
		expect(loginMock).toHaveBeenCalledTimes(1);
		w4.unmount();
	});
});
