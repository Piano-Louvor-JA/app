import type { RouteRecordRaw } from "vue-router";

import AlbumCollectionView from "@modules/albums/views/AlbumCollectionView.vue";
import CommunityCopiesView from "./views/CommunityCopiesView.vue";
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
		path: "community/copies",
		name: "community-copies",
		component: CommunityCopiesView,
		meta: {
			navKey: "community",
		},
	},
	// D3 (SPEC-louvorja-community-copies): detalhe da cópia REUSA o
	// AlbumCollectionView — mesmo player/editor das coletâneas manuais.
	{
		path: "community/copies/:collectionId",
		name: "community-copies-collection",
		component: AlbumCollectionView,
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
