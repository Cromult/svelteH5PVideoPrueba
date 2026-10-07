<script lang="ts">
	import type { ShortAnswer } from '#lib/types.ts';

	let { interaction }: { interaction: ShortAnswer } = $props();
</script>

<div class="field">
	<span class="label">Respuestas aceptadas <span class="hint">· cualquiera de ellas es correcta</span></span>
	<ul>
		{#each interaction.accepted as _, idx (idx)}
			<li>
				<input class="input" bind:value={interaction.accepted[idx]} placeholder="Ej.: fotosíntesis" />
				<button
					class="btn ghost small"
					disabled={interaction.accepted.length <= 1}
					onclick={() => interaction.accepted.splice(idx, 1)}
					aria-label="Quitar respuesta">✕</button
				>
			</li>
		{/each}
	</ul>
	<button class="btn small" onclick={() => interaction.accepted.push('')}>+ Otra respuesta válida</button>
	<label class="check">
		<input type="checkbox" bind:checked={interaction.caseSensitive} />
		Distinguir mayúsculas y minúsculas
	</label>
	<p class="hint">Los espacios extra siempre se ignoran.</p>
</div>

<style>
	.field {
		display: grid;
		gap: 6px;
	}
	.hint {
		font-weight: 400;
		color: var(--muted);
		font-size: 13px;
		margin: 0;
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
	}
	.btn.small {
		justify-self: start;
	}
	.check {
		display: flex;
		gap: 8px;
		align-items: center;
		font-size: 14px;
		margin-top: 4px;
	}
</style>
