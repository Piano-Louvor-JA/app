// @vitest-environment jsdom
// app#331 A1: importar .slja DIRETO no diálogo do item de música — sem
// login (local) e logado (API custom). O draft recebe musicId + nome +
// duração num ÚNICO patch (race de props stale = bug real da web#174) e
// o evento pro pai recarrega o catálogo ANTES da seleção valer.

import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { importMock, authSessionMock, fetchMock } = vi.hoisted(() => ({
	importMock: vi.fn(),
	authSessionMock: vi.fn<() => unknown>(() => null),
	fetchMock: vi.fn(),
}));

vi.mock("vue-i18n", () => ({
	useI18n: () => ({ t: (key: string) => key, locale: { value: "pt-BR" } }),
}));

// REGRA do gauntlet: vi.mock resolve relativo AO ARQUIVO DE TESTE —
// components/__tests__/ precisa de UM ../ a mais que o import do componente.
vi.mock("../../services/import-slja-to-liturgy", () => ({
	importSljaAsLiturgyMusic: importMock,
}));

vi.mock("@modules/media/services/auth-client", () => ({
	getAuthSession: authSessionMock,
	authHeaders: () => ({}),
}));

vi.stubGlobal("fetch", fetchMock);

import type { LiturgyItemDraft } from "../../types/liturgy";
import { DEFAULT_LITURGY_ITEM_DRAFT } from "../../types/liturgy";
import LiturgyItemDialog from "../LiturgyItemDialog.vue";

function makeDraft(partial: Partial<LiturgyItemDraft> = {}): LiturgyItemDraft {
	return {
		...DEFAULT_LITURGY_ITEM_DRAFT,
		type: "music",
		...partial,
	};
}

function mountDialog(draft: LiturgyItemDraft) {
	return mount(LiturgyItemDialog, {
		props: {
			open: true,
			draft,
			isEditing: false,
			isValid: true,
			categoryOptions: [],
			complementaryTitleSuggestions: [],
			musicOptions: [],
			musicQuery: "",
			musicCatalogEmpty: false,
			selectedMusic: null,
		},
		global: {
			config: {
				globalProperties: { $t: (key: string) => key },
			},
		},
		// Teleport to="body": attachTo pra encontrar o conteúdo no DOM real
		attachTo: document.body,
	});
}

function sljaInputElement(): HTMLInputElement {
	// Conteúdo teleportado vive fora do wrapper — query no document.body e
	// dispatch nativo (padrão do repo pra Teleport).
	const input = document.body.querySelector(
		'input[data-testid="slja-file-input"]',
	) as HTMLInputElement | null;
	if (!input) throw new Error("slja-file-input não renderizado");
	return input;
}

/** Fake de File: o handler só usa arrayBuffer() + name (jsdom 25 não tem
 * File.arrayBuffer). Objeto puro evita brigar com getters do jsdom. */
function makeFakeFile(): File {
	return {
		name: "x.slja",
		arrayBuffer: async () => new ArrayBuffer(1),
	} as unknown as File;
}

async function importFile(
	_wrapper: ReturnType<typeof mountDialog>,
	imported: {
		musicId: number;
		displayMusicId: number;
		name: string;
		durationMs: number;
		local: boolean;
	},
) {
	importMock.mockResolvedValueOnce(imported);
	const input = sljaInputElement();
	Object.defineProperty(input, "files", {
		value: [makeFakeFile()],
		configurable: true,
	});
	input.dispatchEvent(new Event("change"));
	await flushPromises();
}

describe("LiturgyItemDialog — importar .slja no item de música (app#331)", () => {
	beforeEach(() => {
		localStorage.clear();
		importMock.mockReset();
		fetchMock.mockReset();
		fetchMock.mockRejectedValue(new Error("REDE BLOQUEADA no teste"));
		authSessionMock.mockReset();
		authSessionMock.mockReturnValue(null);
	});

	afterEach(() => {
		// Teleport anexa ao document.body — limpa entre testes
		document.body.innerHTML = "";
	});

	it("deslogado: draft recebe musicId local CRU + nome + duração num único patch", async () => {
		const wrapper = mountDialog(makeDraft());
		await importFile(wrapper, {
			musicId: -3,
			displayMusicId: -3,
			name: "Missao Para Todos",
			durationMs: 91_000,
			local: true,
		});

		const drafts = wrapper.emitted("update:draft");
		expect(drafts).toHaveLength(1); // ÚNICO patch (sem race)
		const patch = drafts?.[0]?.[0] as Partial<LiturgyItemDraft>;
		expect(patch.musicId).toBe(-3); // cru — offsetar corromperia o namespace
		expect(patch.name).toBe("Missao Para Todos");
		expect(patch.durationMs).toBe(91_000);
		expect(wrapper.emitted("slja-imported")).toEqual([[-3]]);
	});

	it("logado: draft recebe displayMusicId 1M+ (namespace custom)", async () => {
		authSessionMock.mockReturnValue({ user: { email: "x@y.z" } });
		const wrapper = mountDialog(makeDraft());
		await importFile(wrapper, {
			musicId: 7,
			displayMusicId: 1_000_007,
			name: "Hino Autoral",
			durationMs: 0,
			local: false,
		});

		const patch = wrapper.emitted(
			"update:draft",
		)?.[0]?.[0] as Partial<LiturgyItemDraft>;
		expect(patch.musicId).toBe(1_000_007);
	});

	it("operador já digitou nome → patch NÃO sobrescreve", async () => {
		const wrapper = mountDialog(makeDraft({ name: "Momento Especial" }));
		await importFile(wrapper, {
			musicId: -3,
			displayMusicId: -3,
			name: "Missao Para Todos",
			durationMs: 0,
			local: true,
		});

		const patch = wrapper.emitted(
			"update:draft",
		)?.[0]?.[0] as Partial<LiturgyItemDraft>;
		// patch é MERGE: nome pré-existente permanece (só musicId/duração entram)
		expect(patch.name).toBe("Momento Especial");
		expect(patch.musicId).toBe(-3);
	});

	it("arquivo inválido → mensagem de erro, draft intacto", async () => {
		const wrapper = mountDialog(makeDraft());
		importMock.mockRejectedValueOnce(new Error("inválido"));
		const input = sljaInputElement();
		Object.defineProperty(input, "files", {
			value: [makeFakeFile()],
			configurable: true,
		});
		input.dispatchEvent(new Event("change"));
		await flushPromises();

		expect(wrapper.emitted("update:draft")).toBeUndefined();
		expect(
			document.body.querySelector(".moment-dialog__slja-message--error"),
		).not.toBeNull();
		wrapper.unmount();
	});
});
