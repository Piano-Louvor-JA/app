import type { RouteRecordRaw } from 'vue-router'

import AlbumsView from './views/MultilingualAlbumsView.vue'
import AlbumCollectionView from './views/AlbumCollectionView.vue'

export const albumsRoutes: RouteRecordRaw[] = [
  {
    path: 'albums',
    name: 'albums',
    component: AlbumsView,
    meta: {
      navKey: 'albums',
    },
  },
  {
    path: 'albums/:collectionId',
    name: 'albums-collection',
    component: AlbumCollectionView,
    meta: {
      navKey: 'albums',
    },
  },
]
