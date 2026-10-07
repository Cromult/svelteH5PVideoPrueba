<script lang="ts">
	import { validate } from '#lib/grading.ts';
	import { formatTimePrecise } from '#lib/project.svelte.ts';
	import { TYPE_ICONS, TYPE_LABELS, type Interaction } from '#lib/types.ts';
	import MatchingEditor from './MatchingEditor.svelte';
	import MultipleChoiceEditor from './MultipleChoiceEditor.svelte';
	import ShortAnswerEditor from './ShortAnswerEditor.svelte';
	import TrueFalseEditor from './TrueFalseEditor.svelte';

	interface Props {
		interaction: Interaction;
		currentTime: number;
		duration: number;
		onclose: () => void;
		ondelete: () => void;
		onduplicate: () => void;
		onjump: (time: number) => void;
	}

	let { interaction, currentTime, duration, onclose, ondelete, onduplicate, onjump }: Props = $props();

	const errors = $derived(validate(interaction));

	function setTime(value: number) {
		if (Number.isFinite(value)) interaction.time = Math.round(Math.min(Math.max(value, 0), duration) * 10) / 10;
	}

	function toggleRewind(on: boolean) {
		interaction.onFailSeekTo = on ? Math.max(0, Math.round((interaction.time - 10) * 10) / 10) : null;
	}
</script>

<div class="form">
	<header>
		<span class="type">{TYPE_ICONS[interaction.type]} {TYPE_LABELS[interaction.type]}</span>
		<button class="btn ghost small" onclick={onclose} aria-label="Cerrar">✕</button>
	</header>

	<div class="time-row">
		<div>
			<label class="label" for="q-time">Aparece en (segundos)</label>
			<div class="inline">
				<input
					id="q-time"
					class="input"
					type="number"
					min="0"
					max={duration}
					step="0.1"
					value={interaction.time}
					onchange={(e) => setTime(e.currentTarget.valueAsNumber)}
				/>
				<span class="muted mono">{formatTimePrecise(interaction.time)}</span>
			</div>
		</div>
		<div class="inline end">
			<button class="btn small" onclick={() => setTime(currentTime)} title="Mover la pregunta al punto actual del video">
				⌖ Usar tiempo actual
			</button>
			<button class="btn small" onclick={() => onjump(interaction.time)} title="Llevar el video a esta pregunta">
				▶ Ir
			</button>
		</div>
	</div>

	<div>
		<label class="label" for="q-text">Pregunta</label>
		<textarea id="q-text" class="textarea" bind:value={interaction.question} placeholder="Escribe el enunciado…"></textarea>
	</div>

	{#if interaction.type === 'multiple-choice'}
		<MultipleChoiceEditor {interaction} />
	{:else if interaction.type === 'true-false'}
		<TrueFalseEditor {interaction} />
	{:else if interaction.type === 'short-answer'}
		<ShortAnswerEditor {interaction} />
	{:else if interaction.type === 'matching'}
		<MatchingEditor {interaction} />
	{/if}

	<details>
		<summary>Configuración y retroalimentación</summary>
		<div class="settings">
			<div class="grid2">
				<div>
					<label class="label" for="q-points">Puntos</label>
					<input id="q-points" class="input" type="number" min="0.5" step="0.5" bind:value={interaction.points} />
				</div>
				<label class="switch">
					<input type="checkbox" bind:checked={interaction.required} />
					<span>
						<b>Obligatoria</b><br />
						<small class="muted">No deja adelantar el video sin responder</small>
					</span>
				</label>
			</div>

			<label class="switch">
				<input
					type="checkbox"
					checked={interaction.onFailSeekTo !== null}
					onchange={(e) => toggleRewind(e.currentTarget.checked)}
				/>
				<span>
					<b>Si falla, volver a ver una parte</b><br />
					<small class="muted">El video retrocede para que repase antes de seguir</small>
				</span>
			</label>
			{#if interaction.onFailSeekTo !== null}
				<div class="inline indent">
					<span class="muted">Retroceder al segundo</span>
					<input
						class="input narrow"
						type="number"
						min="0"
						max={interaction.time}
						step="0.1"
						bind:value={interaction.onFailSeekTo}
					/>
					<span class="muted mono">{formatTimePrecise(interaction.onFailSeekTo ?? 0)}</span>
				</div>
			{/if}

			<div>
				<label class="label" for="q-ok">Mensaje si acierta</label>
				<input id="q-ok" class="input" bind:value={interaction.feedbackCorrect} />
			</div>
			<div>
				<label class="label" for="q-bad">Mensaje si falla</label>
				<input id="q-bad" class="input" bind:value={interaction.feedbackIncorrect} />
			</div>
		</div>
	</details>

	{#if errors.length}
		<ul class="errors">
			{#each errors as e (e)}<li>{e}</li>{/each}
		</ul>
	{:else}
		<p class="ready">✓ Lista para el estudiante</p>
	{/if}

	<footer>
		<button class="btn ghost danger small" onclick={ondelete}>🗑 Eliminar</button>
		<button class="btn ghost small" onclick={onduplicate}>⧉ Duplicar</button>
		<span class="spacer"></span>
		<button class="btn primary small" onclick={onclose}>Listo</button>
	</footer>
</div>

<style>
	.form {
		display: grid;
		gap: 14px;
	}
	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.type {
		font-weight: 700;
		color: var(--accent);
	}
	.time-row {
		display: flex;
		justify-content: space-between;
		align-items: end;
		gap: 8px;
		flex-wrap: wrap;
	}
	.inline {
		display: flex;
		gap: 8px;
		align-items: center;
	}
	.inline .input {
		width: 110px;
	}
	.inline.end {
		justify-content: flex-end;
	}
	.indent {
		padding-left: 28px;
		flex-wrap: wrap;
	}
	.narrow {
		width: 90px !important;
	}
	.mono {
		font-variant-numeric: tabular-nums;
		font-size: 13px;
	}
	details {
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 10px 12px;
	}
	summary {
		cursor: pointer;
		font-weight: 600;
		font-size: 14px;
	}
	.settings {
		display: grid;
		gap: 12px;
		margin-top: 12px;
	}
	.grid2 {
		display: grid;
		grid-template-columns: 110px 1fr;
		gap: 12px;
		align-items: end;
	}
	.switch {
		display: flex;
		gap: 10px;
		align-items: flex-start;
		font-size: 14px;
		cursor: pointer;
		line-height: 1.35;
	}
	.switch input {
		margin-top: 3px;
		accent-color: var(--accent);
	}
	.errors {
		margin: 0;
		padding: 10px 12px 10px 28px;
		border-radius: var(--radius);
		background: var(--warn-soft);
		color: var(--warn);
		font-size: 13px;
	}
	.ready {
		margin: 0;
		font-size: 13px;
		color: var(--ok);
		font-weight: 600;
	}
	footer {
		display: flex;
		gap: 6px;
		align-items: center;
		border-top: 1px solid var(--border);
		padding-top: 12px;
	}
	.spacer {
		flex: 1;
	}
</style>
