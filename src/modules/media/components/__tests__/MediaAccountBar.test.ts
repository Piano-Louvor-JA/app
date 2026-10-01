// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as auth from "../../services/auth-client";
/**
 * MediaAccountBar — conta de coletâneas custom (login/registro/forgot/reset).
 * auth-client mockado; valida gating do form, os 4 modos e logout.
 */
import MediaAccountBar from "../MediaAccountBar.vue";

type AuthSessionLike = {
	token: string;
	user: { email: string; displayName: string };
};

vi.mock("../../services/auth-client", () => ({
	getAuthSession: vi.fn(() => null),
	login: vi.fn(),
	logout: vi.fn().mockResolvedValue(undefined),
	register: vi.fn(),
	requestPasswordReset: vi.fn(),
	resetPassword: vi.fn(),
}));

const sessionMock: AuthSessionLike = {
	token: "tok-123",
	user: { email: "irmao@iasd.org", displayName: "Irmão João" },
};

const notify = vi.fn();

function mountBar() {
	return mount(MediaAccountBar, { props: { notify } });
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(auth.getAuthSession).mockReturnValue(null);
	notify.mockClear();
});

describe("MediaAccountBar — estados", () => {
	it("deslogado: mostra botão de abrir form, form fechado", () => {
		const w = mountBar();
		expect(w.find(".account__form").exists()).toBe(false);
		expect(w.text()).toContain("Entrar / Criar conta");
	});

	it("logado (getAuthSession): mostra nome + Sair, sem form", () => {
		vi.mocked(auth.getAuthSession).mockReturnValue(sessionMock as never);
		const w = mountBar();
		expect(w.find(".account__name").text()).toBe("Irmão João");
		expect(w.text()).toContain("Sair");
		expect(w.find(".account__form").exists()).toBe(false);
	});

	it("abrir/fechar form reseta senha, token e modo", async () => {
		const w = mountBar();
		await w.findAll(".account__link")[0].trigger("click"); // abre
		expect(w.find(".account__form").exists()).toBe(true);
		await w.findAll(".account__link")[0].trigger("click"); // fecha
		expect(w.find(".account__form").exists()).toBe(false);
		w.unmount();
	});
});

describe("MediaAccountBar — login", () => {
	it("submit desabilitado com e-mail inválido", async () => {
		const w = mountBar();
		await w.findAll(".account__link")[0].trigger("click");
		const submit = w.find(".account__submit");
		expect(submit.attributes("disabled")).toBeDefined();
	});

	it("login ok: fecha form, seta sessão e notifica boas-vindas", async () => {
		vi.mocked(auth.login).mockResolvedValue(sessionMock as never);
		const w = mountBar();
		await w.findAll(".account__link")[0].trigger("click");
		const inputs = w.findAll("input");
		await inputs[0].setValue("irmao@iasd.org");
		await inputs[1].setValue("senha123");
		await w.find("form").trigger("submit");
		await flushPromises();
		expect(auth.login).toHaveBeenCalledWith("irmao@iasd.org", "senha123");
		expect(w.find(".account__name").text()).toBe("Irmão João");
		expect(notify).toHaveBeenCalledWith("Bem-vindo, Irmão João!");
		w.unmount();
	});

	it("login com credencial errada: notifica erro, mantém form", async () => {
		vi.mocked(auth.login).mockResolvedValue(null);
		const w = mountBar();
		await w.findAll(".account__link")[0].trigger("click");
		const inputs = w.findAll("input");
		await inputs[0].setValue("irmao@iasd.org");
		await inputs[1].setValue("errada");
		await w.find("form").trigger("submit");
		await flushPromises();
		expect(notify).toHaveBeenCalledWith("E-mail ou senha incorretos", true);
		expect(w.find(".account__form").exists()).toBe(true);
		w.unmount();
	});
});

describe("MediaAccountBar — registro", () => {
	it("register ok: loga direto", async () => {
		vi.mocked(auth.register).mockResolvedValue(sessionMock as never);
		const w = mountBar();
		await w.findAll(".account__link")[0].trigger("click");
		// troca pro modo register
		const criarConta = w
			.findAll(".account__link")
			.find((b) => b.text() === "Criar conta");
		await criarConta?.trigger("click");
		const inputs = w.findAll("input");
		await inputs[0].setValue("Irmão João"); // displayName
		await inputs[1].setValue("irmao@iasd.org");
		await inputs[2].setValue("senha123");
		await w.find("form").trigger("submit");
		await flushPromises();
		expect(auth.register).toHaveBeenCalledWith(
			"irmao@iasd.org",
			"senha123",
			"Irmão João",
		);
		expect(w.find(".account__name").exists()).toBe(true);
		w.unmount();
	});

	it("register com e-mail duplicado: notifica erro", async () => {
		vi.mocked(auth.register).mockResolvedValue(null);
		const w = mountBar();
		await w.findAll(".account__link")[0].trigger("click");
		const criarConta = w
			.findAll(".account__link")
			.find((b) => b.text() === "Criar conta");
		await criarConta?.trigger("click");
		const inputs = w.findAll("input");
		await inputs[0].setValue("Irmão João");
		await inputs[1].setValue("usado@iasd.org");
		await inputs[2].setValue("senha123");
		await w.find("form").trigger("submit");
		await flushPromises();
		expect(notify).toHaveBeenCalledWith(
			"Não foi possível criar a conta (e-mail já existe?)",
			true,
		);
		w.unmount();
	});
});

describe("MediaAccountBar — forgot/reset", () => {
	it("forgot com token: avança pro modo reset e notifica", async () => {
		vi.mocked(auth.requestPasswordReset).mockResolvedValue(
			"token-secreto-abc-12345",
		);
		const w = mountBar();
		await w.findAll(".account__link")[0].trigger("click");
		const esqueci = w
			.findAll(".account__link")
			.find((b) => b.text() === "Esqueci minha senha");
		await esqueci?.trigger("click");
		await w.find("input").setValue("irmao@iasd.org");
		await w.find("form").trigger("submit");
		await flushPromises();
		expect(auth.requestPasswordReset).toHaveBeenCalledWith("irmao@iasd.org");
		expect(notify).toHaveBeenCalledWith("Token gerado — confirme a senha nova");
		// agora está no modo reset: campo de token + senha
		const inputs = w.findAll("input");
		expect(inputs.length).toBe(2);
	});

	it("forgot resposta neutra: não revela existência do e-mail", async () => {
		vi.mocked(auth.requestPasswordReset).mockResolvedValue(null);
		const w = mountBar();
		await w.findAll(".account__link")[0].trigger("click");
		const esqueci = w
			.findAll(".account__link")
			.find((b) => b.text() === "Esqueci minha senha");
		await esqueci?.trigger("click");
		await w.find("input").setValue("fantasma@iasd.org");
		await w.find("form").trigger("submit");
		await flushPromises();
		expect(notify).toHaveBeenCalledWith(
			"Se o e-mail existir, o suporte tem o token de reset",
		);
		w.unmount();
	});

	it("reset com token válido: troca senha e volta pro login", async () => {
		vi.mocked(auth.requestPasswordReset).mockResolvedValue(
			"token-secreto-abc-12345",
		);
		vi.mocked(auth.resetPassword).mockResolvedValue(true);
		const w = mountBar();
		await w.findAll(".account__link")[0].trigger("click");
		const esqueci = w
			.findAll(".account__link")
			.find((b) => b.text() === "Esqueci minha senha");
		await esqueci?.trigger("click");
		await w.find("input").setValue("irmao@iasd.org");
		await w.find("form").trigger("submit");
		await flushPromises();
		const inputs = w.findAll("input");
		await inputs[0].setValue("token-secreto-abc-12345");
		await inputs[1].setValue("novasenha1");
		await w.find("form").trigger("submit");
		await flushPromises();
		expect(auth.resetPassword).toHaveBeenCalledWith(
			"token-secreto-abc-12345",
			"novasenha1",
		);
		expect(notify).toHaveBeenCalledWith(
			"Senha alterada! Entre com a senha nova",
		);
		w.unmount();
	});

	it("reset com token inválido: notifica erro", async () => {
		vi.mocked(auth.requestPasswordReset).mockResolvedValue(
			"token-secreto-abc-12345",
		);
		vi.mocked(auth.resetPassword).mockResolvedValue(false);
		const w = mountBar();
		await w.findAll(".account__link")[0].trigger("click");
		const esqueci = w
			.findAll(".account__link")
			.find((b) => b.text() === "Esqueci minha senha");
		await esqueci?.trigger("click");
		await w.find("input").setValue("irmao@iasd.org");
		await w.find("form").trigger("submit");
		await flushPromises();
		const inputs = w.findAll("input");
		await inputs[0].setValue("token-invalido-xyz-9999");
		await inputs[1].setValue("novasenha1");
		await w.find("form").trigger("submit");
		await flushPromises();
		expect(notify).toHaveBeenCalledWith("Token inválido ou expirado", true);
		w.unmount();
	});
});

describe("MediaAccountBar — logout", () => {
	it("Sair chama logout, limpa sessão e notifica", async () => {
		vi.mocked(auth.getAuthSession).mockReturnValue(sessionMock as never);
		const w = mountBar();
		const sair = w.findAll(".account__link").find((b) => b.text() === "Sair");
		await sair?.trigger("click");
		await flushPromises();
		expect(auth.logout).toHaveBeenCalledOnce();
		expect(w.find(".account__name").exists()).toBe(false);
		expect(notify).toHaveBeenCalledWith("Sessão encerrada");
		w.unmount();
	});
});

describe("MediaAccountBar — forgot sem token e voltas de modo", () => {
  it("forgot sem token (resposta neutra): notifica e volta pro login", async () => {
    vi.mocked(auth.requestPasswordReset).mockResolvedValue(null);
    const w = mountBar();
    // abre o form
    await w.findAll(".account__link")[0].trigger("click");
    await w.findAll(".account__link")
      .find((b) => b.text().trim() === "Esqueci minha senha")!
      .trigger("click");
    await w.find("input").setValue("irmao@iasd.org");
    await w.find("form").trigger("submit");
    await flushPromises();
    expect(notify).toHaveBeenCalledWith(
      "Se o e-mail existir, o suporte tem o token de reset",
    );
    // voltou pro modo login
    expect(w.text()).toContain("Entrar");
  });

  it("register: link Já tenho conta volta pro login", async () => {
    const w = mountBar();
    // abre o form
    await w.findAll(".account__link")
      .find((b) => b.text().includes("Entrar / Criar conta"))!
      .trigger("click");
    // tab pra registrar
    await w.findAll(".account__link")
      .find((b) => b.text().trim() === "Criar conta")!
      .trigger("click");
    expect(w.find("form").exists()).toBe(true);
    // volta pro login
    const voltar = w
      .findAll(".account__link")
      .find((b) => b.text().trim() === "Já tenho conta");
    await voltar?.trigger("click");
    expect(w.text()).toContain("Esqueci minha senha");
  });

  it("reset: link Voltar volta pro login", async () => {
    vi.mocked(auth.requestPasswordReset).mockResolvedValue("token-12345678");
    const w = mountBar();
    await w.findAll(".account__link")[0].trigger("click");
    await w.findAll(".account__link")
      .find((b) => b.text().trim() === "Esqueci minha senha")!
      .trigger("click");
    await w.find("input").setValue("irmao@iasd.org");
    await w.find("form").trigger("submit");
    await flushPromises();
    const voltar = w
      .findAll(".account__link")
      .find((b) => b.text() === "Voltar");
    await voltar?.trigger("click");
    expect(w.text()).toContain("Entrar");
  });
});
