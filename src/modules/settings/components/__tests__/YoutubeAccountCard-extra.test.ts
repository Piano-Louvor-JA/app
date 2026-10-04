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
		vi.spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
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

	it("status() rejeita no mount -> fallback signedOut", async () => {
		setBridge({
			isElectron: true,
			ytAuth: { status: statusMock, login: loginMock, logout: logoutMock },
		});
		statusMock.mockRejectedValue(new Error("boom"));
		adblockStatusMock.mockResolvedValue({ enabled: false });

		const wrapper = mountCard();
		await flushPromises();

		expect(wrapper.find('[data-test="youtube-auth-status"]').text()).toContain(
			"settings.youtube.signedOut",
		);
	});

	it("ytAdblock.status() rejeita no mount -> adblock desligado", async () => {
		setBridge({
			isElectron: true,
			ytAuth: { status: statusMock, login: loginMock, logout: logoutMock },
			ytAdblock: { status: adblockStatusMock, set: adblockSetMock },
		});
		statusMock.mockResolvedValue({ signedIn: false, premium: null });
		adblockStatusMock.mockRejectedValue(new Error("boom"));

		const wrapper = mountCard();
		await flushPromises();

		expect(
			(
				wrapper.find('[data-test="youtube-adblock-toggle"] input')
					.element as HTMLInputElement
			).checked,
		).toBe(false);
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

	it("toggle adblock com set() rejeitando não muda o estado", async () => {
		setBridge({
			isElectron: true,
			ytAuth: { status: statusMock, login: loginMock, logout: logoutMock },
			ytAdblock: { status: adblockStatusMock, set: adblockSetMock },
		});
		statusMock.mockResolvedValue({ signedIn: false, premium: null });
		adblockStatusMock.mockResolvedValue({ enabled: false });
		adblockSetMock.mockRejectedValue(new Error("boom"));

		const wrapper = mountCard();
		await flushPromises();

		await wrapper
			.find('[data-test="youtube-adblock-toggle"] input')
			.setValue(true);
		await flushPromises();

		// DOM checked é mutado pelo setValue; o estado do componente é que decide
		const vm = wrapper.vm.$.setupState as { adblockEnabled: boolean };
		expect(vm.adblockEnabled).toBe(false);
	});

	it("toggle adblock com set() retornando ok:false não muda o estado", async () => {
		setBridge({
			isElectron: true,
			ytAuth: { status: statusMock, login: loginMock, logout: logoutMock },
			ytAdblock: { status: adblockStatusMock, set: adblockSetMock },
		});
		statusMock.mockResolvedValue({ signedIn: false, premium: null });
		adblockStatusMock.mockResolvedValue({ enabled: false });
		adblockSetMock.mockResolvedValue({ ok: false });

		const wrapper = mountCard();
		await flushPromises();

		await wrapper
			.find('[data-test="youtube-adblock-toggle"] input')
			.setValue(true);
		await flushPromises();

		const vm = wrapper.vm.$.setupState as { adblockEnabled: boolean };
		expect(vm.adblockEnabled).toBe(false);
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

	it("login que fecha sem logar (signedIn false) atualiza status", async () => {
		setBridge({
			isElectron: true,
			ytAuth: { status: statusMock, login: loginMock, logout: logoutMock },
		});
		statusMock
			.mockResolvedValueOnce({ signedIn: false, premium: null })
			.mockResolvedValueOnce({ signedIn: false, premium: null });
		loginMock.mockResolvedValue({ ok: true, signedIn: false });

		const wrapper = mountCard();
		await flushPromises();

		await wrapper.find('[data-test="youtube-login-button"]').trigger("click");
		await flushPromises();

		expect(statusMock).toHaveBeenCalledTimes(2);
		expect(
			wrapper.find('[data-test="youtube-login-button"]').attributes("disabled"),
		).toBeUndefined();
	});

	it("login rejeitando loga erro e libera o botão", async () => {
		setBridge({
			isElectron: true,
			ytAuth: { status: statusMock, login: loginMock, logout: logoutMock },
		});
		statusMock.mockResolvedValue({ signedIn: false, premium: null });
		loginMock.mockRejectedValue(new Error("popup blocked"));

		const wrapper = mountCard();
		await flushPromises();

		await wrapper.find('[data-test="youtube-login-button"]').trigger("click");
		await flushPromises();

		expect(console.error).toHaveBeenCalled();
		expect(
			wrapper.find('[data-test="youtube-login-button"]').attributes("disabled"),
		).toBeUndefined();
	});

	it("logout chama ytAuth.logout e refaz status", async () => {
		setBridge({
			isElectron: true,
			ytAuth: { status: statusMock, login: loginMock, logout: logoutMock },
		});
		statusMock
			.mockResolvedValueOnce({ signedIn: true, premium: true })
			.mockResolvedValueOnce({ signedIn: false, premium: null });
		logoutMock.mockResolvedValue({ ok: true });

		const wrapper = mountCard();
		await flushPromises();

		await wrapper.find('[data-test="youtube-logout-button"]').trigger("click");
		await flushPromises();

		expect(logoutMock).toHaveBeenCalled();
		expect(statusMock).toHaveBeenCalledTimes(2);
		// voltou pra deslogado -> botão login de volta
		expect(wrapper.find('[data-test="youtube-login-button"]').exists()).toBe(
			true,
		);
	});

	it("logout rejeitando libera o botão", async () => {
		setBridge({
			isElectron: true,
			ytAuth: { status: statusMock, login: loginMock, logout: logoutMock },
		});
		statusMock.mockResolvedValue({ signedIn: true, premium: true });
		logoutMock.mockRejectedValue(new Error("boom"));

		const wrapper = mountCard();
		await flushPromises();

		await wrapper.find('[data-test="youtube-logout-button"]').trigger("click");
		await flushPromises();

		expect(console.error).toHaveBeenCalled();
		expect(
			wrapper
				.find('[data-test="youtube-logout-button"]')
				.attributes("disabled"),
		).toBeUndefined();
	});

});
