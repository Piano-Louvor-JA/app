import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import PublicationRulesCard from "../PublicationRulesCard.vue";

// RED primeiro (SPEC comunidade-coc RF-2/RF-3) — espera falhar antes do componente mudar.
vi.mock("vue-i18n", () => ({
	useI18n: () => ({
		t: (key: string) => {
			const dict: Record<string, string> = {
				"media.publishRules.title": "Regras da Comunidade",
				"media.publishRules.readFull": "Leia o Código completo",
				"media.publishRules.conduct.title": "Conduta",
				"media.publishRules.conduct.summary":
					"Publique conteúdo que glorifique a Deus, com mensagem genuína e respeito aos direitos autorais. Não é permitido conteúdo impróprio, contrário às crenças adventistas, spam ou assédio. Reports e strikes seguem moderação transparente com direito a recurso.",
			};
			return dict[key] ?? key;
		},
	}),
}));

describe("PublicationRulesCard — CoC (SPEC comunidade-coc)", () => {
	it("RF-2: renderiza link para /conduta com noopener em nova aba", () => {
		const wrapper = mount(PublicationRulesCard, { attachTo: document.body });
		const link = wrapper.find('a[data-testid="coc-full-link"]');
		expect(link.exists()).toBe(true);
		expect(link.attributes("href")).toBe("https://pianolouvorja.com.br/conduta");
		expect(link.attributes("target")).toBe("_blank");
		expect(link.attributes("rel")).toContain("noopener");
		wrapper.unmount();
	});

	it("RF-3: renderiza seção Conduta offline (texto fixo, sem rede)", () => {
		const wrapper = mount(PublicationRulesCard, { attachTo: document.body });
		const section = wrapper.find('[data-testid="coc-conduct-summary"]');
		expect(section.exists()).toBe(true);
		expect(section.text()).toContain("glorifique a Deus");
		expect(section.find("a").exists()).toBe(false);
		wrapper.unmount();
	});

	it("mantém as 5 regras originais de publicação intactas", () => {
		const wrapper = mount(PublicationRulesCard, { attachTo: document.body });
		expect(wrapper.findAll(".pub-rules__item").length).toBe(5);
		wrapper.unmount();
	});
});
