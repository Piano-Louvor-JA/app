// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({
	useI18n: () => ({
		t: (k: string, params?: Record<string, unknown>) =>
			params ? `${k} ${JSON.stringify(params)}` : k,
		locale: { value: 'pt-BR' },
	}),
	createI18n: () => ({ global: { locale: 'pt-BR', t: (k: string) => k } }),
}))

import PublicationRulesCard from '../PublicationRulesCard.vue'

beforeEach(() => {
	vi.clearAllMocks()
})

describe('PublicationRulesCard (t_35e4d3ea)', () => {
	it('renderiza título e as 5 regras (note/aria-label)', () => {
		const wrapper = mount(PublicationRulesCard)
		const root = wrapper.find('.pub-rules')
		expect(root.exists()).toBe(true)
		expect(root.attributes('role')).toBe('note')
		expect(root.attributes('aria-label')).toBe('media.publishRules.title')
		expect(wrapper.find('.pub-rules__title').text()).toContain(
			'media.publishRules.title',
		)
		// 5 regras: rede, autor, cópia, moderação, ranking
		expect(wrapper.findAll('.pub-rules__item')).toHaveLength(5)
	})

	it('contém as chaves de regra esperadas (ícones fixos)', () => {
		const wrapper = mount(PublicationRulesCard)
		const text = wrapper.text()
		for (const key of [
			'media.publishRules.visibleToAll',
			'media.publishRules.displayName',
			'media.publishRules.readOnlyCopy',
			'media.publishRules.moderation',
			'media.publishRules.ranking',
		]) {
			expect(text).toContain(key)
		}
	})

	it('ícones de cada regra presentes (eye/user/copy/flag/trophy)', () => {
		const wrapper = mount(PublicationRulesCard)
		for (const icon of [
			'ti-eye',
			'ti-user',
			'ti-copy',
			'ti-flag',
			'ti-trophy',
		]) {
			expect(wrapper.find(`.${icon}`).exists()).toBe(true)
		}
	})

	it('aceita collectionName opcional (não renderiza nada extra)', () => {
		const wrapper = mount(PublicationRulesCard, {
			props: { collectionName: 'X' },
		})
		expect(wrapper.findAll('.pub-rules__item')).toHaveLength(5)
	})
})
