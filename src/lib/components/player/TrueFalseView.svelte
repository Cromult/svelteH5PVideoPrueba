<script lang="ts">
	import type { TrueFalse } from '#lib/types.ts';

	interface Props {
		interaction: TrueFalse;
		value: boolean | null;
		revealed: boolean;
	}
	let { interaction, value = $bindable(), revealed }: Props = $props();
</script>

<div class="choices" role="radiogroup">
	{#each [true, false] as option (option)}
		<button
			class:sel={value === option}
			class:ok={revealed && interaction.answer === option}
			class:bad={revealed && value === option && interaction.answer !== option}
			disabled={revealed}
			onclick={() => (value = option)}
			role="radio"
			aria-checked={value === option}
		>
			<span class="ico">{option ? '✓' : '✗'}</span>
			{option ? 'Verdadero' : 'Falso'}
		</button>
	{/each}
</div>

<style>
	.choices {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
	}
	button {
		display: grid;
		justify-items: center;
		gap: 4px;
		padding: 20px 12px;
		border-radius: var(--radius-lg);
		border: 2px solid var(--border);
		background: var(--surface);
		font-size: 16px;
		font-weight: 700;
		cursor: pointer;
		transition: border-color 0.15s, background 0.15s;
	}
	button:hover:not(:disabled) {
		border-color: var(--accent);
	}
	button:disabled {
		cursor: default;
	}
	.ico {
		font-size: 24px;
	}
	.sel {
		border-color: var(--accent);
		background: var(--accent-soft);
		color: var(--accent);
	}
	.ok {
		border-color: var(--ok);
		background: var(--ok-soft);
		color: var(--ok);
	}
	.bad {
		border-color: var(--bad);
		background: var(--bad-soft);
		color: var(--bad);
	}
</style>
