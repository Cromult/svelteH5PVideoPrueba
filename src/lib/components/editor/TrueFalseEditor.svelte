<script lang="ts">
	import type { TrueFalse } from '#lib/types.ts';

	let { interaction }: { interaction: TrueFalse } = $props();
</script>

<div class="field">
	<span class="label">Respuesta correcta</span>
	<div class="choices">
		<button class:on={interaction.answer === true} onclick={() => (interaction.answer = true)}>✓ Verdadero</button>
		<button class:on={interaction.answer === false} onclick={() => (interaction.answer = false)}>✗ Falso</button>
	</div>
</div>

<style>
	.field {
		display: grid;
		gap: 6px;
	}
	.choices {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
	}
	button {
		padding: 12px;
		border-radius: var(--radius);
		border: 2px solid var(--border);
		background: var(--surface);
		font-weight: 600;
		cursor: pointer;
	}
	button.on {
		border-color: var(--ok);
		background: var(--ok-soft);
		color: var(--ok);
	}
</style>
