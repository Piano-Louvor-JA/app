import { computed, ref } from "vue";

import {
	loadHomeLocation,
	saveHomeLocation,
} from "../services/home-preferences";
import type { HomeLocationProfile } from "../types/home";

/**
 * Estado único na janela: a Home e o assistente de primeira execução editam
 * o mesmo perfil; o que um grava aparece no outro sem recarregar.
 */
const profile = ref<HomeLocationProfile>(loadHomeLocation());

export function useHomeLocation() {
	// Relê a cada uso: pega o que o sync ou outra janela gravou no storage.
	profile.value = loadHomeLocation();

	const hasDistrict = computed(() => profile.value.district.length > 0);
	const hasChurch = computed(() => profile.value.church.length > 0);

	function persist(next: HomeLocationProfile) {
		const normalized: HomeLocationProfile = {
			district: next.district.trim(),
			church: next.church.trim(),
		};
		profile.value = normalized;
		saveHomeLocation(normalized);
	}

	function setDistrict(value: string) {
		persist({ ...profile.value, district: value });
	}

	function setChurch(value: string) {
		persist({ ...profile.value, church: value });
	}

	function setLocation(next: HomeLocationProfile) {
		persist(next);
	}

	return {
		profile,
		hasDistrict,
		hasChurch,
		setDistrict,
		setChurch,
		setLocation,
	};
}
