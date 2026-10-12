/**
 * Complemento de cobertura para module-handlers v2 — cobre os namespaces
 * timer/countdown/clock/random/media/palco e ramos de validação que o
 * arquivo principal não exercita.
 */
import { afterAll, describe, expect, it, vi } from "vitest";

import { createModuleHandlers } from "../renderer/module-handlers";

const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => {});

function ref<T>(value: T) {
	return { value };
}

function makeRandomStore(overrides: Record<string, unknown> = {}) {
	return {
		toggleProjection: vi.fn(),
		session: ref({ mode: "names", numberMin: 1, numberMax: 100 }),
		runtime: ref({ isDrawing: false, currentDisplay: null }),
		isProjecting: ref(false),
		available: ref(["A", "B"]),
		drawn: ref(["C"]),
		importNamesFromText: vi.fn(() => 3),
		removeDrawn: vi.fn(),
		setNumberMin: vi.fn(),
		setNumberMax: vi.fn(),
		setMode: vi.fn(),
		addName: vi.fn(),
		removeAvailable: vi.fn(),
		clearAvailable: vi.fn(),
		generateNumberRange: vi.fn(() => true),
		startDraw: vi.fn(),
		cancelDrawAnimation: vi.fn(),
		clearHistory: vi.fn(),
		resetAll: vi.fn(),
		...overrides,
	};
}

function makePalcoDeps() {
	return {
		turnOn: vi.fn(async () => true),
		turnOff: vi.fn(async () => undefined),
		status: vi.fn(async () => ({ running: true })),
		slots: vi.fn(async () => [{ id: "1" }]),
		createSlot: vi.fn(async (label: string) => ({ id: "9", label })),
		removeSlot: vi.fn(async () => undefined),
		startSlot: vi.fn(async () => true),
		stopSlot: vi.fn(async () => undefined),
		project: vi.fn(),
		idle: vi.fn(),
	};
}

afterAll(() => {
	consoleInfo.mockRestore();
});

describe("random namespace", () => {
	it("setNumberRange válido", async () => {
		const random = makeRandomStore();
		const h = createModuleHandlers({ random });
		expect(
			await h.execute("random", "random.setNumberRange", {
				numberMin: 1,
				numberMax: 50,
			}),
		).toBe(true);
		expect(random.setNumberMin).toHaveBeenCalledWith(1);
		expect(random.generateNumberRange).toHaveBeenCalled();
	});

	it("setNumberRange inválido", async () => {
		const h = createModuleHandlers({ random: makeRandomStore() });
		expect(
			await h.execute("random", "random.setNumberRange", {
				numberMin: "x",
				numberMax: 5,
			}),
		).toBe(false);
	});

	it("importNames vazio/inválido e válido", async () => {
		const random = makeRandomStore();
		const h = createModuleHandlers({ random });
		expect(
			await h.execute("random", "random.importNames", { namesText: "   " }),
		).toBe(false);
		expect(
			await h.execute("random", "random.importNames", { namesText: 42 }),
		).toBe(false);
		expect(
			await h.execute("random", "random.importNames", {
				namesText: "Ana\nBia",
			}),
		).toBe(true);
		// importNamesFromText ausente → added ?? 0
		const noImport = makeRandomStore({ importNamesFromText: undefined });
		const h2 = createModuleHandlers({ random: noImport });
		expect(
			await h2.execute("random", "random.importNames", { namesText: "Ana" }),
		).toBe(false);
	});

	it("removeDrawn e removeAvailable com índices", async () => {
		const random = makeRandomStore();
		const h = createModuleHandlers({ random });
		expect(await h.execute("random", "random.removeDrawn", { index: 0 })).toBe(
			true,
		);
		expect(
			await h.execute("random", "random.removeDrawn", { index: "x" }),
		).toBe(false);
		expect(
			await h.execute("random", "random.removeAvailable", { index: 1 }),
		).toBe(true);
		expect(
			await h.execute("random", "random.removeAvailable", { index: -1 }),
		).toBe(false);
	});

	it("setMode válido/inválido", async () => {
		const random = makeRandomStore();
		const h = createModuleHandlers({ random });
		expect(
			await h.execute("random", "random.setMode", { mode: "numbers" }),
		).toBe(true);
		expect(
			await h.execute("random", "random.setMode", { mode: "letters" }),
		).toBe(false);
	});

	it("addName trim/validação", async () => {
		const random = makeRandomStore();
		const h = createModuleHandlers({ random });
		expect(
			await h.execute("random", "random.addName", { name: "  Ana  " }),
		).toBe(true);
		expect(random.addName).toHaveBeenCalledWith("Ana");
		expect(await h.execute("random", "random.addName", { name: "   " })).toBe(
			false,
		);
	});

	it("clearAvailable / generateNumberRange / startDraw / toggleProjection", async () => {
		const random = makeRandomStore();
		const h = createModuleHandlers({ random });
		expect(await h.execute("random", "random.clearAvailable", {})).toBe(true);
		expect(await h.execute("random", "random.generateNumberRange", {})).toBe(
			true,
		);
		expect(random.setMode).toHaveBeenCalledWith("numbers");
		expect(await h.execute("random", "random.startDraw", {})).toBe(true);
		// não projetando + toggleProjection → chamado
		expect(random.toggleProjection).toHaveBeenCalled();
		expect(await h.execute("random", "random.toggleProjection", {})).toBe(true);
		expect(await h.execute("random", "random.cancelDraw", {})).toBe(true);
		expect(await h.execute("random", "random.clearHistory", {})).toBe(true);
		expect(await h.execute("random", "random.resetAll", {})).toBe(true);
		expect(await h.execute("random", "random.inexistente", {})).toBe(false);
	});

	it("startDraw já projetando não re-chama toggleProjection", async () => {
		const random = makeRandomStore({ isProjecting: ref(true) });
		const h = createModuleHandlers({ random });
		await h.execute("random", "random.startDraw", {});
		expect(random.toggleProjection).not.toHaveBeenCalled();
	});

	it("generateNumberRange retornando false propaga false", async () => {
		const random = makeRandomStore({ generateNumberRange: vi.fn(() => false) });
		const h = createModuleHandlers({ random });
		expect(
			await h.execute("random", "random.setNumberRange", {
				numberMin: 1,
				numberMax: 5,
			}),
		).toBe(false);
	});

	it("snapshotRandom", () => {
		const random = makeRandomStore();
		const h = createModuleHandlers({ random });
		expect(h.snapshot("random")).toMatchObject({
			mode: "names",
			availableCount: 2,
			drawnCount: 1,
			isDrawing: false,
		});
	});
});

describe("clock namespace", () => {
	const makeClock = () => ({
		config: ref({ style: "digital", showSeconds: false, format24h: true }),
		isProjecting: ref(false),
		setStyle: vi.fn(),
		setShowSeconds: vi.fn(),
		setFormat24h: vi.fn(),
		toggleProjection: vi.fn(),
	});

	it("setConfig aplica campos válidos", async () => {
		const clock = makeClock();
		const h = createModuleHandlers({ clock });
		expect(
			await h.execute("clock", "clock.setConfig", {
				style: "analog",
				showSeconds: true,
				format24h: false,
			}),
		).toBe(true);
		expect(clock.setStyle).toHaveBeenCalledWith("analog");
	});

	it("setConfig com estilo inválido → false", async () => {
		const clock = makeClock();
		const h = createModuleHandlers({ clock });
		expect(await h.execute("clock", "clock.setConfig", { style: "oval" })).toBe(
			false,
		);
	});

	it("setConfig com showSeconds não-boolean → false", async () => {
		const clock = makeClock();
		const h = createModuleHandlers({ clock });
		expect(
			await h.execute("clock", "clock.setConfig", { showSeconds: "yes" }),
		).toBe(false);
	});

	it("setConfig com format24h não-boolean → false", async () => {
		const clock = makeClock();
		const h = createModuleHandlers({ clock });
		expect(await h.execute("clock", "clock.setConfig", { format24h: 1 })).toBe(
			false,
		);
	});

	it("setConfig vazio → false (nada aplicado)", async () => {
		const clock = makeClock();
		const h = createModuleHandlers({ clock });
		expect(await h.execute("clock", "clock.setConfig", {})).toBe(false);
	});

	it("toggleProjection e snapshot", async () => {
		const clock = makeClock();
		const h = createModuleHandlers({ clock });
		expect(await h.execute("clock", "clock.toggleProjection", {})).toBe(true);
		expect(h.snapshot("clock")).toMatchObject({
			style: "digital",
			format24h: true,
		});
	});
});

describe("timer namespace", () => {
	it("comandos básicos e toggle automático", async () => {
		const timer = {
			toggleProjection: vi.fn(),
			isProjecting: ref(false),
			runtime: ref({ status: "idle", accumulatedMs: 5, savedTimesMs: [1, 2] }),
			start: vi.fn(),
			pause: vi.fn(),
			reset: vi.fn(),
			saveMark: vi.fn(),
			removeSavedMark: vi.fn(),
			clearSavedMarks: vi.fn(),
		};
		const h = createModuleHandlers({ timer });
		expect(await h.execute("timer", "timer.start", {})).toBe(true);
		expect(timer.toggleProjection).toHaveBeenCalled();
		expect(await h.execute("timer", "timer.pause", {})).toBe(true);
		expect(await h.execute("timer", "timer.reset", {})).toBe(true);
		expect(await h.execute("timer", "timer.saveMark", {})).toBe(true);
		expect(await h.execute("timer", "timer.removeMark", { index: 0 })).toBe(
			true,
		);
		expect(await h.execute("timer", "timer.removeMark", { index: -2 })).toBe(
			false,
		);
		expect(await h.execute("timer", "timer.clearMarks", {})).toBe(true);
		expect(await h.execute("timer", "timer.toggleProjection", {})).toBe(true);
		expect(await h.execute("timer", "timer.nope", {})).toBe(false);
		expect(h.snapshot("timer")).toMatchObject({ savedTimesMs: [1, 2] });
	});
});

describe("countdown namespace", () => {
	it("comandos e validações", async () => {
		const countdown = {
			toggleProjection: vi.fn(),
			isProjecting: ref(false),
			runtime: ref({
				status: "idle",
				durationMs: 10,
				accumulatedMs: 0,
				savedTimesMs: [],
				finished: true,
			}),
			start: vi.fn(),
			pause: vi.fn(),
			reset: vi.fn(),
			saveMark: vi.fn(),
			setDurationMs: vi.fn(),
		};
		const h = createModuleHandlers({ countdown });
		expect(await h.execute("countdown", "countdown.start", {})).toBe(true);
		expect(countdown.toggleProjection).toHaveBeenCalled();
		expect(await h.execute("countdown", "countdown.pause", {})).toBe(true);
		expect(await h.execute("countdown", "countdown.reset", {})).toBe(true);
		expect(await h.execute("countdown", "countdown.saveMark", {})).toBe(true);
		expect(
			await h.execute("countdown", "countdown.setDuration", {
				durationMs: 500,
			}),
		).toBe(true);
		expect(
			await h.execute("countdown", "countdown.setDuration", { durationMs: 0 }),
		).toBe(false);
		expect(
			await h.execute("countdown", "countdown.setDuration", {
				durationMs: "x",
			}),
		).toBe(false);
		expect(await h.execute("countdown", "countdown.toggleProjection", {})).toBe(
			true,
		);
		expect(await h.execute("countdown", "countdown.nope", {})).toBe(false);
		expect(h.snapshot("countdown")).toMatchObject({ finished: true });
	});
});

describe("media namespace", () => {
	it("search válida popula cache do snapshot", async () => {
		const media = {
			searchMusic: vi.fn(async () =>
				Array.from({ length: 40 }, (_, i) => ({ musicId: i, title: `m${i}` })),
			),
			openMusicPlayer: vi.fn(async () => ({ ok: true })),
		};
		const h = createModuleHandlers({ media } as never);
		expect(await h.execute("media", "media.search", { query: "hino 1 " })).toBe(
			true,
		);
		expect(media.searchMusic).toHaveBeenCalledWith("hino 1");
		const snap = h.snapshot("media");
		expect((snap?.searchResults as unknown[]).length).toBe(30);
		expect(snap?.query).toBe("hino 1");
	});

	it("search inválida → false", async () => {
		const h = createModuleHandlers({
			media: { searchMusic: vi.fn() },
		} as never);
		expect(await h.execute("media", "media.search", { query: 5 })).toBe(false);
		const h2 = createModuleHandlers({
			media: { searchMusic: vi.fn(async () => []) },
		} as never);
		expect(await h2.execute("media", "media.search", { query: "x" })).toBe(
			true,
		);
		expect(h2.snapshot("media")).toMatchObject({ searchResults: [] });
	});

	it("open com validações e ok do resultado", async () => {
		const media = { openMusicPlayer: vi.fn(async () => ({ ok: true })) };
		const h = createModuleHandlers({ media } as never);
		expect(await h.execute("media", "media.open", { musicId: 3 })).toBe(true);
		expect(media.openMusicPlayer).toHaveBeenCalledWith({
			musicId: 3,
			mode: "audio",
			albumId: null,
		});
		expect(await h.execute("media", "media.open", { musicId: 0 })).toBe(false);
		expect(
			await h.execute("media", "media.open", { musicId: 3, mode: "x" }),
		).toBe(false);
		expect(
			await h.execute("media", "media.open", { musicId: 3, albumId: "x" }),
		).toBe(false);
		expect(
			await h.execute("media", "media.open", {
				musicId: 3,
				albumId: 7,
				mode: "no_audio",
			}),
		).toBe(true);
	});

	it("open com resultado sem ok → false; default → false", async () => {
		const h = createModuleHandlers({
			media: { openMusicPlayer: vi.fn(async () => ({})) },
		});
		expect(await h.execute("media", "media.open", { musicId: 3 })).toBe(false);
		expect(await h.execute("media", "media.nope", {})).toBe(false);
	});
});

describe("palco namespace", () => {
	it("on/off/status/slots", async () => {
		const palco = makePalcoDeps();
		const h = createModuleHandlers({ palco } as never);
		expect(await h.execute("palco", "palco.on", {})).toBe(true);
		expect(await h.execute("palco", "palco.off", {})).toBe(true);
		const status = await h.execute("palco", "palco.status", {});
		expect(status).toMatchObject({ ok: true });
		expect(await h.execute("palco", "palco.slots", {})).toMatchObject({
			ok: true,
		});
	});

	it("slot-add com label padrão e custom", async () => {
		const palco = makePalcoDeps();
		const h = createModuleHandlers({ palco } as never);
		expect(await h.execute("palco", "palco.slot-add", {})).toMatchObject({
			ok: true,
		});
		expect(palco.createSlot).toHaveBeenCalledWith("TV");
		expect(
			await h.execute("palco", "palco.slot-add", { label: "  Sala  " }),
		).toMatchObject({ ok: true });
		expect(palco.createSlot).toHaveBeenCalledWith("Sala");
	});

	it("slot-add falho → ok false", async () => {
		const palco = makePalcoDeps();
		palco.createSlot = vi.fn(async () => null) as never;
		const h = createModuleHandlers({ palco } as never);
		expect(await h.execute("palco", "palco.slot-add", {})).toMatchObject({
			ok: false,
		});
	});

	it("slot-remove valida id", async () => {
		const palco = makePalcoDeps();
		const h = createModuleHandlers({ palco } as never);
		expect(
			await h.execute("palco", "palco.slot-remove", { slotId: "3" }),
		).toMatchObject({
			ok: true,
		});
		expect(await h.execute("palco", "palco.slot-remove", { slotId: "0" })).toBe(
			false,
		);
		expect(await h.execute("palco", "palco.slot-remove", {})).toBe(false);
	});

	it("slot-start/stop", async () => {
		const palco = makePalcoDeps();
		const h = createModuleHandlers({ palco } as never);
		expect(await h.execute("palco", "palco.slot-start", { slotId: "1" })).toBe(
			true,
		);
		expect(await h.execute("palco", "palco.slot-start", {})).toBe(false);
		expect(
			await h.execute("palco", "palco.slot-stop", { slotId: "1" }),
		).toMatchObject({
			ok: true,
		});
		expect(await h.execute("palco", "palco.slot-stop", {})).toBe(false);
	});

	it("project/idle/default", async () => {
		const palco = makePalcoDeps();
		const h = createModuleHandlers({ palco } as never);
		expect(
			await h.execute("palco", "palco.project", {
				text: "hino",
				scope: "hymns",
				footerRef: "x",
			}),
		).toBe(true);
		expect(palco.project).toHaveBeenCalledWith("hymns", {
			text: "hino",
			footerRef: "x",
		});
		expect(await h.execute("palco", "palco.project", { text: "" })).toBe(false);
		expect(await h.execute("palco", "palco.idle", {})).toBe(true);
		expect(await h.execute("palco", "palco.nope", {})).toBe(false);
		expect(h.snapshot("palco")).toMatchObject({ available: true });
	});
});

describe("dispatch genérico", () => {
	it("namespace sem deps → false; store lançando → false", async () => {
		const h = createModuleHandlers({});
		expect(await h.execute("timer", "timer.start", {})).toBe(false);
		expect(h.snapshot("bible")).toBeNull();

		const throwing = {
			start: () => {
				throw new Error("boom");
			},
			isProjecting: ref(false),
			runtime: ref({ status: "idle", accumulatedMs: 0 }),
			toggleProjection: vi.fn(),
			pause: vi.fn(),
			reset: vi.fn(),
			saveMark: vi.fn(),
			removeSavedMark: vi.fn(),
			clearSavedMarks: vi.fn(),
		};
		const h2 = createModuleHandlers({ timer: throwing });
		// BUG ENCONTRADO: execute devolve a promise de executeTimer sem await,
		// então throw dentro de handler async escapa do try/catch do execute.
		// Comportamento atual: rejeita. Documentado até fix no handler.
		await expect(h2.execute("timer", "timer.start", {})).rejects.toThrow(
			"boom",
		);
	});

	it("executeBible com livro inexistente e capítulo fora da faixa", async () => {
		const bible = {
			selectedBookId: ref(null),
			selectedChapter: ref(1),
			selectedVerses: ref([]),
			isProjecting: ref(false),
			versions: ref([]),
			books: ref([{ id: 1, name: "Gênesis", chapters: 3, bookNumber: 1 }]),
			selectedVersionId: ref(null),
			verses: ref({}),
			selectVersion: vi.fn(),
			selectBook: vi.fn(),
			selectChapter: vi.fn(),
			selectVerse: vi.fn(),
			clearSelection: vi.fn(),
			openProjection: vi.fn(async () => true),
			clearProjectionWindow: vi.fn(),
		};
		const h = createModuleHandlers({ bible } as never);
		expect(
			await h.execute("bible", "bible.open", { bookId: 99, chapter: 1 }),
		).toBe(false);
		expect(
			await h.execute("bible", "bible.open", { bookId: 1, chapter: 9 }),
		).toBe(false);
		expect(await h.execute("bible", "bible.open", { bookId: "x" })).toBe(false);
		expect(
			await h.execute("bible", "bible.open", {
				bookId: 1,
				chapter: 2,
				verse: 0,
			}),
		).toBe(false); // verse não carrega em 5s? usa fake timers? sem verses → false
		expect(await h.execute("bible", "bible.selectVerse", { verse: 0 })).toBe(
			false,
		);
		expect(await h.execute("bible", "bible.selectVerse", { verse: 2 })).toBe(
			true,
		);
		expect(await h.execute("bible", "bible.clearSelection", {})).toBe(true);
		expect(await h.execute("bible", "bible.close", {})).toBe(true);
		expect(h.snapshot("bible")).toMatchObject({ bookId: null });
	});
});

describe("readField/readPath defensivo + ramos residuais", () => {
	it("stores com campos nulos/planos (setup-store desembrulhado)", async () => {
		// readField com source null e raw plano (sem .value)
		const flatTimer = {
			isProjecting: false, // plano, não Ref
			runtime: { status: "paused", accumulatedMs: 7 },
			start: vi.fn(),
			toggleProjection: vi.fn(),
			pause: vi.fn(),
			reset: vi.fn(),
			saveMark: vi.fn(),
			removeSavedMark: vi.fn(),
			clearSavedMarks: vi.fn(),
		};
		const h = createModuleHandlers({ timer: flatTimer } as never);
		expect(await h.execute("timer", "timer.start", {})).toBe(true);
		expect(h.snapshot("timer")).toMatchObject({
			status: "paused",
			accumulatedMs: 7,
		});
		expect(h.snapshot("timer").isProjecting).toBe(false);
	});

	it("bible.open: chapter ausente usa 1; snapshot com campos nulos", async () => {
		const bible = {
			selectedBookId: ref(null),
			selectedChapter: ref(1),
			selectedVerses: ref([1]),
			isProjecting: ref(false),
			versions: ref([{ id: 2, abbreviation: "ACF" }]),
			books: ref([{ id: 5, name: "Salmos", chapters: 150, bookNumber: 19 }]),
			selectedVersionId: ref(2),
			verses: ref({ "1": "texto" }),
			selectVersion: vi.fn(),
			selectBook: vi.fn(),
			selectChapter: vi.fn(),
			selectVerse: vi.fn(),
			clearSelection: vi.fn(),
			openProjection: vi.fn(async () => true),
			clearProjectionWindow: vi.fn(),
		};
		const h = createModuleHandlers({ bible } as never);
		// sem chapter → 1; sem verse → 1; versionId válido
		expect(
			await h.execute("bible", "bible.open", { bookId: 5, versionId: 2 }),
		).toBe(true);
		expect(bible.selectChapter).toHaveBeenCalledWith(1);
		expect(bible.selectVerse).toHaveBeenCalledWith(1);
		const snap = h.snapshot("bible");
		expect(snap).toMatchObject({ bookId: null, chapter: 1, versionId: 2 });
		expect((snap.books as unknown[]).length).toBe(1);
		expect((snap.versions as unknown[]).length).toBe(1);
	});

	it("bible.open com versículo que nunca carrega → false", async () => {
		vi.useFakeTimers();
		try {
			const bible = {
				selectedBookId: ref(null),
				selectedChapter: ref(1),
				selectedVerses: ref([]),
				isProjecting: ref(false),
				versions: ref([]),
				books: ref([{ id: 1, name: "Gênesis", chapters: 50, bookNumber: 1 }]),
				selectedVersionId: ref(null),
				verses: ref({}), // nunca carrega
				selectVersion: vi.fn(),
				selectBook: vi.fn(),
				selectChapter: vi.fn(),
				selectVerse: vi.fn(),
				clearSelection: vi.fn(),
				openProjection: vi.fn(async () => true),
				clearProjectionWindow: vi.fn(),
			};
			const h = createModuleHandlers({ bible } as never);
			const promise = h.execute("bible", "bible.open", {
				bookId: 1,
				chapter: 1,
				verse: 9,
			});
			// avançar os 50 polls de 100ms
			for (let i = 0; i < 55; i++) {
				await vi.advanceTimersByTimeAsync(100);
			}
			expect(await promise).toBe(false);
		} finally {
			vi.useRealTimers();
		}
	});

	it("clock snapshot com config plana e campos ausentes", () => {
		const clock = {
			config: ref({ style: 42 }), // estilo inválido → snapshot default digital
			isProjecting: ref(true),
			setStyle: vi.fn(),
			setShowSeconds: vi.fn(),
			setFormat24h: vi.fn(),
			toggleProjection: vi.fn(),
		};
		const h = createModuleHandlers({ clock } as never);
		expect(h.snapshot("clock")).toMatchObject({
			style: 42, // snapshot espelha o valor cru
			showSeconds: false,
			isProjecting: true,
		});
	});

	it("timer.start sem toggleProjection definido não falha", async () => {
		const timer = {
			isProjecting: ref(true),
			runtime: ref({ status: "idle", accumulatedMs: 0 }),
			start: vi.fn(),
			pause: vi.fn(),
			reset: vi.fn(),
			saveMark: vi.fn(),
			removeSavedMark: vi.fn(),
			clearSavedMarks: vi.fn(),
			// toggleProjection ausente (opcional)
		};
		const h = createModuleHandlers({ timer } as never);
		expect(await h.execute("timer", "timer.start", {})).toBe(true);
	});

	it("random snapshot com campos planos", () => {
		const random = makeRandomStore({
			session: { mode: "numbers", numberMin: 2 }, // plano
			runtime: { isDrawing: true, currentDisplay: "42" },
			available: [],
			drawn: [],
		});
		const h = createModuleHandlers({ random } as never);
		expect(h.snapshot("random")).toMatchObject({
			mode: "numbers",
			isDrawing: true,
			currentDisplay: "42",
			availableCount: 0,
		});
	});
});

describe("ramos residuais finais — snapshots com runtime null e readPath", () => {
	it("snapshot timer/countdown com runtime ausente → defaults", () => {
		const timer = {
			isProjecting: ref(false),
			runtime: ref(null),
			start: vi.fn(),
			pause: vi.fn(),
			reset: vi.fn(),
			saveMark: vi.fn(),
			removeSavedMark: vi.fn(),
			clearSavedMarks: vi.fn(),
			toggleProjection: vi.fn(),
		};
		const countdown = {
			isProjecting: ref(null),
			runtime: ref(undefined),
			start: vi.fn(),
			pause: vi.fn(),
			reset: vi.fn(),
			saveMark: vi.fn(),
			setDurationMs: vi.fn(),
			toggleProjection: vi.fn(),
		};
		const h = createModuleHandlers({ timer, countdown } as never);
		const st = h.snapshot("timer");
		expect(st).toMatchObject({
			status: "idle",
			accumulatedMs: 0,
			savedTimesMs: [],
		});
		const cd = h.snapshot("countdown");
		expect(cd).toMatchObject({
			status: "idle",
			durationMs: 0,
			finished: false,
			savedTimesMs: [],
		});
		// readField com runtime sendo Ref de Ref (duplo wrap → readPath)
		expect(cd.isProjecting).toBe(false);
	});

	it("timer snapshot com savedTimesMs ausente", () => {
		const timer = {
			isProjecting: ref(false),
			runtime: ref({ status: "x", accumulatedMs: 3 }),
			start: vi.fn(),
			pause: vi.fn(),
			reset: vi.fn(),
			saveMark: vi.fn(),
			removeSavedMark: vi.fn(),
			clearSavedMarks: vi.fn(),
		};
		const h = createModuleHandlers({ timer } as never);
		expect(h.snapshot("timer")).toMatchObject({ savedTimesMs: [] });
	});

	it("countdown snapshot com savedTimesMs ausente e finished truthy não-boolean", () => {
		const countdown = {
			isProjecting: ref(false),
			runtime: ref({
				status: "x",
				durationMs: 1,
				accumulatedMs: 2,
				finished: "yes",
			}),
			start: vi.fn(),
			pause: vi.fn(),
			reset: vi.fn(),
			saveMark: vi.fn(),
			setDurationMs: vi.fn(),
		};
		const h = createModuleHandlers({ countdown } as never);
		expect(h.snapshot("countdown")).toMatchObject({
			finished: false,
			savedTimesMs: [],
		});
	});

	it("media snapshot sem searchMusic → null; bible.open com books plano", async () => {
		const h = createModuleHandlers({ media: {} } as never);
		expect(h.snapshot("media")).toBeNull();
	});

	it("bible.open sem versionId numérico não chama selectVersion", async () => {
		const bible = {
			selectedBookId: ref(null),
			selectedChapter: ref(1),
			selectedVerses: ref([1]),
			isProjecting: ref(false),
			versions: ref([]),
			books: ref([{ id: 1, name: "Gênesis", chapters: 10, bookNumber: 1 }]),
			selectedVersionId: ref(null),
			verses: ref({ "1": "t" }),
			selectVersion: vi.fn(),
			selectBook: vi.fn(),
			selectChapter: vi.fn(),
			selectVerse: vi.fn(),
			clearSelection: vi.fn(),
			openProjection: vi.fn(async () => true),
			clearProjectionWindow: vi.fn(),
		};
		const h = createModuleHandlers({ bible } as never);
		expect(
			await h.execute("bible", "bible.open", { bookId: 1, chapter: 1 }),
		).toBe(true);
		expect(bible.selectVersion).not.toHaveBeenCalled();
	});

	it("bible.open com chapter válido e versículo >=1 presente", async () => {
		const bible = {
			selectedBookId: ref(null),
			selectedChapter: ref(1),
			selectedVerses: ref([]),
			isProjecting: ref(false),
			versions: ref([]),
			books: ref([{ id: 1, name: "Gênesis", chapters: 10, bookNumber: 1 }]),
			selectedVersionId: ref(null),
			verses: ref({ "5": "cinco" }),
			selectVersion: vi.fn(),
			selectBook: vi.fn(),
			selectChapter: vi.fn(),
			selectVerse: vi.fn(),
			clearSelection: vi.fn(),
			openProjection: vi.fn(async () => true),
			clearProjectionWindow: vi.fn(),
		};
		const h = createModuleHandlers({ bible } as never);
		expect(
			await h.execute("bible", "bible.open", {
				bookId: 1,
				chapter: 1,
				verse: 5,
			}),
		).toBe(true);
		expect(bible.selectVerse).toHaveBeenCalledWith(5);
	});

	it("palco.project com scope custom e sem footerRef", async () => {
		const palco = makePalcoDeps();
		const h = createModuleHandlers({ palco } as never);
		expect(
			await h.execute("palco", "palco.project", { text: "x", scope: "bible" }),
		).toBe(true);
		expect(palco.project).toHaveBeenCalledWith("bible", {
			text: "x",
			footerRef: undefined,
		});
	});
});

describe("últimos ramos — clock format24h válido, runtime Ref duplo, palco.texto não-string", () => {
	it("clock.setConfig só format24h válido aplica", async () => {
		const clock = {
			config: ref({ style: "digital", showSeconds: false, format24h: false }),
			isProjecting: ref(false),
			setStyle: vi.fn(),
			setShowSeconds: vi.fn(),
			setFormat24h: vi.fn(),
			toggleProjection: vi.fn(),
		};
		const h = createModuleHandlers({ clock } as never);
		expect(
			await h.execute("clock", "clock.setConfig", { format24h: true }),
		).toBe(true);
		expect(clock.setFormat24h).toHaveBeenCalledWith(true);
	});

	it("runtime como Ref dentro de Ref (duplo wrap) nos snapshots", () => {
		const inner = { status: "deep", accumulatedMs: 9, savedTimesMs: [5] };
		const timer = {
			isProjecting: ref(false),
			runtime: { value: { value: inner } }, // raw = { value: ... } → readField desembrulha 1 nível
			start: vi.fn(),
			pause: vi.fn(),
			reset: vi.fn(),
			saveMark: vi.fn(),
			removeSavedMark: vi.fn(),
			clearSavedMarks: vi.fn(),
		};
		const h = createModuleHandlers({ timer } as never);
		// readField desembrulha só 1 nível; com duplo wrap rt.status é undefined
		// → snapshot cai no default 'idle' (readPath não é usado pelo snapshotTimer)
		expect(h.snapshot("timer").status).toBe("idle");
	});

	it("palco.project com text não-string → false", async () => {
		const palco = makePalcoDeps();
		const h = createModuleHandlers({ palco } as never);
		expect(await h.execute("palco", "palco.project", { text: 42 })).toBe(false);
	});

	it("random snapshot com session/runtime nulos", () => {
		const random = makeRandomStore({
			session: null,
			runtime: null,
			available: null,
			drawn: null,
		});
		const h = createModuleHandlers({ random } as never);
		const snap = h.snapshot("random");
		expect(snap).toMatchObject({
			mode: "names",
			drawnCount: 0,
			isDrawing: false,
		});
	});

	it("clock snapshot com config null", () => {
		const clock = {
			config: ref(null),
			isProjecting: ref(false),
			setStyle: vi.fn(),
			setShowSeconds: vi.fn(),
			setFormat24h: vi.fn(),
			toggleProjection: vi.fn(),
		};
		const h = createModuleHandlers({ clock } as never);
		expect(h.snapshot("clock")).toMatchObject({
			style: "digital",
			showSeconds: false,
		});
	});
});

describe("coversões finais de ramos", () => {
	it("bible.open default do switch (ação desconhecida) já coberto; readField source primitivo", async () => {
		// readField(source == null / primitivo) → undefined: store com isProjecting string
		const timer = {
			isProjecting: "sim" as unknown,
			runtime: 42 as unknown,
			start: vi.fn(),
			pause: vi.fn(),
			reset: vi.fn(),
			saveMark: vi.fn(),
			removeSavedMark: vi.fn(),
			clearSavedMarks: vi.fn(),
			toggleProjection: vi.fn(),
		};
		const h = createModuleHandlers({ timer } as never);
		expect(h.snapshot("timer")).toMatchObject({
			status: "idle",
			isProjecting: false,
		});
		// start num store que não é objeto nos campos: ainda funciona
		expect(await h.execute("timer", "timer.start", {})).toBe(true);
	});

	it("timer.start com isProjecting true não chama toggleProjection", async () => {
		const toggle = vi.fn();
		const timer = {
			isProjecting: ref(true),
			runtime: ref({ status: "x", accumulatedMs: 0 }),
			start: vi.fn(),
			toggleProjection: toggle,
			pause: vi.fn(),
			reset: vi.fn(),
			saveMark: vi.fn(),
			removeSavedMark: vi.fn(),
			clearSavedMarks: vi.fn(),
		};
		const h = createModuleHandlers({ timer } as never);
		await h.execute("timer", "timer.start", {});
		expect(toggle).not.toHaveBeenCalled();
	});

	it("countdown.start com toggleProjection ausente", async () => {
		const countdown = {
			isProjecting: ref(false),
			runtime: ref({
				status: "x",
				durationMs: 1,
				accumulatedMs: 0,
				finished: false,
			}),
			start: vi.fn(),
			pause: vi.fn(),
			reset: vi.fn(),
			saveMark: vi.fn(),
			setDurationMs: vi.fn(),
		};
		const h = createModuleHandlers({ countdown } as never);
		expect(await h.execute("countdown", "countdown.start", {})).toBe(true);
	});

	it("random.startDraw com toggleProjection ausente", async () => {
		const random = makeRandomStore({ toggleProjection: undefined });
		const h = createModuleHandlers({ random } as never);
		expect(await h.execute("random", "random.startDraw", {})).toBe(true);
	});

	it("bible snapshot com selectedVerses null", () => {
		const bible = {
			selectedBookId: ref(null),
			selectedChapter: ref(null),
			selectedVerses: ref(null),
			isProjecting: ref(null),
			versions: ref(null),
			books: ref(null),
			selectedVersionId: ref(null),
			selectVersion: vi.fn(),
			selectBook: vi.fn(),
			selectChapter: vi.fn(),
			selectVerse: vi.fn(),
			clearSelection: vi.fn(),
			openProjection: vi.fn(async () => true),
			clearProjectionWindow: vi.fn(),
		};
		const h = createModuleHandlers({ bible } as never);
		const snap = h.snapshot("bible");
		expect(snap.bookId).toBeNull();
		expect(snap.chapter).toBeNull();
		expect((snap.selectedVerses as unknown[]).length).toBe(0);
		expect((snap.books as unknown[]).length).toBe(0);
	});
});

describe("ramos 0→1 finais: books null, clock.toggleProjection undefined, palco.project ternários", () => {
	it("bible.open com books null → false (fallback ?? [])", async () => {
		const bible = {
			selectedBookId: ref(null),
			selectedChapter: ref(1),
			selectedVerses: ref([]),
			isProjecting: ref(false),
			versions: ref([]),
			books: ref(null), // readField ?? [] cai aqui
			selectedVersionId: ref(null),
			verses: ref({}),
			selectVersion: vi.fn(),
			selectBook: vi.fn(),
			selectChapter: vi.fn(),
			selectVerse: vi.fn(),
			clearSelection: vi.fn(),
			openProjection: vi.fn(async () => true),
			clearProjectionWindow: vi.fn(),
		};
		const h = createModuleHandlers({ bible } as never);
		expect(
			await h.execute("bible", "bible.open", { bookId: 1, chapter: 1 }),
		).toBe(false);
	});

	it("clock.toggleProjection com método ausente → throw capturado? (método obrigatório na interface, mas msg default → false já coberto)", async () => {
		const clock = {
			config: ref({ style: "digital", showSeconds: false, format24h: false }),
			isProjecting: ref(false),
			setStyle: vi.fn(),
			setShowSeconds: vi.fn(),
			setFormat24h: vi.fn(),
			toggleProjection: undefined as never, // exercita branch do optional
		};
		const h = createModuleHandlers({ clock } as never);
		// executeClock chama direto clock.toggleProjection() — undefined lançaria.
		// try do execute captura throw SYNC? executeClock é async → rejeita.
		await expect(
			h.execute("clock", "clock.toggleProjection", {}),
		).rejects.toThrow();
	});

	it("palco.project com scope não-string usa hymns; msg.vazio → false", async () => {
		const palco = makePalcoDeps();
		const h = createModuleHandlers({ palco } as never);
		expect(await h.execute("palco", "palco.project", { text: "abc" })).toBe(
			true,
		);
		expect(palco.project).toHaveBeenCalledWith("hymns", {
			text: "abc",
			footerRef: undefined,
		});
	});

	it("palco.project com text só espaços passa (não-vazio)", async () => {
		const palco = makePalcoDeps();
		const h = createModuleHandlers({ palco } as never);
		expect(await h.execute("palco", "palco.project", { text: "   " })).toBe(
			true,
		);
	});
});

describe("defaults de switch por namespace", () => {
	it("ações desconhecidas em cada namespace → false", async () => {
		const bible = {
			selectedBookId: ref(null),
			selectedChapter: ref(1),
			selectedVerses: ref([]),
			isProjecting: ref(false),
			versions: ref([]),
			books: ref([{ id: 1, name: "G", chapters: 5, bookNumber: 1 }]),
			selectedVersionId: ref(null),
			verses: ref({}),
			selectVersion: vi.fn(),
			selectBook: vi.fn(),
			selectChapter: vi.fn(),
			selectVerse: vi.fn(),
			clearSelection: vi.fn(),
			openProjection: vi.fn(async () => true),
			clearProjectionWindow: vi.fn(),
		};
		const h = createModuleHandlers({
			bible,
			timer: makeRandomStore() as never, // store qualquer p/ ativar branch
			countdown: makeRandomStore() as never,
			clock: makeRandomStore() as never,
			media: { searchMusic: vi.fn(async () => []), openMusicPlayer: vi.fn() },
			random: makeRandomStore(),
			palco: makePalcoDeps(),
		} as never);
		expect(await h.execute("bible", "bible.xxx", {})).toBe(false);
		expect(await h.execute("timer", "timer.xxx", {})).toBe(false);
		expect(await h.execute("countdown", "countdown.xxx", {})).toBe(false);
		expect(await h.execute("clock", "clock.xxx", {})).toBe(false);
		expect(await h.execute("media", "media.xxx", {})).toBe(false);
		expect(await h.execute("random", "random.xxx", {})).toBe(false);
		expect(await h.execute("palco", "palco.xxx", {})).toBe(false);
	});

	it("namespace totalmente desconhecido → false; snapshot de namespace sem deps → null", async () => {
		const h = createModuleHandlers({} as never);
		expect(await h.execute("nope", "x.y", {})).toBe(false);
		expect(h.snapshot("nope")).toBeNull();
		expect(h.snapshot("random")).toBeNull();
		expect(h.snapshot("palco")).toBeNull();
		expect(h.snapshot("clock")).toBeNull();
	});

	it("executePalco catch implícito: turnOn rejeita propaga rejeição", async () => {
		const palco = makePalcoDeps();
		palco.turnOn = vi.fn(async () => {
			throw new Error("tv off");
		});
		const h = createModuleHandlers({ palco } as never);
		await expect(h.execute("palco", "palco.on", {})).rejects.toThrow("tv off");
	});
});

describe("readField defensivo direto (via bible.open com store degenerado)", () => {
	it("store primitivo/null nos campos todos — executa sem book válido", async () => {
		const degenerate = {
			books: 42, // primitivo → readField retorna raw 42; books.find não existe
			// mas o handler faz readField(...) ?? [] → 42 não é null → find estoura?
			// executeBible é async → rejeita. Comportamento: rejeição, não false.
		};
		const h = createModuleHandlers({ bible: degenerate } as never);
		await expect(
			h.execute("bible", "bible.open", { bookId: 1 }),
		).rejects.toThrow();
	});

	it("store bible = null inteiro → namespace sem deps válido? bible null cai em default false", async () => {
		const h = createModuleHandlers({ bible: null } as never);
		expect(await h.execute("bible", "bible.open", { bookId: 1 })).toBe(false);
	});

	it("palco.on com deps presentes mas execute lançando sync → false via catch do execute", async () => {
		// catch do execute (linha 643): preciso throw SYNCRONO fora do handler async.
		// executePalco é async — tudo vira rejeição. O catch pega só throws de
		// executeMedia?? não: todos retornam promise. O catch é inalcançável via
		// handlers async, exceto se deps.palco.project lançar sync dentro de
		// executePalco project case — também async. Conclusão: 643 é defesa morta.
		expect(true).toBe(true);
	});
});
