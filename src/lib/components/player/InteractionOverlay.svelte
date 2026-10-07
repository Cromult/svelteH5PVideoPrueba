<script lang="ts">
	import { grade } from '#lib/grading.ts';
	import { formatTime } from '#lib/project.svelte.ts';
	import { TYPE_LABELS, type GradeResult, type Interaction, type Response } from '#lib/types.ts';
	import MatchingView from './MatchingView.svelte';
	import MultipleChoiceView from './MultipleChoiceView.svelte';
	import ShortAnswerView from './ShortAnswerView.svelte';
	import TrueFalseView from './TrueFalseView.svelte';

	interface Props {
		interaction: Interaction;
		index: number;
		total: number;
		/** Se registra la respuesta calificada. */
		onanswer: (response: Response, result: GradeResult) => void;
		/** Seguir con el video desde la pregunta. */
		oncontinue: () => void;
		/** Retroceder al segundo indicado (adaptatividad). */
		onrewind: (time: number) => void;
		/** Saltar una pregunta no obligatoria. */
		onskip?: () => void;
		/** El estudiante reintenta: se descarta la respuesta anterior. */
		onretry?: () => void;
	}

	let { interaction, index, total, onanswer, oncontinue, onrewind, onskip, onretry }: Props = $props();

	let selected = $state<string[]>([]);
	let tf = $state<boolean | null>(null);
	let text = $state('');
	let links = $state<Record<string, string>>({});
	let result = $state<GradeResult | null>(null);
	let attempt = $state(0);

	const response = $derived.by((): Response => {
		switch (interaction.type) {
			case 'multiple-choice':
				return { type: 'multiple-choice', selected };
			case 'true-false':
				return { type: 'true-false', value: tf };
			case 'short-answer':
				return { type: 'short-answer', text };
			case 'matching':
				return { type: 'matching', links };
		}
	});

	const canSubmit = $derived.by(() => {
		if (result) return false;
		switch (interaction.type) {
			case 'multiple-choice':
				return selected.length > 0;
			case 'true-false':
				return tf !== null;
			case 'short-answer':
				return text.trim().length > 0;
			case 'matching':
				return (
					Object.keys(links).length === interaction.pairs.filter((p) => p.left.trim() && p.right.trim()).length
				);
		}
	});

	function submit() {
		if (!canSubmit) return;
		const snapshot = $state.snapshot(response) as Response;
		result = grade(interaction, snapshot);
		onanswer(snapshot, result);
	}

	function retry() {
		selected = [];
		tf = null;
		text = '';
		links = {};
		result = null;
		attempt++;
		onretry?.();
	}

	const partial = $derived(result && !result.correct && result.score > 0);
</script>

<div class="card dialog" role="dialog" aria-modal="true" aria-labelledby="q-title">
	<header>
		<span class="badge">Pregunta {index + 1} de {total} · {TYPE_LABELS[interaction.type]}</span>
		<span class="muted pts">{interaction.points} pt{interaction.points === 1 ? '' : 's'}</span>
	</header>

	<h2 id="q-title">{interaction.question}</h2>

	{#key attempt}
		<div class="body">
			{#if interaction.type === 'multiple-choice'}
				<MultipleChoiceView {interaction} bind:selected revealed={!!result} />
			{:else if interaction.type === 'true-false'}
				<TrueFalseView {interaction} bind:value={tf} revealed={!!result} />
			{:else if interaction.type === 'short-answer'}
				<ShortAnswerView {interaction} bind:text revealed={!!result} correct={!!result?.correct} onenter={submit} />
			{:else if interaction.type === 'matching'}
				<MatchingView {interaction} bind:links revealed={!!result} />
			{/if}
		</div>
	{/key}

	{#if result}
		<div class="feedback" class:ok={result.correct} class:partial class:bad={!result.correct && !partial}>
			<strong>
				{result.correct ? '✓ ' : partial ? '◐ ' : '✗ '}
				{result.correct ? interaction.feedbackCorrect || '¡Correcto!' : interaction.feedbackIncorrect || 'Incorrecto'}
			</strong>
			<span>{result.score} / {result.max} pts</span>
		</div>
	{/if}

	<footer>
		{#if !result}
			{#if !interaction.required && onskip}
				<button class="btn ghost" onclick={onskip}>Saltar</button>
			{/if}
			<span class="spacer"></span>
			<button class="btn primary" disabled={!canSubmit} onclick={submit}>Comprobar</button>
		{:else if result.correct}
			<span class="spacer"></span>
			<button class="btn primary" onclick={oncontinue}>Continuar video ▶</button>
		{:else}
			<button class="btn ghost" onclick={retry}>↻ Reintentar</button>
			<span class="spacer"></span>
			{#if interaction.onFailSeekTo !== null}
				<button class="btn primary" onclick={() => onrewind(interaction.onFailSeekTo!)}>
					⟲ Volver a ver desde {formatTime(interaction.onFailSeekTo)}
				</button>
			{:else}
				<button class="btn primary" onclick={oncontinue}>Continuar video ▶</button>
			{/if}
		{/if}
	</footer>
</div>

<style>
	.dialog {
		width: min(640px, 100%);
		max-height: 100%;
		overflow: auto;
		padding: 20px 22px;
		display: grid;
		gap: 14px;
		animation: pop 0.22s cubic-bezier(0.2, 0.9, 0.3, 1.2);
	}
	@keyframes pop {
		from {
			transform: translateY(10px) scale(0.97);
			opacity: 0;
		}
	}
	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 8px;
	}
	.pts {
		font-size: 13px;
		font-weight: 600;
	}
	h2 {
		font-size: 19px;
	}
	.feedback {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		padding: 10px 14px;
		border-radius: var(--radius);
		font-size: 14px;
	}
	.feedback.ok {
		background: var(--ok-soft);
		color: var(--ok);
	}
	.feedback.bad {
		background: var(--bad-soft);
		color: var(--bad);
	}
	.feedback.partial {
		background: var(--warn-soft);
		color: var(--warn);
	}
	.feedback span {
		font-weight: 600;
		white-space: nowrap;
	}
	footer {
		display: flex;
		gap: 8px;
		align-items: center;
		flex-wrap: wrap;
	}
	.spacer {
		flex: 1;
	}
</style>
