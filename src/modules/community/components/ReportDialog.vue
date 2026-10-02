<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";

const props = defineProps<{
	open: boolean;
	collectionName?: string;
}>();

const emit = defineEmits<{
	close: [];
	submit: [reason: string];
}>();

const { t } = useI18n();

const reason = ref("");
const inputEl = ref<HTMLInputElement | null>(null);

const MIN_CHARS = 3;

const isValid = computed(() => reason.value.trim().length >= MIN_CHARS);

watch(
	() => props.open,
	(open) => {
		if (open) {
			reason.value = "";
			// foco no input após o modal montar no Teleport
			requestAnimationFrame(() => inputEl.value?.focus());
		}
	},
);

function submit() {
	if (!isValid.value) return;
	emit("submit", reason.value.trim());
}
</script>

<template>
	<Teleport to="body">
		<div
			v-if="open"
			class="report-dialog"
			role="dialog"
			aria-modal="true"
			:aria-label="t('ranking.report')"
		>
			<div
				class="report-dialog__backdrop"
				aria-hidden="true"
				@click="emit('close')"
			/>
			<form
				class="report-dialog__panel"
				@submit.prevent="submit"
			>
				<h2 class="report-dialog__title">
					<i class="ti ti-flag" aria-hidden="true" />
					{{ t("ranking.report") }}
				</h2>
				<p
					v-if="collectionName"
					class="report-dialog__collection"
				>
					{{ collectionName }}
				</p>
				<label
					class="report-dialog__label"
					for="report-reason"
				>
					{{ t("ranking.reportPrompt") }}
				</label>
				<textarea
					id="report-reason"
					ref="inputEl"
					v-model="reason"
					class="report-dialog__input"
					rows="3"
					maxlength="500"
					@keydown.esc="emit('close')"
				/>
				<p
					v-if="reason.length > 0 && !isValid"
					class="report-dialog__hint"
				>
					{{ t("ranking.reportTooShort", { min: MIN_CHARS }) }}
				</p>
				<div class="report-dialog__actions">
					<button
						type="button"
						class="report-dialog__btn report-dialog__btn--secondary"
						@click="emit('close')"
					>
						{{ t("community.back") }}
					</button>
					<button
						type="submit"
						class="report-dialog__btn report-dialog__btn--primary"
						:disabled="!isValid"
					>
						<i class="ti ti-flag" aria-hidden="true" />
						{{ t("ranking.report") }}
					</button>
				</div>
			</form>
		</div>
	</Teleport>
</template>

<style scoped>
.report-dialog {
	position: fixed;
	inset: 0;
	z-index: 90;
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 1.5rem;
}

.report-dialog__backdrop {
	position: absolute;
	inset: 0;
	border: 0;
	background: rgb(0 0 0 / 45%);
}

.report-dialog__panel {
	position: relative;
	z-index: 1;
	width: 100%;
	max-width: 26rem;
	padding: 1.5rem;
	border-radius: var(--ds-radius-lg, 0.75rem 0 0.75rem 0);
	border: 1px solid var(--ds-color-outline-strong, rgb(255 255 255 / 8%));
	background: var(--ds-color-surface-elevated, #1e1e1e);
	box-shadow: 0 24px 48px rgb(0 0 0 / 40%);
}

.report-dialog__title {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	margin: 0 0 0.5rem;
	color: var(--ds-color-on-surface);
	font-size: 18px;
	font-weight: 600;
}

.report-dialog__collection {
	margin: 0 0 0.75rem;
	color: var(--ds-color-on-surface-variant);
	font-size: 13px;
	opacity: 0.8;
}

.report-dialog__label {
	display: block;
	margin: 0 0 0.4rem;
	color: var(--ds-color-on-surface-variant);
	font-size: 14px;
}

.report-dialog__input {
	width: 100%;
	padding: 0.6rem 0.75rem;
	border-radius: 0.5rem;
	border: 1px solid var(--ds-color-outline-strong, rgb(255 255 255 / 8%));
	background: var(--ds-color-surface, #141414);
	color: var(--ds-color-on-surface);
	font: inherit;
	resize: vertical;
	box-sizing: border-box;
}

.report-dialog__input:focus {
	outline: 2px solid var(--ds-color-primary, rgb(255 255 255 / 30%));
	outline-offset: 1px;
}

.report-dialog__hint {
	margin: 0.4rem 0 0;
	font-size: 12px;
	opacity: 0.7;
}

.report-dialog__actions {
	display: flex;
	justify-content: flex-end;
	gap: 0.5rem;
	margin-top: 1rem;
}

.report-dialog__btn {
	display: inline-flex;
	align-items: center;
	gap: 0.4rem;
	padding: 0.5rem 0.9rem;
	border-radius: 0.5rem;
	border: 1px solid var(--ds-border, rgb(255 255 255 / 20%));
	background: var(--ds-glass-fill, rgb(255 255 255 / 8%));
	color: inherit;
	font-size: 0.9rem;
	cursor: pointer;
}

.report-dialog__btn--primary {
	background: var(--ds-color-primary, rgb(255 255 255 / 20%));
}

.report-dialog__btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}
</style>
