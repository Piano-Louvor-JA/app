import { computed, ref } from "vue";

import {
	loadHomeLocation,
	saveHomeLocation,
} from "../services/home-preferences";
import type { HomeLocationProfile } from "../types/home";

export function useHomeLocation() {
	const profile = ref<HomeLocationProfile>(loadHomeLocation());

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

	return {
		profile,
		hasDistrict,
		hasChurch,
		setDistrict,
		setChurch,
	};
}
