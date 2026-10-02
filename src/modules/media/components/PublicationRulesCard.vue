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
