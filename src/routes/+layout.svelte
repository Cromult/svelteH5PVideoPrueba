<script lang="ts">
	import '../app.css';
	import favicon from '#lib/assets/favicon.svg';
	import { project } from '#lib/project.svelte.ts';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	void project.load();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Video interactivo · Demo LMS</title>
</svelte:head>

{#if project.loading}
	<div class="center muted">Cargando…</div>
{:else}
	{@render children()}
{/if}
