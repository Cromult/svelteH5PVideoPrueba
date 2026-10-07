<script lang="ts">
	import '../app.css';
	import favicon from '#lib/assets/favicon.svg';
	import { project } from '#lib/project.svelte.ts';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	void project.load();

	// La paleta y el modo del proyecto se reflejan en toda la app (editor + vista estudiante).
	$effect(() => {
		const brand = project.data?.brand ?? 'default';
		const stored = project.data?.mode ?? 'auto';
		const mq = window.matchMedia('(prefers-color-scheme: dark)');
		const apply = () => {
			const root = document.documentElement;
			root.dataset.brand = brand;
			root.dataset.mode = stored === 'auto' ? (mq.matches ? 'dark' : 'light') : stored;
		};
		apply();
		if (stored !== 'auto') return;
		mq.addEventListener('change', apply);
		return () => mq.removeEventListener('change', apply);
	});
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
