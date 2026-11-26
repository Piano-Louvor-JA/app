import type { RouteRecordRaw } from "vue-router";

import CommunityCollectionView from "./views/CommunityCollectionView.vue";
import CommunityView from "./views/CommunityView.vue";
import MyCommunityCopiesView from "./views/MyCommunityCopiesView.vue";
import MyCommunityCollectionsView from "./views/MyCommunityCollectionsView.vue";
import RankingView from "./views/RankingView.vue";
import WeeklyTasksView from "./views/WeeklyTasksView.vue";
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
		// Adendo v1.1.0: view PRÓPRIA das cópias salvas (saiu da lista inline
		// da CommunityView para não poluir a interface).
		path: "community/copies",
		name: "community-copies",
		component: MyCommunityCopiesView,
		meta: {
			navKey: "community",
		},
	},
	{
		// Adendo v1.1.0: coletâneas custom PRÓPRIAS reusam a tela de detalhe
		// da Central (mesma UX das cópias, D3), resolvidas sob demanda.
		path: "community/custom/:collectionId",
		name: "community-custom",
		component: AlbumCollectionView,
		meta: {
			navKey: "community",
		},
	},
	{
		// Adendo v1.1.0: view PRÓPRIA das coletâneas produzidas pelo usuário
		// (nunca na Central de Mídia; adendo v1.1.0 do SPEC).
		path: "community/my-collections",
		name: "community-my-collections",
		component: MyCommunityCollectionsView,
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
	{
		// Adendo premium/clean (23/11): "Tarefas da semana" saiu do card da
		// CommunityView e ganhou view própria, entrada via botão no header.
		path: "community/tasks",
		name: "community-tasks",
		component: WeeklyTasksView,
		meta: {
			navKey: "community",
		},
	},
];
