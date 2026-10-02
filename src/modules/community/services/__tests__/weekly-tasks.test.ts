// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	completeWeeklyTask,
	getWeeklyTasks,
	type WeeklyTask,
} from "../weekly-tasks";

const SESSION = {
	token: "tok",
	user: { id_user: 1, email: "t@t.local", displayName: "T" },
};

function login() {
	localStorage.setItem("louvorja.custom.auth", JSON.stringify(SESSION));
}

function logout() {
	localStorage.removeItem("louvorja.custom.auth");
}

function jsonResponse(body: unknown, ok = true): Response {
	return {
		ok,
		status: ok ? 200 : 500,
		json: async () => body,
	} as unknown as Response;
}

const TASKS: WeeklyTask[] = [
	{
		id: "publish_theme",
		description: "Publique uma coletânea",
		done: false,
		bonus: 15,
	},
	{
		id: "complete_tracks",
		description: "Complete 3 faixas",
		done: true,
		bonus: 15,
	},
	{ id: "use_others", description: "Use 2 coletâneas", done: false, bonus: 15 },
];

describe("weekly-tasks service (F4 app)", () => {
	beforeEach(() => {
		vi.unstubAllGlobals();
		logout();
	});

	it("getWeeklyTasks: autenticado → lista; sem sessão → null", async () => {
		login();
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => jsonResponse({ week_key: "2026-W38", data: TASKS })),
		);
		const tasks = await getWeeklyTasks();
		expect(tasks).toEqual(TASKS);

		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		logout();
		expect(await getWeeklyTasks()).toBeNull();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("getWeeklyTasks: falha da API → null", async () => {
		login();
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => jsonResponse({ error: "x" }, false)),
		);
		expect(await getWeeklyTasks()).toBeNull();
	});

	it("completeWeeklyTask: retorna credited; falha → false", async () => {
		login();
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => jsonResponse({ ok: true, credited: true })),
		);
		expect(await completeWeeklyTask("publish_theme")).toBe(true);

		vi.stubGlobal(
			"fetch",
			vi.fn(async () => jsonResponse({ ok: true, credited: false })),
		);
		expect(await completeWeeklyTask("publish_theme")).toBe(false);
	});

	it("completeWeeklyTask sem sessão → false sem fetch", async () => {
		const m = vi.fn();
		vi.stubGlobal("fetch", m);
		expect(await completeWeeklyTask("x")).toBe(false);
		expect(m).not.toHaveBeenCalled();
	});
});

describe("weekly-tasks — fechamento de cobertura (catch/branch)", () => {
	beforeEach(() => {
		vi.unstubAllGlobals();
		login();
	});

	it("getWeeklyTasks: fetch lança (rede) → null", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error("offline");
			}),
		);
		expect(await getWeeklyTasks()).toBeNull();
	});

	it("getWeeklyTasks: ok mas data não-array → null", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ data: 42 })));
		expect(await getWeeklyTasks()).toBeNull();
	});

	it("getWeeklyTasks: ok mas sem data → null", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({})));
		expect(await getWeeklyTasks()).toBeNull();
	});

	it("completeWeeklyTask: fetch lança → false", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error("offline");
			}),
		);
		expect(await completeWeeklyTask("t1")).toBe(false);
	});

	it("completeWeeklyTask: ok mas credited !== true → false", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ credited: false })));
		expect(await completeWeeklyTask("t1")).toBe(false);
	});
});

describe("weekly-tasks — URL base e default", () => {
	beforeEach(() => {
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
		login();
	});

	it("getWeeklyTasks: default de produção quando env ausente", async () => {
		vi.stubEnv("VITE_PALCO_API_URL", undefined as unknown as string);
		let calledUrl = "";
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string) => {
				calledUrl = url;
				return jsonResponse({ data: TASKS });
			}),
		);
		await getWeeklyTasks();
		expect(calledUrl).toBe("https://api.pianolouvorja.com.br/v1/custom/weekly-tasks");
	});

	it("completeWeeklyTask: default de produção quando env ausente", async () => {
		vi.stubEnv("VITE_PALCO_API_URL", undefined as unknown as string);
		let calledUrl = "";
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string) => {
				calledUrl = url;
				return jsonResponse({ credited: true });
			}),
		);
		await completeWeeklyTask("publish_theme");
		expect(calledUrl).toBe(
			"https://api.pianolouvorja.com.br/v1/custom/weekly-tasks/publish_theme/complete",
		);
	});
});

describe("weekly-tasks — branch !ok no complete", () => {
	beforeEach(() => {
		vi.unstubAllGlobals();
		login();
	});

	it("completeWeeklyTask: resposta !ok → false", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({}, false)));
		expect(await completeWeeklyTask("t1")).toBe(false);
	});
});

describe("weekly-tasks — contrato de rede (mata mutantes de headers/method)", () => {
	beforeEach(() => {
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
		login();
	});

	it("getWeeklyTasks: headers com Authorization Bearer exato", async () => {
		let captured: RequestInit | undefined;
		vi.stubGlobal(
			"fetch",
			vi.fn(async (_url: string, init?: RequestInit) => {
				captured = init;
				return jsonResponse({ data: TASKS });
			}),
		);
		await getWeeklyTasks();
		const headers = captured?.headers as Record<string, string>;
		expect(headers["Authorization"]).toBe("Bearer tok");
	});

	it("completeWeeklyTask: method POST + Authorization Bearer exato", async () => {
		let captured: RequestInit | undefined;
		vi.stubGlobal(
			"fetch",
			vi.fn(async (_url: string, init?: RequestInit) => {
				captured = init;
				return jsonResponse({ credited: true });
			}),
		);
		await completeWeeklyTask("t1");
		expect(captured?.method).toBe("POST");
		const headers = captured?.headers as Record<string, string>;
		expect(headers["Authorization"]).toBe("Bearer tok");
	});
});

describe("weekly-tasks — mata mutantes de guarda e replace", () => {
	beforeEach(() => {
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
		login();
	});

	it("getWeeklyTasks: !ok com data válido → null (dado de erro não entra)", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => jsonResponse({ data: TASKS }, false)),
		);
		expect(await getWeeklyTasks()).toBeNull();
	});

	it("completeWeeklyTask: !ok com credited:true → false", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => jsonResponse({ credited: true }, false)),
		);
		expect(await completeWeeklyTask("t1")).toBe(false);
	});

	it("base URL com trailing slash: replace(/\\/$/) remove (mutante do replace quebra a URL)", async () => {
		vi.stubEnv("VITE_PALCO_API_URL", "https://api.test.local////");
		let calledUrl = "";
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string) => {
				calledUrl = url;
				return jsonResponse({ data: TASKS });
			}),
		);
		await getWeeklyTasks();
		// replace remove UM slash final (regex \/$): base vira 'local///'
		// e a URL montada fica com 4 slashes ('///' + '/v1') — comportamento real
		expect(calledUrl).toBe("https://api.test.local////v1/custom/weekly-tasks");
		// e o caso SEM slash (mutante do replace não altera nada aqui):
		vi.stubEnv("VITE_PALCO_API_URL", "https://api.test.local");
		let called2 = "";
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string) => {
				called2 = url;
				return jsonResponse({ data: TASKS });
			}),
		);
		await getWeeklyTasks();
		expect(called2).toBe("https://api.test.local/v1/custom/weekly-tasks");
	});
});
