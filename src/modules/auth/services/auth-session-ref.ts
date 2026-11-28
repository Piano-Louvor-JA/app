/**
 * auth-session-ref — o ref global da sessão de autenticação, isolado do
 * useAuth (que importa i18n/firebase). Views leves assistem este ref sem
 * puxar a árvore inteira (t_c68a47ac: watch de login no MediaEditorView).
 */
import { ref } from 'vue'
import { getAuthSession, type AuthSession } from '../../media/services/auth-client'

export const authSession = ref<AuthSession | null>(getAuthSession())
