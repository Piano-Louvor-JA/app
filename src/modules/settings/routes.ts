import type { RouteRecordRaw } from 'vue-router'

import AppearanceView from './views/AppearanceView.vue'
import GeneralView from './views/GeneralView.vue'
import MediaView from './views/MediaView.vue'
import ProjectionView from './views/ProjectionView.vue'
import RemotePairingView from '@modules/remote/views/RemotePairingView.vue'
import { isElectronShell } from '@shared/services/desktop-bridge'
import SettingsView from './views/SettingsView.vue'
import TransmissionView from './views/TransmissionView.vue'
import PalcoView from './views/PalcoView.vue'
import ConnectionsView from './views/ConnectionsView.vue'

export const settingsRoutes: RouteRecordRaw[] = [
  {
    path: 'settings',
    component: SettingsView,
    meta: {
      navKey: 'settings',
    },
    redirect: { name: 'settings-appearance' },
    children: [
      {
        path: 'appearance',
        name: 'settings-appearance',
        component: AppearanceView,
        meta: {
          navKey: 'settings',
        },
      },
      // Geral
      {
        path: 'general',
        name: 'settings-general',
        component: GeneralView,
        meta: {
          navKey: 'settings',
        },
      },
      // Mídia — reativada: player externo (app#177), engine PPTX (app#176)
      // e conta YouTube precisam de um lugar visível pro usuário.
      {
        path: 'media',
        name: 'settings-media',
        component: MediaView,
        meta: {
          navKey: 'settings',
        },
      },
      {
        path: 'projection',
        name: 'settings-projection',
        component: ProjectionView,
        meta: {
          navKey: 'settings',
        },
      },
      {
        path: 'transmission',
        name: 'settings-transmission',
        component: TransmissionView,
        meta: { navKey: 'settings' },
      },
      // Conexões remotas: agregador de Transmissão, Controle Remoto e Palco.
      {
        path: 'connections',
        name: 'settings-connections',
        component: ConnectionsView,
        meta: { navKey: 'settings' },
      },
      // Palco: TVs com o app Palco conectadas às transmissões (paridade
      // Ferramentas › Palco do apk).
      {
        path: 'palco',
        name: 'settings-palco',
        component: PalcoView,
        meta: { navKey: 'settings' },
      },
      // Controle remoto — desktop: WS :48080 (RemotePairingView);
      // web: P2P WebRTC 2-QR (P2pPairingView), sem servidor.
      {
        path: 'remote',
        name: 'settings-remote',
        component: isElectronShell()
          ? RemotePairingView
          : () => import('@modules/remote/views/WsPairingView.vue'),
        meta: {
          navKey: 'settings',
        },
      },
    ],
  },
]
