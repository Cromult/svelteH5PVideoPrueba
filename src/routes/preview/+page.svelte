<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import BrandPicker from '#lib/components/BrandPicker.svelte';
	import ModeToggle from '#lib/components/ModeToggle.svelte';
	import InteractionOverlay from '#lib/components/player/InteractionOverlay.svelte';
	import ResultsSummary from '#lib/components/player/ResultsSummary.svelte';
	import Timeline from '#lib/components/Timeline.svelte';
	import VideoPlayer from '#lib/components/VideoPlayer.svelte';
	import { validate } from '#lib/grading.ts';
	import { project } from '#lib/project.svelte.ts';
	import type { GradeResult, Interaction, Response } from '#lib/types.ts';

	if (!project.data) void goto(resolve('/'), { replaceState: true });

	let player = $state<VideoPlayer>();
	let currentTime = $state(0);
	let duration = $state(0);
	let paused = $state(true);

	// Intento del estudiante (en el LMS real se enviaría a NestJS por cada respuesta).
	let results = $state<Record<string, GradeResult>>({});
	let responses: Record<string, Response> = {};
	let skipped = $state<Record<string, true>>({});
	let active = $state<Interaction | null>(null);
	let finished = $state(false);
	let toast = $state('');
	let publishOpen = $state(false);

	// Solo se muestran preguntas válidas (las incompletas se avisan arriba).
	const interactions = $derived(project.sorted.filter((i) => validate(i).length === 0));
	const invalidCount = $derived(project.sorted.length - interactions.length);
	const handled = (i: Interaction) => !!results[i.id] || !!skipped[i.id];

	const blocker = $derived(interactions.find((i) => i.required && !handled(i)) ?? null);
	const score = $derived(Math.round(Object.values(results).reduce((s, r) => s + r.score, 0) * 100) / 100);
	const maxScore = $derived(interactions.reduce((s, i) => s + i.points, 0));
	const answeredCount = $derived(interactions.filter((i) => results[i.id]).length);

	const markerStates = $derived(
		Object.fromEntries(
			Object.entries(results).map(([id, r]) => [id, r.correct ? 'correct' : r.score > 0 ? 'partial' : 'wrong'])
		) as Record<string, 'correct' | 'wrong' | 'partial'>
	);

	function open(i: Interaction) {
		player?.pause();
		player?.seek(i.time, { force: true });
		active = i;
	}

	/** En cada frame: si el video cruzó el tiempo de una pregunta pendiente, se detiene ahí. */
	function onframe(prev: number, now: number) {
		if (active || finished) return;
		const hit = interactions.find((i) => !handled(i) && i.time > prev - 0.05 && i.time <= now);
		if (hit) open(hit);
	}

	function clampSeek(target: number) {
		if (blocker && target > blocker.time) {
			flash('Responde la pregunta obligatoria para avanzar');
			return blocker.time;
		}
		return target;
	}

	function seekFromBar(t: number) {
		if (active) return;
		finished = false;
		player?.seek(t);
	}

	function onended() {
		const pending = interactions.find((i) => !handled(i) && i.time >= currentTime - 0.6);
		if (pending) open(pending);
		else finished = true;
	}

	function onanswer(response: Response, result: GradeResult) {
		if (!active) return;
		responses[active.id] = response;
		results[active.id] = result;
	}

	function resume() {
		active = null;
		player?.play();
	}

	function rewind(time: number) {
		if (!active) return;
		// La pregunta vuelve a quedar pendiente: aparecerá de nuevo al llegar a ella.
		delete results[active.id];
		delete responses[active.id];
		active = null;
		player?.seek(time, { force: true });
		player?.play();
	}

	function skip() {
		if (!active) return;
		skipped[active.id] = true;
		resume();
	}

	function restart() {
		results = {};
		responses = {};
		skipped = {};
		active = null;
		finished = false;
		player?.seek(0, { force: true });
		player?.play();
	}

	function review(i: Interaction) {
		finished = false;
		player?.seek(Math.max(0, i.time - 5), { force: true });
	}

	let toastTimer: ReturnType<typeof setTimeout>;
	function flash(msg: string) {
		toast = msg;
		clearTimeout(toastTimer);
		toastTimer = setTimeout(() => (toast = ''), 2200);
	}

	function publish() {
		project.publish();
		publishOpen = true;
	}

	function downloadJson() {
		const data = $state.snapshot(project.data);
		const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
		const a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		a.download = `video-interactivo-${(project.data?.title || 'demo').replace(/[^\w-]+/g, '_')}.json`;
		a.click();
		setTimeout(() => URL.revokeObjectURL(a.href), 1000);
	}
</script>

{#if project.data && project.videoUrl}
	<div class="topbar">
		<a class="btn ghost small" href={resolve('/editor')}>← Volver al editor</a>
		<BrandPicker />
		<ModeToggle />
		<span class="title">{project.data.title}</span>
		<span class="badge">👁 Vista del estudiante</span>
		<span class="spacer"></span>
		<span class="score" title="Puntaje actual">
			<b>{score}</b>/{maxScore} pts · {answeredCount}/{interactions.length} respondidas
		</span>
		{#if project.data.status === 'published'}
			<button class="btn" onclick={() => (publishOpen = true)}>✓ Publicado</button>
		{:else}
			<button class="btn primary" onclick={publish} disabled={invalidCount > 0 || interactions.length === 0}>
				🚀 Publicar
			</button>
		{/if}
	</div>

	<main>
		{#if invalidCount > 0}
			<p class="warning">
				⚠ {invalidCount} pregunta(s) incompleta(s) no se muestran al estudiante. Complétalas en el editor para poder publicar.
			</p>
		{/if}

		<div class="player-wrap">
			<VideoPlayer
				bind:this={player}
				src={project.videoUrl}
				bind:currentTime
				bind:duration
				bind:paused
				{clampSeek}
				{onframe}
				{onended}
				locked={!!active || finished}
				overlayOpen={!!active || finished}
			>
				{#snippet bar()}
					<Timeline
						{duration}
						{currentTime}
						{interactions}
						states={markerStates}
						limit={blocker?.time ?? null}
						onseek={seekFromBar}
						onselect={(id) => {
							const i = interactions.find((x) => x.id === id);
							if (i && !active) seekFromBar(i.time);
						}}
					/>
				{/snippet}
				{#snippet overlay()}
					{#if active}
						{#key active.id}
							<InteractionOverlay
								interaction={active}
								index={interactions.indexOf(active)}
								total={interactions.length}
								{onanswer}
								oncontinue={resume}
								onrewind={rewind}
								onskip={skip}
								onretry={() => active && delete results[active.id]}
							/>
						{/key}
					{:else if finished}
						<ResultsSummary {interactions} {results} onrestart={restart} onreview={review}>
							{#snippet actions()}
								<a class="btn" href={resolve('/editor')}>✎ Editar preguntas</a>
								{#if project.data?.status !== 'published'}
									<button class="btn primary" onclick={publish} disabled={invalidCount > 0}>🚀 Publicar</button>
								{/if}
							{/snippet}
						</ResultsSummary>
					{/if}
				{/snippet}
			</VideoPlayer>

			{#if toast}
				<div class="toast" role="status">{toast}</div>
			{/if}
		</div>

		<p class="muted help">
			Así lo verá el estudiante: el video se detiene en cada pregunta. Las obligatorias no dejan adelantar (zona rayada
			en la barra). Teclas: <kbd>Espacio</kbd> reproducir/pausar · <kbd>←</kbd>/<kbd>→</kbd> 5 s.
		</p>
	</main>

	{#if publishOpen}
		<div class="modal-bg" onclick={(e) => e.target === e.currentTarget && (publishOpen = false)} role="presentation">
			<div class="card modal" role="dialog" aria-modal="true" aria-labelledby="pub-title">
				<span class="big">🚀</span>
				<h2 id="pub-title">Video publicado (simulado)</h2>
				<p class="muted">
					En el LMS real, aquí el front enviaría este JSON a NestJS y el MP4 al almacenamiento de archivos. Los
					estudiantes verían exactamente esta vista.
				</p>
				<pre>{JSON.stringify(
						{
							title: project.data.title,
							status: project.data.status,
							duration: Math.round(project.data.duration),
							interactions: interactions.length,
							maxScore
						},
						null,
						2
					)}</pre>
				<div class="row">
					<button class="btn" onclick={downloadJson}>⬇ Descargar JSON completo</button>
					<button class="btn primary" onclick={() => (publishOpen = false)}>Cerrar</button>
				</div>
			</div>
		</div>
	{/if}
{/if}

<style>
	.score {
		font-size: 14px;
		color: var(--muted);
		font-variant-numeric: tabular-nums;
	}
	.score b {
		color: var(--text);
	}
	main {
		max-width: 1100px;
		margin: 0 auto;
		padding: 20px;
		display: grid;
		gap: 14px;
	}
	@media (max-width: 640px) {
		main {
			padding: 16px;
		}
		.score {
			display: none;
		}
	}
	.warning {
		margin: 0;
		padding: 10px 14px;
		border-radius: var(--radius);
		background: var(--warn-soft);
		color: var(--warn);
		font-size: 14px;
	}
	.player-wrap {
		position: relative;
	}
	.toast {
		position: absolute;
		top: 16px;
		left: 50%;
		transform: translateX(-50%);
		background: #111827ee;
		color: #fff;
		padding: 8px 16px;
		border-radius: 999px;
		font-size: 14px;
		font-weight: 500;
		z-index: 5;
		animation: drop 0.2s ease-out;
	}
	@keyframes drop {
		from {
			opacity: 0;
			transform: translate(-50%, -6px);
		}
	}
	.help {
		font-size: 13px;
		margin: 0;
	}
	.modal-bg {
		position: fixed;
		inset: 0;
		z-index: 50;
		background: rgb(0 0 0 / 0.45);
		display: grid;
		place-items: center;
		padding: 16px;
	}
	.modal {
		width: min(480px, 100%);
		padding: 24px;
		display: grid;
		gap: 10px;
		justify-items: center;
		text-align: center;
	}
	.modal p {
		margin: 0;
		font-size: 14px;
	}
	.big {
		font-size: 36px;
	}
	pre {
		width: 100%;
		text-align: left;
		margin: 6px 0;
		padding: 12px;
		border-radius: var(--radius);
		background: var(--surface-2);
		font-size: 12px;
		overflow: auto;
	}
	.row {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
		justify-content: center;
	}
</style>
