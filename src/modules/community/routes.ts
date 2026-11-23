import type { RouteRecordRaw } from "vue-router";

import CommunityCollectionView from "./views/CommunityCollectionView.vue";
import CommunityView from "./views/CommunityView.vue";
import RankingView from "./views/RankingView.vue";
// D3 (SPEC louvorja-community-copies v1.0.0): cópias da Comunidade REUSAM
// a tela de detalhe da Central (mesma UX), mas vivem em rota da aba Comunidade.
import AlbumCollectionView from "@modules/albums/views/AlbumCollectionView.vue";

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
		path: "community/copies/:collectionId",
		name: "community-copy",
		component: AlbumCollectionView,
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
