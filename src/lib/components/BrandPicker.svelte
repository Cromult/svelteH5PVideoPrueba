<script lang="ts">
	import brandEsam from '#lib/assets/brand-esam.jpeg';
	import brandUpi from '#lib/assets/brand-upi.svg';
	import { BRANDS, brandOf } from '#lib/brands.ts';
	import { project } from '#lib/project.svelte.ts';
	import type { BrandId } from '#lib/types.ts';

	const active = $derived(brandOf(project.data?.brand));

	function change(id: BrandId) {
		project.setBrand(id);
	}
</script>

<div class="brand-picker">
	<span class="mark" title={active}>
		{#if active === 'esam'}
			<img src={brandEsam} alt="ESAM" />
		{:else if active === 'upi'}
			<img src={brandUpi} alt="UPI" />
		{:else}
			<span class="dot">▶</span>
		{/if}
	</span>
	<select
		class="brand-select"
		value={active}
		onchange={(e) => change(e.currentTarget.value as BrandId)}
		aria-label="Paleta de marca"
	>
		{#each BRANDS as b (b.id)}
			<option value={b.id}>{b.label}</option>
		{/each}
	</select>
</div>

<style>
	.brand-picker {
		display: inline-flex;
		align-items: center;
		gap: 8px;
	}
	.mark {
		display: grid;
		place-items: center;
		height: 30px;
		min-width: 30px;
		border-radius: 8px;
		overflow: hidden;
		background: var(--surface-2);
		border: 1px solid var(--border);
		flex: none;
	}
	.mark img {
		display: block;
		height: 100%;
		width: auto;
		max-width: 84px;
		object-fit: contain;
	}
	.mark .dot {
		font-size: 14px;
		color: var(--accent);
	}
	.brand-select {
		height: 30px;
		padding: 0 24px 0 10px;
		border-radius: 8px;
		border: 1px solid var(--border);
		background-color: var(--surface);
		color: var(--text);
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
		appearance: none;
		background-image:
			linear-gradient(45deg, transparent 50%, var(--muted) 50%),
			linear-gradient(135deg, var(--muted) 50%, transparent 50%);
		background-position:
			calc(100% - 14px) center,
			calc(100% - 9px) center;
		background-size:
			5px 5px,
			5px 5px;
		background-repeat: no-repeat;
	}
	.brand-select:focus {
		outline: none;
		border-color: var(--accent);
		box-shadow: 0 0 0 3px var(--accent-soft);
	}
</style>
