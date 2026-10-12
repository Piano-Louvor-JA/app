import { describe, expect, it } from "vitest";

import type {
	MonitorArrangementSlot,
	SystemDisplay,
} from "../../types/projection";
import {
	arrangementFromSystemBounds,
	buildMonitorLayout,
	canvasDeltaToVirtual,
	pruneArrangement,
	upsertArrangementSlot,
} from "../monitor-layout";

const display = (overrides: Partial<SystemDisplay> = {}): SystemDisplay => ({
	id: 1,
	bounds: { x: 0, y: 0, width: 1920, height: 1080 },
	workArea: { x: 0, y: 0, width: 1920, height: 1040 },
	scaleFactor: 1,
	isPrimary: true,
	...overrides,
});

describe("buildMonitorLayout", () => {
	it("retorna plano vazio sem displays", () => {
		const plan = buildMonitorLayout([], [], 800, 600);
		expect(plan.tiles).toEqual([]);
		expect(plan.canvasWidth).toBe(800);
		expect(plan.scale).toBe(1);
		expect(plan.worldMinX).toBe(0);
	});

	it("retorna plano vazio com stage inválido", () => {
		const plan = buildMonitorLayout([display()], [], 0, 600);
		expect(plan.tiles).toEqual([]);
		expect(plan.canvasWidth).toBe(0);
	});

	it("gera tile com label e resolução", () => {
		const plan = buildMonitorLayout([display()], [], 800, 600);
		expect(plan.tiles).toHaveLength(1);
		const tile = plan.tiles[0];
		expect(tile.id).toBe(1);
		expect(tile.index).toBe(1);
		expect(tile.label).toBe("Monitor 1");
		expect(tile.resolutionLabel).toBe("1920 × 1080");
		expect(tile.isPrimary).toBe(true);
	});

	it("aplica boost no monitor primário", () => {
		const primary = buildMonitorLayout(
			[display({ isPrimary: true })],
			[],
			800,
			600,
		);
		const secondary = buildMonitorLayout(
			[display({ isPrimary: false })],
			[],
			800,
			600,
		);
		expect(primary.tiles[0].width).toBeGreaterThan(secondary.tiles[0].width);
	});

	it("respeita posições customizadas do arranjo", () => {
		const arrangement: MonitorArrangementSlot[] = [
			{ displayId: 1, x: 500, y: 300 },
		];
		const plan = buildMonitorLayout([display()], arrangement, 800, 600);
		const tile = plan.tiles[0];
		// virtual.x customizado aparece no cálculo do centro (≠ posição do sistema)
		expect(tile.virtual).toEqual({ x: 500, y: 300, width: 1920, height: 1080 });
	});

	it("múltiplos monitores: índices sequenciais e bounds mesclados", () => {
		const displays = [
			display({ id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } }),
			display({
				id: 2,
				isPrimary: false,
				bounds: { x: 1920, y: 0, width: 1366, height: 768 },
			}),
		];
		const plan = buildMonitorLayout(displays, [], 1000, 800);
		expect(plan.tiles.map((t) => t.index)).toEqual([1, 2]);
		expect(plan.tiles[1].resolutionLabel).toBe("1366 × 768");
		expect(plan.worldMinX).toBe(0);
	});

	it("worldMin negativo com monitor à esquerda", () => {
		const displays = [
			display({ id: 1, bounds: { x: -1920, y: 0, width: 1920, height: 1080 } }),
			display({ id: 2, bounds: { x: 0, y: 0, width: 1920, height: 1080 } }),
		];
		const plan = buildMonitorLayout(displays, [], 1000, 800);
		expect(plan.worldMinX).toBe(-1920);
	});
});

describe("canvasDeltaToVirtual", () => {
	it("converte delta por escala", () => {
		expect(canvasDeltaToVirtual(100, 50, 0.5)).toEqual({ x: 200, y: 100 });
	});

	it("escala zero/zera resultado", () => {
		expect(canvasDeltaToVirtual(100, 50, 0)).toEqual({ x: 0, y: 0 });
		expect(canvasDeltaToVirtual(100, 50, -1)).toEqual({ x: 0, y: 0 });
	});
});

describe("upsertArrangementSlot", () => {
	it("insere slot novo", () => {
		const result = upsertArrangementSlot([], 7, 10, 20);
		expect(result).toEqual([{ displayId: 7, x: 10, y: 20 }]);
	});

	it("substitui slot existente sem duplicar", () => {
		const current: MonitorArrangementSlot[] = [
			{ displayId: 7, x: 1, y: 2 },
			{ displayId: 8, x: 3, y: 4 },
		];
		const result = upsertArrangementSlot(current, 7, 50, 60);
		expect(result).toEqual([
			{ displayId: 8, x: 3, y: 4 },
			{ displayId: 7, x: 50, y: 60 },
		]);
	});
});

describe("arrangementFromSystemBounds", () => {
	it("espelha os bounds do sistema", () => {
		const displays = [
			display({ id: 1, bounds: { x: 0, y: 0, width: 100, height: 50 } }),
			display({ id: 2, bounds: { x: 100, y: 0, width: 100, height: 50 } }),
		];
		expect(arrangementFromSystemBounds(displays)).toEqual([
			{ displayId: 1, x: 0, y: 0 },
			{ displayId: 2, x: 100, y: 0 },
		]);
	});
});

describe("pruneArrangement", () => {
	it("remove slots de displays inexistentes", () => {
		const arrangement: MonitorArrangementSlot[] = [
			{ displayId: 1, x: 0, y: 0 },
			{ displayId: 2, x: 10, y: 0 },
			{ displayId: 3, x: 20, y: 0 },
		];
		expect(pruneArrangement(arrangement, [1, 3])).toEqual([
			{ displayId: 1, x: 0, y: 0 },
			{ displayId: 3, x: 20, y: 0 },
		]);
	});

	it("lista vazia → sem slots", () => {
		expect(pruneArrangement([{ displayId: 1, x: 0, y: 0 }], [])).toEqual([]);
	});
});
