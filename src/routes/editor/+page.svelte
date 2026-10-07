<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import BrandPicker from '#lib/components/BrandPicker.svelte';
	import ModeToggle from '#lib/components/ModeToggle.svelte';
	import InteractionForm from '#lib/components/editor/InteractionForm.svelte';
	import Timeline from '#lib/components/Timeline.svelte';
	import VideoPlayer from '#lib/components/VideoPlayer.svelte';
	import { validate } from '#lib/grading.ts';
	import { formatTimePrecise, project } from '#lib/project.svelte.ts';
	import { TYPE_ICONS, TYPE_LABELS, type InteractionType } from '#lib/types.ts';

	if (!project.data) void goto(resolve('/'), { replaceState: true });

	let player = $state<VideoPlayer>();
	let currentTime = $state(0);
	let duration = $state(0);
	let paused = $state(true);
	let selectedId = $state<string | null>(null);
	let saved = $state(true);

	const selected = $derived(project.data?.interactions.find((i) => i.id === selectedId) ?? null);
	const incomplete = $derived(project.sorted.filter((i) => validate(i).length > 0).length);
	const types: InteractionType[] = ['multiple-choice', 'true-false', 'short-answer', 'matching'];

	// Guardar la duración real del video cuando el navegador la conoce.
	$effect(() => {
		if (project.data && duration && Math.abs(project.data.duration - duration) > 0.05) {
			project.data.duration = duration;
		}
	});

	// Autoguardado (con pequeño retardo) ante cualquier cambio del proyecto.
	let firstRun = true;
	$effect(() => {
		JSON.stringify(project.data);
		if (firstRun) {
			firstRun = false;
			return;
		}
		saved = false;
		const t = setTimeout(() => {
			project.persist();
			saved = true;
		}, 400);
		return () => clearTimeout(t);
	});

	function add(type: InteractionType) {
		player?.pause();
		const interaction = project.add(type, currentTime);
		selectedId = interaction.id;
	}

	function select(id: string) {
		const i = project.data?.interactions.find((x) => x.id === id);
		if (!i) return;
		player?.pause();
		player?.seek(i.time);
		selectedId = id;
	}

	function move(id: string, time: number) {
		const i = project.data?.interactions.find((x) => x.id === id);
		if (!i) return;
		i.time = time;
		if (i.onFailSeekTo !== null && i.onFailSeekTo > time) i.onFailSeekTo = time;
		project.markDraft();
		selectedId = id;
	}

	function remove(id: string) {
		project.remove(id);
		if (selectedId === id) selectedId = null;
	}

	function onKey(e: KeyboardEvent) {
		const target = e.target as HTMLElement;
		if (target.closest('input, textarea, select, [contenteditable]') || e.ctrlKey || e.metaKey || e.altKey) return;
		const n = Number(e.key);
		if (n >= 1 && n <= types.length) {
			e.preventDefault();
			add(types[n - 1]);
		} else if (e.key === 'Escape') {
			selectedId = null;
		}
	}
</script>

<svelte:window onkeydown={onKey} />

{#if project.data && project.videoUrl}
	<div class="topbar">
		<a class="btn ghost small" href={resolve('/')}>← Inicio</a>
		<BrandPicker />
		<ModeToggle />
		<input class="title-input" bind:value={project.data.title} aria-label="Título del video" />
		{#if project.data.status === 'published'}
			<span class="badge ok">Publicado</span>
		{:else}
			<span class="badge warn">Borrador</span>
		{/if}
		<span class="muted save">{saved ? 'Guardado' : 'Guardando…'}</span>
		<span class="spacer"></span>
		<a class="btn primary" href={resolve('/preview')}>👁 Previsualizar como estudiante</a>
	</div>

	<main>
		<section class="left">
			<VideoPlayer bind:this={player} src={project.videoUrl} bind:currentTime bind:duration bind:paused>
				{#snippet bar()}
					<Timeline
						{duration}
						{currentTime}
						interactions={project.sorted}
						editable
						{selectedId}
						onseek={(t) => player?.seek(t)}
						onselect={select}
						onmove={move}
					/>
				{/snippet}
			</VideoPlayer>

			<div class="card addbar">
				<div class="addhead">
					<strong>Agregar pregunta en <span class="now">{formatTimePrecise(currentTime)}</span></strong>
					<span class="muted small">Reproduce el video y elige el tipo en el momento exacto (teclas <kbd>1</kbd>–<kbd>4</kbd>)</span>
				</div>
				<div class="types">
					{#each types as type, idx (type)}
						<button class="type" onclick={() => add(type)}>
							<span class="ico">{TYPE_ICONS[type]}</span>
							<span>{TYPE_LABELS[type]}</span>
							<kbd>{idx + 1}</kbd>
						</button>
					{/each}
				</div>
			</div>
		</section>

		<aside class="card panel">
			{#if selected}
				{#key selected.id}
					<InteractionForm
						interaction={selected}
						{currentTime}
						{duration}
						onclose={() => (selectedId = null)}
						ondelete={() => remove(selected.id)}
						onduplicate={() => {
							const copy = project.duplicate(selected.id);
							if (copy) selectedId = copy.id;
						}}
						onjump={(t) => player?.seek(t)}
					/>
				{/key}
			{:else}
				<div class="list-head">
					<h2>Preguntas <span class="muted">({project.sorted.length})</span></h2>
					{#if incomplete}
						<span class="badge warn">{incomplete} incompleta(s)</span>
					{/if}
				</div>
				{#if project.sorted.length === 0}
					<div class="empty muted">
						<p>Aún no hay preguntas.</p>
						<p>Dale ▶ al video y, cuando llegues al momento indicado, pulsa un tipo de pregunta abajo del video.</p>
					</div>
				{:else}
					<ol class="list">
						{#each project.sorted as i (i.id)}
							{@const errs = validate(i)}
							<li>
								<button class="item" onclick={() => select(i.id)}>
									<span class="t">{formatTimePrecise(i.time)}</span>
									<span class="ico">{TYPE_ICONS[i.type]}</span>
									<span class="q">
										{i.question || 'Sin enunciado'}
										<small class="muted">
											{TYPE_LABELS[i.type]} · {i.points} pt{i.points === 1 ? '' : 's'}{i.required ? ' · obligatoria' : ''}
										</small>
									</span>
									{#if errs.length}<span class="warn-dot" title={errs.join('\n')}>!</span>{/if}
								</button>
							</li>
						{/each}
					</ol>
				{/if}
			{/if}
		</aside>
	</main>
{/if}

<style>
	.title-input {
		font-weight: 700;
		font-size: 16px;
		border: 1px solid transparent;
		background: transparent;
		border-radius: 8px;
		padding: 4px 8px;
		min-width: 0;
		flex: 0 1 320px;
	}
	.title-input:hover,
	.title-input:focus {
		border-color: var(--border);
		outline: none;
	}
	.save {
		font-size: 12px;
	}
	main {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 400px;
		gap: 20px;
		padding: 20px;
		max-width: 1440px;
		margin: 0 auto;
		align-items: start;
	}
	@media (max-width: 1000px) {
		main {
			grid-template-columns: 1fr;
			padding: 16px;
		}
	}
	.left {
		display: grid;
		gap: 16px;
	}
	.addbar {
		padding: 14px 16px;
		display: grid;
		gap: 10px;
	}
	.addhead {
		display: flex;
		gap: 4px 12px;
		align-items: baseline;
		flex-wrap: wrap;
	}
	.now {
		color: var(--accent);
		font-variant-numeric: tabular-nums;
	}
	.small {
		font-size: 13px;
	}
	.types {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 8px;
	}
	@media (max-width: 640px) {
		.types {
			grid-template-columns: repeat(2, 1fr);
		}
	}
	.type {
		display: grid;
		justify-items: center;
		gap: 2px;
		padding: 12px 8px;
		border-radius: var(--radius);
		border: 1px solid var(--border);
		background: var(--surface-2);
		font-weight: 600;
		font-size: 13px;
		cursor: pointer;
		position: relative;
		transition: border-color 0.15s, background 0.15s, transform 0.1s;
	}
	.type:hover {
		border-color: var(--accent);
		background: var(--accent-soft);
	}
	.type:active {
		transform: scale(0.98);
	}
	.type .ico {
		font-size: 18px;
		color: var(--accent);
	}
	.type kbd {
		position: absolute;
		top: 6px;
		right: 6px;
	}
	.panel {
		padding: 18px;
		position: sticky;
		top: 72px;
		max-height: calc(100vh - 92px);
		overflow: auto;
	}
	@media (max-width: 1000px) {
		.panel {
			position: static;
			max-height: none;
		}
	}
	.list-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 12px;
	}
	.list-head h2 {
		font-size: 17px;
	}
	.empty {
		text-align: center;
		padding: 24px 8px;
		font-size: 14px;
	}
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 6px;
	}
	.item {
		width: 100%;
		display: flex;
		gap: 10px;
		align-items: center;
		text-align: left;
		padding: 10px;
		border-radius: var(--radius);
		border: 1px solid var(--border);
		background: var(--surface);
		cursor: pointer;
	}
	.item:hover {
		border-color: var(--accent);
	}
	.item .t {
		font-variant-numeric: tabular-nums;
		font-size: 12px;
		font-weight: 700;
		color: var(--accent);
		min-width: 44px;
	}
	.item .ico {
		width: 30px;
		height: 30px;
		border-radius: 8px;
		display: grid;
		place-items: center;
		background: var(--accent-soft);
		color: var(--accent);
		font-size: 12px;
		font-weight: 700;
		flex: none;
	}
	.item .q {
		flex: 1;
		min-width: 0;
		display: grid;
		font-size: 14px;
		font-weight: 500;
	}
	.item .q small {
		font-weight: 400;
		font-size: 12px;
	}
	.warn-dot {
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: var(--warn);
		color: #fff;
		display: grid;
		place-items: center;
		font-size: 12px;
		font-weight: 700;
	}
</style>
