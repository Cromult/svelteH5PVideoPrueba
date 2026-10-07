<script lang="ts">
	import { uid } from '#lib/project.svelte.ts';
	import type { MultipleChoice } from '#lib/types.ts';

	let { interaction }: { interaction: MultipleChoice } = $props();

	function toggleCorrect(id: string) {
		for (const o of interaction.options) {
			if (o.id === id) o.correct = interaction.multiple ? !o.correct : true;
			else if (!interaction.multiple) o.correct = false;
		}
	}

	function setMultiple(multiple: boolean) {
		interaction.multiple = multiple;
		if (!multiple) {
			// Al volver a respuesta única, conservar solo la primera correcta.
			let seen = false;
			for (const o of interaction.options) {
				if (o.correct && !seen) seen = true;
				else o.correct = false;
			}
		}
	}
</script>

<div class="field">
	<span class="label">Modo</span>
	<div class="seg">
		<button class:on={!interaction.multiple} onclick={() => setMultiple(false)}>Una respuesta</button>
		<button class:on={interaction.multiple} onclick={() => setMultiple(true)}>Varias respuestas</button>
	</div>
</div>

<div class="field">
	<span class="label">Opciones <span class="hint">· marca la(s) correcta(s)</span></span>
	<ul>
		{#each interaction.options as option, idx (option.id)}
			<li class:correct={option.correct}>
				<button
					class="check"
					class:round={!interaction.multiple}
					onclick={() => toggleCorrect(option.id)}
					aria-label={option.correct ? 'Correcta' : 'Marcar como correcta'}
					aria-pressed={option.correct}
				>
					{option.correct ? '✓' : ''}
				</button>
				<input class="input" bind:value={option.text} placeholder="Opción {idx + 1}" />
				<button
					class="btn ghost small"
					disabled={interaction.options.length <= 2}
					onclick={() => (interaction.options = interaction.options.filter((o) => o.id !== option.id))}
					aria-label="Quitar opción">✕</button
				>
			</li>
		{/each}
	</ul>
	<button class="btn small" onclick={() => interaction.options.push({ id: uid(), text: '', correct: false })}>
		+ Opción
	</button>
</div>

<style>
	.field {
		display: grid;
		gap: 6px;
	}
	.hint {
		font-weight: 400;
	}
	.seg {
		display: inline-flex;
		background: var(--surface-2);
		border-radius: var(--radius);
		padding: 3px;
		gap: 3px;
		justify-self: start;
	}
	.seg button {
		border: none;
		background: transparent;
		padding: 5px 12px;
		border-radius: 8px;
		font-size: 13px;
		font-weight: 600;
		color: var(--muted);
		cursor: pointer;
	}
	.seg button.on {
		background: var(--surface);
		color: var(--text);
		box-shadow: 0 1px 3px rgb(0 0 0 / 0.12);
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 6px;
	}
	li {
		display: flex;
		gap: 6px;
		align-items: center;
	}
	.check {
		flex: none;
		width: 26px;
		height: 26px;
		border-radius: 6px;
		border: 2px solid var(--border);
		background: var(--surface);
		color: #fff;
		font-weight: 700;
		cursor: pointer;
		padding: 0;
	}
	.check.round {
		border-radius: 50%;
	}
	li.correct .check {
		background: var(--ok);
		border-color: var(--ok);
	}
	li.correct .input {
		border-color: var(--ok);
	}
	.btn.small {
		justify-self: start;
	}
</style>
