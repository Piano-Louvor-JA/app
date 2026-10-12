import type { RouteRecordRaw } from "vue-router";

import HomeView from "./views/HomeView.vue";

export const homeRoutes: RouteRecordRaw[] = [
	{
		path: "",
		name: "home",
		component: HomeView,
		meta: {
			navKey: "home",
		},
	},
];
