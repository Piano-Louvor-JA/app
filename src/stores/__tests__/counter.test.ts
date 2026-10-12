import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { useCounterStore } from "../counter";

describe("useCounterStore", () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it("começa em zero e dobra", () => {
		const store = useCounterStore();
		expect(store.count).toBe(0);
		expect(store.doubleCount).toBe(0);
	});

	it("incrementa e recalcula o dobro", () => {
		const store = useCounterStore();
		store.increment();
		store.increment();
		expect(store.count).toBe(2);
		expect(store.doubleCount).toBe(4);
	});
});
