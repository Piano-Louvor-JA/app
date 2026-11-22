import type { RouteRecordRaw } from "vue-router";

import CommunityCollectionView from "./views/CommunityCollectionView.vue";
import CommunityView from "./views/CommunityView.vue";
import RankingView from "./views/RankingView.vue";

export const communityRoutes: RouteRecordRaw[] = [
	{
		path: "community",
		name: "community",
		component: CommunityView,
		meta: {
			navKey: "community",
		},
	},
	{
		path: "community/collections/:collectionId",
		name: "community-collection",
		component: CommunityCollectionView,
		meta: {
			navKey: "community",
		},
	},
	{
		path: "community/ranking",
		name: "community-ranking",
		component: RankingView,
		meta: {
			navKey: "community",
		},
	},
];
