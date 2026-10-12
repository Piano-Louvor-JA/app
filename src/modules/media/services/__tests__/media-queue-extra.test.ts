// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

/**
 * media-queue — funções puras da fila (RF-03). Complemento: ramos de
 * borda que o arquivo principal não cobre.
 */
import {
	appendToQueue,
	type QueueItem,
	removeFromQueue,
	reorderQueue,
	resolveNext,
	resolvePrevious,
	shuffleQueue,
} from "../media-queue";

const item = (id: number): QueueItem => ({
	musicId: id,
	albumId: null,
	title: `M${id}`,
});

describe("resolveNext/Previous — bordas", () => {
	it("next no fim → null", () => {
		expect(resolveNext({ items: [item(1)], index: 0 })).toBeNull();
	});

	it("next em fila vazia → null", () => {
		expect(resolveNext({ items: [], index: 0 })).toBeNull();
	});

	it("previous no início → null", () => {
		expect(resolvePrevious({ items: [item(1), item(2)], index: 0 })).toBeNull();
	});

	it("previous válido retorna a anterior", () => {
		expect(
			resolvePrevious({ items: [item(1), item(2)], index: 1 })?.musicId,
		).toBe(1);
	});

	it("slot vazio na fila (hole) → null via ??", () => {
		const holey = [item(1), undefined as unknown as QueueItem, item(3)];
		expect(resolveNext({ items: holey, index: 0 })).toBeNull();
		expect(resolvePrevious({ items: holey, index: 2 })).toBeNull();
	});
});

describe("appendToQueue — duplicata consecutiva", () => {
	it("mesma faixa no fim → sem append", () => {
		const items = [item(1), item(2)];
		const result = appendToQueue(items, item(2), 1);
		expect(result.items).toHaveLength(2);
		expect(result.index).toBe(1);
	});

	it("faixa nova → append e índice mantido", () => {
		const result = appendToQueue([item(1)], item(2), 0);
		expect(result.items).toHaveLength(2);
		expect(result.index).toBe(0);
	});
});

describe("removeFromQueue — bordas", () => {
	const items = [item(1), item(2), item(3)];

	it("índice fora da fila → intacto", () => {
		expect(removeFromQueue(items, -1, 1).removedCurrent).toBe(false);
		expect(removeFromQueue(items, 9, 1).items).toHaveLength(3);
	});

	it("remover anterior da atual ajusta índice", () => {
		const result = removeFromQueue(items, 0, 2);
		expect(result.index).toBe(1);
		expect(result.removedCurrent).toBe(false);
	});

	it("remover posterior da atual mantém índice", () => {
		const result = removeFromQueue(items, 2, 0);
		expect(result.index).toBe(0);
	});

	it("remover a atual → index -1 e flag", () => {
		const result = removeFromQueue(items, 1, 1);
		expect(result.removedCurrent).toBe(true);
		expect(result.index).toBe(-1);
	});
});

describe("reorderQueue", () => {
	const items = [item(1), item(2), item(3)];

	it("reordena rastreando a atual", () => {
		const result = reorderQueue(items, 0, [3, 1, 2], 0);
		expect(result.items.map((i) => i.musicId)).toEqual([3, 1, 2]);
		expect(result.index).toBe(1); // música 1
	});

	it("ids desconhecidos filtrados", () => {
		const result = reorderQueue(items, 0, [2, 99, 1], 0);
		expect(result.items.map((i) => i.musicId)).toEqual([2, 1]);
	});

	it("índice atual inválido → -1", () => {
		const result = reorderQueue(items, 9, [1, 2, 3], 9);
		expect(result.index).toBe(-1);
	});
});

describe("shuffleQueue", () => {
	const many = [item(1), item(2), item(3), item(4), item(5)];

	it("fila curta (<=2) intacta", () => {
		const short = [item(1), item(2)];
		const result = shuffleQueue(short, 0);
		expect(result.items).toBe(short);
		expect(result.index).toBe(0);
	});

	it("índice inválido → intacto", () => {
		const result = shuffleQueue(many, 42);
		expect(result.items).toBe(many);
		expect(result.index).toBe(42);
	});

	it("shuffle mantém a atual primeiro e todas as faixas", () => {
		const result = shuffleQueue(many, 2);
		expect(result.items[0]?.musicId).toBe(3);
		expect(result.index).toBe(0);
		expect(
			[...result.items]
				.sort((a, b) => a.musicId - b.musicId)
				.map((i) => i.musicId),
		).toEqual([1, 2, 3, 4, 5]);
	});
});
