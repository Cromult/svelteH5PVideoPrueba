<script lang="ts">
	import { MODES, modeOf } from '#lib/brands.ts';
	import { project } from '#lib/project.svelte.ts';

	const active = $derived(modeOf(project.data?.mode));
</script>

<div class="mode-toggle" role="group" aria-label="Modo de color">
	{#each MODES as m (m.id)}
		<button
			type="button"
			class="mode"
			class:on={active === m.id}
			title={m.label}
			aria-pressed={active === m.id}
			onclick={() => project.setMode(m.id)}
		>
			<span aria-hidden="true">{m.icon}</span>
		</button>
	{/each}
</div>

<style>
	.mode-toggle {
		display: inline-flex;
		border: 1px solid var(--border);
		border-radius: 8px;
		overflow: hidden;
		background: var(--surface);
		flex: none;
	}
	.mode {
		display: grid;
		place-items: center;
		width: 30px;
		height: 30px;
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--muted);
		cursor: pointer;
		font-size: 13px;
		line-height: 1;
	}
	.mode + .mode {
		border-left: 1px solid var(--border);
	}
	.mode:hover {
		background: var(--surface-2);
		color: var(--text);
	}
	.mode.on {
		background: var(--accent);
		color: var(--accent-contrast, #fff);
	}
</style>
