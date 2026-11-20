<script setup lang="ts">
// Regras de publicação na Comunidade — exibidas quando o usuário escolhe
// tornar uma coletânea pública (opt-in). Card reutilizável (web/apk no futuro).
// Especificação: Ranking-Gamificacao-Coletaneas-Comunidade-SPEC.md (RF-1/RF-6).
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const rules = [
	{ key: "visibleToAll", icon: "ti-eye" },
	{ key: "displayName", icon: "ti-user" },
	{ key: "readOnlyCopy", icon: "ti-copy" },
	{ key: "moderation", icon: "ti-flag" },
	{ key: "ranking", icon: "ti-trophy" },
] as const;

// SPEC comunidade-coc: URL central do Código de Conduta publicado no site.
const COC_URL = "https://pianolouvorja.com.br/conduta";
</script>

<template>
	<div
		class="pub-rules"
		role="note"
		:aria-label="t('media.publishRules.title')"
	>
		<p class="pub-rules__title">{{ t("media.publishRules.title") }}</p>
		<ul class="pub-rules__list">
			<li
				v-for="rule in rules"
				:key="rule.key"
				class="pub-rules__item"
			>
				<i
					:class="`ti ${rule.icon}`"
					aria-hidden="true"
				/>
				<span>{{ t(`media.publishRules.${rule.key}`) }}</span>
			</li>
		</ul>
		<div class="pub-rules__coc">
			<p class="pub-rules__coc-title">{{ t("media.publishRules.conduct.title") }}</p>
			<p
				class="pub-rules__coc-summary"
				data-testid="coc-conduct-summary"
			>
				{{ t("media.publishRules.conduct.summary") }}
			</p>
			<a
				:href="COC_URL"
				target="_blank"
				rel="noopener noreferrer"
				data-testid="coc-full-link"
				class="pub-rules__coc-link"
			>
				{{ t("media.publishRules.readFull") }}
			</a>
		</div>
	</div>
</template>

<style scoped>
.pub-rules {
	border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.2));
	border-radius: 10px;
	padding: 0.6rem 0.8rem;
	margin: 0.4rem 0;
	background: rgba(255, 255, 255, 0.06);
}

.pub-rules__title {
	margin: 0 0 0.35rem;
	font-size: 0.85rem;
	font-weight: 600;
}

.pub-rules__list {
	list-style: none;
	margin: 0;
	padding: 0;
	display: grid;
	gap: 0.3rem;
}

.pub-rules__item {
	display: flex;
	align-items: flex-start;
	gap: 0.4rem;
	font-size: 0.78rem;
	opacity: 0.9;
	line-height: 1.3;
}

.pub-rules__item .ti {
	flex-shrink: 0;
	margin-top: 0.1rem;
}
</style>

<style scoped>
.pub-rules__coc {
	border-top: 1px solid var(--glass-border, rgba(255, 255, 255, 0.2));
	margin-top: 0.45rem;
	padding-top: 0.45rem;
}

.pub-rules__coc-title {
	margin: 0 0 0.25rem;
	font-size: 0.8rem;
	font-weight: 600;
}

.pub-rules__coc-summary {
	margin: 0 0 0.3rem;
	font-size: 0.74rem;
	opacity: 0.85;
	line-height: 1.35;
}

.pub-rules__coc-link {
	font-size: 0.76rem;
	color: var(--accent, #d4a649);
}
</style>
