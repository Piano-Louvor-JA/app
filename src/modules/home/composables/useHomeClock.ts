import { useClockTick } from "@modules/clock/composables/useClock";
import { computed } from "vue";

/** Relógio digital HH:MM:SS da Home (Stitch). */
export function useHomeClock() {
	const { now } = useClockTick();

	const formattedTime = computed(() => {
		const hours = String(now.value.getHours()).padStart(2, "0");
		const minutes = String(now.value.getMinutes()).padStart(2, "0");
		const seconds = String(now.value.getSeconds()).padStart(2, "0");
		return `${hours}:${minutes}:${seconds}`;
	});

	return { formattedTime };
}
