<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import InteractionOverlay from '#lib/components/player/InteractionOverlay.svelte';
	import ResultsSummary from '#lib/components/player/ResultsSummary.svelte';
	import Timeline from '#lib/components/Timeline.svelte';
	import VideoPlayer from '#lib/components/VideoPlayer.svelte';
	import { validate } from '#lib/grading.ts';
	import { formatTime, project } from '#lib/project.svelte.ts';
	import { COMPLETION_COVERAGE, createTracker } from '#lib/scorm/tracker.svelte.ts';
	import type { GradeResult, Interaction, Response } from '#lib/types.ts';

	if (!project.data) void goto(resolve('/'), { replaceState: true });

	const tracker = createTracker();

	let player = $state<VideoPlayer>();
	let currentTime = $state(0);
	let duration = $state(0);
	let paused = $state(true);

	let learnerId = $state('alumno-demo');
	let learnerName = $state('Alumno Demo');

	let active = $state<Interaction | null>(null);
	let finished = $state(false);
	let restored = $state(false);
	let toast = $state('');

	const interactions = $derived(project.sorted.filter((i) => validate(i).length === 0));
	const invalidCount = $derived(project.sorted.length - interactions.length);
	const maxScore = $derived(interactions.reduce((s, i) => s + i.points, 0));

	/** Una pregunta está "superada" para poder avanzar: obligatoria → acertada; opcional → respondida o saltada. */
	const done = (i: Interaction) =>
		i.required ? !!tracker.results[i.id]?.correct : !!tracker.results[i.id] || !!tracker.skipped[i.id];

	const blocker = $derived(interactions.find((i) => !done(i) && i.required) ?? null);
	const answeredCount = $derived(interactions.filter((i) => tracker.results[i.id]).length);

	const markerStates = $derived(
		Object.fromEntries(
			Object.entries(tracker.results).map(([id, r]) => [id, r.correct ? 'correct' : r.score > 0 ? 'partial' : 'wrong'])
		) as Record<string, 'correct' | 'wrong' | 'partial'>
	);

	const statusKind = $derived(
		tracker.lessonStatus === 'passed'
			? 'ok'
			: tracker.lessonStatus === 'failed'
				? 'bad'
				: tracker.lessonStatus === 'incomplete'
					? 'warn'
					: ''
	);

	// Inicia la sesión SCORM cuando el proyecto y la duración están listos.
	$effect(() => {
		if (!project.data || tracker.ready || duration <= 0) return;
		tracker.start(project.data.id, learnerId, learnerName, maxScore, duration);
	});

	// Reanuda en el marcador guardado (cmi.core.lesson_location).
	$effect(() => {
		if (!tracker.ready || restored || !player || tracker.location <= 0) return;
		restored = true;
		if (tracker.entry === 'resume' && tracker.location < duration - 2) {
			player.seek(tracker.location, { force: true });
			flash('Sesión reanudada donde la dejaste');
		}
	});

	$effect(() => () => tracker.detach());

	function open(i: Interaction) {
		player?.pause();
		player?.seek(i.time, { force: true });
		active = i;
		tracker.setLocation(i.time);
	}

	/** En cada frame el video se detiene al cruzar una pregunta pendiente. */
	function onframe(prev: number, now: number) {
		tracker.tick(prev, now);
		if (active || finished) return;
		const hit = interactions.find((i) => !done(i) && i.time > prev - 0.05 && i.time <= now);
		if (hit) open(hit);
	}

	function clampSeek(target: number) {
		if (blocker && target > blocker.time) {
			flash('Debes acertar la pregunta para avanzar');
			return blocker.time;
		}
		return target;
	}

	function onended() {
		const pending = interactions.find((i) => !done(i) && i.time >= currentTime - 0.6);
		if (pending) open(pending);
		else {
			finished = true;
			tracker.evaluate(interactions);
		}
	}

	function seekFromBar(t: number) {
		if (active) return;
		finished = false;
		player?.seek(t);
	}

	function onanswer(response: Response, result: GradeResult) {
		if (!active) return;
		tracker.recordAnswer(active, response, result);
		tracker.evaluate(interactions);
	}

	function resume() {
		active = null;
		player?.play();
	}

	function rewind(time: number) {
		active = null;
		player?.seek(time, { force: true });
		player?.play();
	}

	function skip() {
		if (!active) return;
		tracker.markSkipped(active.id);
		tracker.evaluate(interactions);
		resume();
	}

	function finishLesson() {
		tracker.evaluate(interactions);
		tracker.finish('normal');
		finished = true;
		flash('Curso finalizado y enviado al LMS');
	}

	function suspend() {
		tracker.suspend();
		flash('Progreso guardado (cmi.core.exit = suspend)');
	}

	function resetCourse() {
		active = null;
		finished = false;
		restored = false;
		tracker.reset(project.data!.id, learnerId, learnerName, maxScore, duration);
		player?.seek(0, { force: true });
	}

	function switchLearner() {
		active = null;
		finished = false;
		restored = false;
		tracker.reset(project.data!.id, learnerId, learnerName, maxScore, duration);
		player?.seek(0, { force: true });
	}

	/** Lleva el video a la primera pregunta no superada. */
	function reviewPending() {
		const pending = interactions.find((i) => !done(i));
		if (!pending) {
			flash('No hay preguntas pendientes');
			return;
		}
		finished = false;
		player?.seek(Math.max(0, pending.time - 5), { force: true });
	}

	let toastTimer: ReturnType<typeof setTimeout>;
	function flash(msg: string) {
		toast = msg;
		clearTimeout(toastTimer);
		toastTimer = setTimeout(() => (toast = ''), 2400);
	}
</script>

{#if project.data && project.videoUrl}
	<div class="topbar">
		<a class="btn ghost small" href={resolve('/editor')}>← Editor</a>
		<span class="title">{project.data.title}</span>
		<span class="badge">SCORM 1.2</span>
		<span class="spacer"></span>
		<span class="entry" title="cmi.core.entry">
			{tracker.entry === 'resume' ? '↻ Reanudada' : '✦ Nueva sesión'}
		</span>
		<a class="btn small" href={resolve('/scorm/stats')}>📊 Informe</a>
	</div>

	<main>
		{#if invalidCount > 0}
			<p class="warning">
				⚠ {invalidCount} pregunta(s) incompleta(s) no se evalúan. Complétalas en el editor para que cuenten.
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
								interaction={active.required
									? { ...active, onFailSeekTo: active.onFailSeekTo ?? Math.max(0, active.time - 5) }
									: active}
								index={interactions.indexOf(active)}
								total={interactions.length}
								{onanswer}
								oncontinue={resume}
								onrewind={rewind}
								onskip={skip}
								onretry={() => active && tracker.retryClear(active.id)}
							/>
						{/key}
					{:else if finished}
						<ResultsSummary
							{interactions}
							results={tracker.results}
							onrestart={resetCourse}
							onreview={(i) => {
								finished = false;
								player?.seek(Math.max(0, i.time - 5), { force: true });
							}}
						>
							{#snippet actions()}
								<button class="btn" onclick={suspend}>💾 Guardar progreso</button>
								{#if tracker.lessonStatus !== 'passed'}
									<button class="btn primary" onclick={resetCourse}>🔄 Reiniciar curso</button>
								{:else}
									<a class="btn primary" href={resolve('/scorm/stats')}>📊 Ver informe</a>
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

		{#if tracker.ready}
		<aside class="panel card">
			<div class="head">
				<h2>Sesión SCORM</h2>
				<span class="badge {statusKind}">{tracker.lessonStatus}</span>
			</div>

			<div class="stats">
				<div class="stat">
					<span class="k">Puntaje</span>
					<span class="v">{tracker.scoreRaw}/{tracker.scoreMax}</span>
					<span class="muted">{Math.round(tracker.scorePercent * 100)}% · umbral {Math.round(tracker.threshold * 100)}%</span>
				</div>
				<div class="stat">
					<span class="k">Visto ahora</span>
					<span class="v">{formatTime(tracker.playSeconds)}</span>
					<span class="muted">de {formatTime(duration)}</span>
				</div>
				<div class="stat">
					<span class="k">Cobertura</span>
					<span class="v">{Math.round(tracker.coverage * 100)}%</span>
					<span class="muted">mín. {Math.round(COMPLETION_COVERAGE * 100)}% para completar</span>
				</div>
				<div class="stat">
					<span class="k">Tiempo total</span>
					<span class="v">{tracker.sessionTimeLabel}</span>
					<span class="muted">acumulado {formatTime(tracker.totalTime + tracker.sessionTime)}</span>
				</div>
			</div>

			<div class="progress" aria-label="Progreso de la lección">
				<div class="bar"><span style:width="{Math.round(tracker.coverage * 100)}%"></span></div>
			</div>

			<div class="questions">
				<span class="label">Preguntas ({answeredCount}/{interactions.length})</span>
				<ul>
					{#each interactions as i (i.id)}
						{@const r = tracker.results[i.id]}
						<li class:ok={r?.correct} class:bad={r && !r.correct}>
							<span class="t">{formatTime(i.time)}</span>
							<span class="s">{r ? (r.correct ? '✓ acertada' : '✗ fallada') : tracker.skipped[i.id] ? 'saltada' : i.required ? 'obligatoria pendiente' : 'pendiente'}</span>
						</li>
					{/each}
					{#if interactions.length === 0}
						<li class="muted">Sin preguntas evaluables.</li>
					{/if}
				</ul>
			</div>

			<div class="options">
				<span class="label">Opciones según tu progreso</span>
				<div class="actions">
					<button class="btn small" onclick={reviewPending}>↺ Repasar pendientes</button>
					<button class="btn small" onclick={suspend}>💾 Suspender</button>
					<button class="btn small primary" onclick={finishLesson}>✓ Finalizar</button>
					<button class="btn small ghost danger" onclick={resetCourse}>🔄 Reiniciar</button>
				</div>
				{#if tracker.coverage < COMPLETION_COVERAGE}
					<p class="hint muted">
						Te falta ver el {Math.round((1 - tracker.coverage) * 100)}% del video para completar la lección.
					</p>
				{/if}
				{#if blocker}
					<p class="hint muted">
						Bloqueado en {formatTime(blocker.time)}: acerta la pregunta obligatoria para seguir avanzando.
					</p>
				{/if}
			</div>

			<div class="learner">
				<span class="label">Alumno</span>
				<div class="row">
					<input class="input" bind:value={learnerId} aria-label="ID del alumno" placeholder="id-alumno" />
					<input class="input" bind:value={learnerName} aria-label="Nombre del alumno" placeholder="Nombre" />
					<button class="btn small" onclick={switchLearner}>Cambiar</button>
				</div>
			</div>

			{#if tracker.cmi}
				<details class="cmi">
					<summary>Inspector CMI (cmi.core.*)</summary>
					<pre>lesson_status = {tracker.cmi.lessonStatus}
score.raw    = {tracker.cmi.scoreRaw}
score.max    = {tracker.cmi.scoreMax}
lesson_location = {tracker.cmi.lessonLocation}
session_time = {tracker.cmi.sessionTime}
total_time   = {tracker.cmi.totalTime}
exit         = {tracker.cmi.exit || '(vacío)'}
interactions = {tracker.cmi.interactions.length}</pre>
				</details>
			{/if}
		</aside>
		{/if}
	</main>
{/if}

<style>
	.entry {
		font-size: 12px;
		font-weight: 600;
		color: var(--muted);
	}
	main {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 340px;
		gap: 18px;
		align-items: start;
		max-width: 1240px;
		margin: 0 auto;
		padding: 20px;
	}
	@media (max-width: 980px) {
		main {
			grid-template-columns: 1fr;
			padding: 16px;
		}
	}
	.player-wrap {
		position: relative;
		display: grid;
		gap: 12px;
	}
	.warning {
		grid-column: 1 / -1;
		margin: 0;
		padding: 10px 14px;
		border-radius: var(--radius);
		background: var(--warn-soft);
		color: var(--warn);
		font-size: 14px;
	}
	.toast {
		position: absolute;
		top: 12px;
		left: 50%;
		transform: translateX(-50%);
		background: #111827ee;
		color: #fff;
		padding: 8px 16px;
		border-radius: 999px;
		font-size: 14px;
		font-weight: 500;
		z-index: 5;
	}
	.panel {
		padding: 18px;
		display: grid;
		gap: 16px;
		position: sticky;
		top: 72px;
	}
	@media (max-width: 980px) {
		.panel {
			position: static;
		}
	}
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}
	.head h2 {
		font-size: 17px;
	}
	.stats {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
	}
	.stat {
		display: grid;
		gap: 1px;
		padding: 10px;
		border-radius: var(--radius);
		background: var(--surface-2);
	}
	.stat .k {
		font-size: 12px;
		font-weight: 600;
		color: var(--muted);
	}
	.stat .v {
		font-size: 18px;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	.stat .muted {
		font-size: 11px;
	}
	.progress .bar {
		height: 8px;
		border-radius: 999px;
		background: var(--surface-2);
		overflow: hidden;
	}
	.progress .bar span {
		display: block;
		height: 100%;
		background: var(--accent);
		transition: width 0.3s;
	}
	.questions ul {
		list-style: none;
		margin: 6px 0 0;
		padding: 0;
		display: grid;
		gap: 4px;
		font-size: 13px;
	}
	.questions li {
		display: flex;
		gap: 8px;
		align-items: baseline;
		padding: 4px 0;
	}
	.questions li .t {
		font-variant-numeric: tabular-nums;
		font-weight: 700;
		color: var(--muted);
		min-width: 36px;
	}
	.questions li.ok .s {
		color: var(--ok);
	}
	.questions li.bad .s {
		color: var(--bad);
	}
	.options .actions {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-top: 6px;
	}
	.hint {
		margin: 8px 0 0;
		font-size: 12px;
	}
	.learner .row {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
	}
	.learner .input {
		flex: 1;
		min-width: 110px;
		padding: 6px 8px;
		font-size: 13px;
	}
	.cmi summary {
		cursor: pointer;
		font-size: 13px;
		font-weight: 600;
		color: var(--muted);
	}
	.cmi pre {
		margin: 8px 0 0;
		padding: 10px;
		border-radius: var(--radius);
		background: var(--surface-2);
		font-size: 12px;
		overflow: auto;
	}
	.badge.ok {
		background: var(--ok-soft);
		color: var(--ok);
	}
	.badge.bad {
		background: var(--bad-soft);
		color: var(--bad);
	}
	.badge.warn {
		background: var(--warn-soft);
		color: var(--warn);
	}
</style>
