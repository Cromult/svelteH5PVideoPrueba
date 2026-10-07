<script lang="ts">
	import { uid } from '#lib/project.svelte.ts';
	import type { Matching } from '#lib/types.ts';

	let { interaction }: { interaction: Matching } = $props();
</script>

<div class="field">
	<span class="label">Pares <span class="hint">· el estudiante verá la columna derecha desordenada y unirá con un cable</span></span>
	<div class="head">
		<span>Izquierda</span><span></span><span>Derecha (su pareja)</span><span></span>
	</div>
	<ul>
		{#each interaction.pairs as pair, idx (pair.id)}
			<li>
				<input class="input" bind:value={pair.left} placeholder="Ej.: Perú" aria-label="Elemento izquierdo {idx + 1}" />
				<span class="link">⟷</span>
				<input class="input" bind:value={pair.right} placeholder="Ej.: Lima" aria-label="Pareja {idx + 1}" />
				<button
					class="btn ghost small"
					disabled={interaction.pairs.length <= 2}
					onclick={() => (interaction.pairs = interaction.pairs.filter((p) => p.id !== pair.id))}
					aria-label="Quitar par">✕</button
				>
			</li>
		{/each}
	</ul>
	<button class="btn small" onclick={() => interaction.pairs.push({ id: uid(), left: '', right: '' })}>+ Par</button>
</div>

<style>
	.field {
		display: grid;
		gap: 6px;
	}
	.hint {
		font-weight: 400;
	}
	.head,
	li {
		display: grid;
		grid-template-columns: 1fr 22px 1fr 40px;
		gap: 6px;
		align-items: center;
	}
	.head {
		font-size: 12px;
		color: var(--muted);
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 6px;
	}
	.link {
		text-align: center;
		color: var(--accent);
		font-weight: 700;
	}
	.btn.small {
		justify-self: start;
	}
</style>
