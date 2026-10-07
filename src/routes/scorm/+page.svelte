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
	import { formatTime, project } from '#lib/project.svelte.ts';
	import { COMPLETION_COVERAGE, createTracker } from '#lib/scorm/tracker.svelte.ts';
	import { loadAsset, loadVideo } from '#lib/storage.ts';
	import { lessonInteractions, LESSON_ICONS, LESSON_LABELS, type GradeResult, type Interaction, type Lesson, type Response } from '#lib/types.ts';

	if (!project.data) void goto(resolve('/'), { replaceState: true });

	const tracker = createTracker();

	let index = $state(0);
	let mediaUrl = $state<string | null>(null);
	let learnerId = $state('alumno-demo');
	let learnerName = $state('Alumno Demo');

	let player = $state<VideoPlayer>();
	let currentTime = $state(0);
	let duration = $state(0);
	let paused = $state(true);

	let active = $state<Interaction | null>(null);
	let finished = $state(false);
	let toast = $state('');
	const restored = new Set<string>();

	const course = $derived(project.data);
	const courseThreshold = $derived(project.data?.threshold ?? 0.6);
	const lessons = $derived(course?.lessons ?? []);
	const lesson = $derived<Lesson | undefined>(lessons[index]);
	const ints = $derived(lesson ? validInts(lesson) : []);

	function validInts(l: Lesson): Interaction[] {
		return lessonInteractions(l)
			.filter((i) => validate(i).length === 0)
			.sort((a, b) => a.time - b.time);
	}

	function lessonPassed(l: Lesson): boolean {
		return tracker.lessonPassed(l, courseThreshold);
	}
	function unlocked(i: number): boolean {
		if (!(course?.sequential ?? true) || i === 0) return true;
		return lessonPassed(lessons[i - 1]);
	}
	const passedCount = $derived(lessons.filter((l) => lessonPassed(l)).length);

	const done = (i: Interaction) =>
		i.required ? !!tracker.progress[lesson?.id ?? '']?.results[i.id]?.correct : !!tracker.progress[lesson?.id ?? '']?.results[i.id] || !!tracker.progress[lesson?.id ?? '']?.skipped[i.id];
	const blocker = $derived(ints.find((i) => !done(i) && i.required) ?? null);

	const markerStates = $derived.by(() => {
		const p = lesson ? tracker.progress[lesson.id] : undefined;
		return Object.fromEntries(
			Object.entries(p?.results ?? {}).map(([id, r]) => [
				id,
				r.correct ? 'correct' : r.score > 0 ? 'partial' : 'wrong'
			])
		) as Record<string, 'correct' | 'wrong' | 'partial'>;
	});

	const lessonWatched = $derived(lesson ? tracker.watchedFor(lesson.id) : 0);
	const currentCoverage = $derived(lesson?.kind === 'video' && lesson.duration > 0 ? Math.min(1, lessonWatched / lesson.duration) : 0);

	const statusKind = $derived(
		tracker.lessonStatus === 'passed' ? 'ok' : tracker.lessonStatus === 'failed' ? 'bad' : tracker.lessonStatus === 'incomplete' ? 'warn' : ''
	);

	// Inicia la sesión SCORM cuando el curso está cargado.
	$effect(() => {
		if (!project.data || tracker.ready) return;
		tracker.start(project.data.id, learnerId, learnerName, project.data);
	});

	// Carga el media del elemento actual.
	$effect(() => {
		const l = lesson;
		let url: string | null = null;
		let cancelled = false;
		mediaUrl = null;
		(async () => {
			if (l?.kind === 'video') {
				const b = await loadVideo(l.videoKey).catch(() => undefined);
				if (!cancelled && b) mediaUrl = url = URL.createObjectURL(b);
			} else if (l?.kind === 'content' && l.imageKey) {
				const b = await loadAsset(l.imageKey).catch(() => undefined);
				if (!cancelled && b) mediaUrl = url = URL.createObjectURL(b);
			} else if (l?.kind === 'resource' && l.fileKey) {
				const b = await loadAsset(l.fileKey).catch(() => undefined);
				if (!cancelled && b) mediaUrl = url = URL.createObjectURL(b);
			}
		})();
		return () => {
			cancelled = true;
			if (url) URL.revokeObjectURL(url);
		};
	});

	// Al entrar en un elemento: registrar en el tracker y reiniciar la vista.
	$effect(() => {
		const l = lesson;
		if (!l || !tracker.ready) return;
		tracker.enterLesson(l);
		active = null;
		finished = false;
		currentTime = 0;
	});

	// Reanudar el video en el marcador guardado.
	$effect(() => {
		const l = lesson;
		if (l?.kind !== 'video' || !mediaUrl || !player || restored.has(l.id)) return;
		restored.add(l.id);
		const loc = tracker.progress[l.id]?.location ?? 0;
		if (loc > 0) {
			player.seek(loc, { force: true });
			flash('Reanudado en ' + formatTime(loc));
		}
	});

	// Abre la primera pregunta pendiente del cuestionario.
	$effect(() => {
		if (lesson?.kind !== 'quiz' || active) return;
		const p = tracker.progress[lesson.id];
		const pending = ints.find((i) => !p?.results[i.id]);
		if (pending) active = pending;
		else if (ints.length) finished = true;
	});

	$effect(() => () => tracker.detach());

	function go(i: number) {
		if (i < 0 || i >= lessons.length || !unlocked(i)) return;
		index = i;
	}

	function next() {
		if (!lesson) return;
		if (index < lessons.length - 1 && lessonPassed(lesson)) go(index + 1);
		else if (index >= lessons.length - 1) flash('¡Curso finalizado!');
		else flash('Aprueba este elemento para continuar');
	}

	function open(i: Interaction) {
		player?.pause();
		if (lesson?.kind === 'video') {
			player?.seek(i.time, { force: true });
			tracker.setLocation(i.time);
		}
		active = i;
	}

	function onframe(prev: number, now: number) {
		tracker.tick(prev, now);
		if (active || finished || lesson?.kind !== 'video') return;
		const hit = ints.find((i) => !done(i) && i.time > prev - 0.05 && i.time <= now);
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
		const pending = ints.find((i) => !done(i));
		if (pending) open(pending);
		else {
			finished = true;
			if (lesson?.kind === 'video' && ints.length === 0 && lesson) tracker.markViewed(lesson.id);
			if (course) tracker.evaluate(course);
		}
	}

	function onanswer(response: Response, result: GradeResult) {
		if (!active || !lesson) return;
		tracker.recordAnswer(active, response, result);
		if (lesson.kind === 'quiz') {
			const p = tracker.progress[lesson.id];
			const pending = ints.find((i) => !p?.results[i.id]);
			active = pending ?? null;
			if (!pending) finished = true;
		}
		if (course) tracker.evaluate(course);
	}

	function resume() {
		active = null;
		if (lesson?.kind === 'video') player?.play();
	}

	function rewind(time: number) {
		active = null;
		player?.seek(time, { force: true });
		player?.play();
	}

	function skip() {
		if (!active || !lesson) return;
		tracker.markSkipped(lesson.id, active.id);
		if (course) tracker.evaluate(course);
		resume();
	}

	function markViewed() {
		if (!lesson) return;
		tracker.markViewed(lesson.id);
		if (course) tracker.evaluate(course);
		flash('Elemento completado');
	}

	function restartLesson() {
		if (!lesson) return;
		active = null;
		finished = false;
		player?.seek(0, { force: true });
		if (lesson.kind === 'quiz') active = ints[0] ?? null;
		else if (lesson.kind === 'video') player?.play();
	}

	function finishCourse() {
		if (!course) return;
		tracker.evaluate(course);
		tracker.finish('normal');
		finished = true;
		flash('Curso finalizado y enviado al LMS');
	}

	function suspend() {
		tracker.suspend();
		flash('Progreso guardado (cmi.core.exit = suspend)');
	}

	function resetCourse() {
		if (!course) return;
		restored.clear();
		active = null;
		finished = false;
		tracker.reset(course.id, learnerId, learnerName, course);
		index = 0;
		player?.seek(0, { force: true });
	}

	function switchLearner() {
		if (!course) return;
		restored.clear();
		active = null;
		finished = false;
		tracker.reset(course.id, learnerId, learnerName, course);
		index = 0;
	}

	let toastTimer: ReturnType<typeof setTimeout>;
	function flash(msg: string) {
		toast = msg;
		clearTimeout(toastTimer);
		toastTimer = setTimeout(() => (toast = ''), 2400);
	}
</script>

{#if project.data}
	<div class="topbar">
		<a class="btn ghost small" href={resolve('/editor')}>← Editor</a>
		<BrandPicker />
		<ModeToggle />
		<span class="title">{project.data.title}</span>
		<span class="badge">SCORM 1.2</span>
		<span class="spacer"></span>
		<span class="entry" title="cmi.core.entry">{tracker.entry === 'resume' ? '↻ Reanudada' : '✦ Nueva sesión'}</span>
		<a class="btn small" href={resolve('/scorm/stats')}>📊 Informe</a>
	</div>

	<main>
		<nav class="lessons card">
			<h2>Contenido</h2>
			<ol>
				{#each lessons as l, i (l.id)}
					<li class:on={i === index}>
						<button class="item" disabled={!unlocked(i)} onclick={() => go(i)}>
							<span class="num">{unlocked(i) ? i + 1 : '🔒'}</span>
							<span class="ico">{LESSON_ICONS[l.kind]}</span>
							<span class="q">
								{l.title}
								<small class="muted">{LESSON_LABELS[l.kind]} · {lessonPassed(l) ? '✓ aprobado' : 'pendiente'}</small>
							</span>
						</button>
					</li>
				{/each}
			</ol>
			<div class="coursebar">
				<div class="bar"><span style:width="{lessons.length ? Math.round((passedCount / lessons.length) * 100) : 0}%"></span></div>
				<span class="muted">{passedCount}/{lessons.length} aprobados</span>
			</div>
		</nav>

		<section class="stage">
			{#if lesson}
				<div class="stagehead">
					<span class="badge {statusKind}">{tracker.lessonStatus}</span>
					<span class="badge">{LESSON_LABELS[lesson.kind]}</span>
					<h1>{lesson.title}</h1>
					<span class="spacer"></span>
					<button class="btn small" onclick={restartLesson}>↻ Reiniciar</button>
					<button class="btn primary small" disabled={!lessonPassed(lesson)} onclick={next}>
						{index >= lessons.length - 1 ? 'Finalizar' : 'Siguiente →'}
					</button>
				</div>

				{#if lesson.kind === 'video'}
					<div class="player-wrap">
						{#if mediaUrl}
							<VideoPlayer
								bind:this={player}
								src={mediaUrl}
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
										interactions={ints}
										states={markerStates}
										limit={blocker?.time ?? null}
										onseek={(t) => {
											if (!active) {
												finished = false;
												player?.seek(t);
											}
										}}
										onselect={(id) => {
											const i = ints.find((x) => x.id === id);
											if (i && !active) player?.seek(i.time);
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
												index={ints.indexOf(active)}
												total={ints.length}
												{onanswer}
												oncontinue={resume}
												onrewind={rewind}
												onskip={skip}
												onretry={() => {
													if (lesson) tracker.retryClear(lesson.id, active!.id);
													if (course) tracker.evaluate(course);
												}}
											/>
										{/key}
									{:else if finished}
										<ResultsSummary
											interactions={ints}
											results={tracker.progress[lesson.id]?.results ?? {}}
											onrestart={restartLesson}
											onreview={(i) => {
												finished = false;
												player?.seek(Math.max(0, i.time - 5), { force: true });
											}}
										>
											{#snippet actions()}
												<button class="btn primary" disabled={!lessonPassed(lesson)} onclick={next}>Siguiente →</button>
											{/snippet}
										</ResultsSummary>
									{/if}
								{/snippet}
							</VideoPlayer>
						{:else}
							<p class="muted center-note">Cargando video…</p>
						{/if}
					</div>
				{:else if lesson.kind === 'quiz'}
					<div class="quiz">
						{#if active}
							{#key active.id}
								<InteractionOverlay
									interaction={active}
									index={ints.indexOf(active)}
									total={ints.length}
									{onanswer}
									oncontinue={resume}
									onrewind={() => (active = null)}
									onretry={() => {
										if (lesson) tracker.retryClear(lesson.id, active!.id);
										if (course) tracker.evaluate(course);
									}}
								/>
							{/key}
						{:else if finished}
							<ResultsSummary interactions={ints} results={tracker.progress[lesson.id]?.results ?? {}} onrestart={restartLesson} onreview={(i) => (active = i)}>
								{#snippet actions()}
									<button class="btn primary" disabled={!lessonPassed(lesson)} onclick={next}>Siguiente →</button>
								{/snippet}
							</ResultsSummary>
						{:else if ints.length === 0}
							<p class="muted center-note">Cuestionario sin preguntas.</p>
						{/if}
					</div>
				{:else if lesson.kind === 'content'}
					<article class="content card">
						{#if mediaUrl}<img src={mediaUrl} alt={lesson.imageName ?? ''} />{/if}
						{#if lesson.body}<p class="body">{lesson.body}</p>{:else}<p class="muted">Página sin contenido.</p>{/if}
						<button class="btn primary" onclick={markViewed} disabled={!!tracker.progress[lesson.id]?.viewDone}>
							{tracker.progress[lesson.id]?.viewDone ? '✓ Visto' : 'Marcar como visto'}
						</button>
					</article>
				{:else if lesson.kind === 'resource'}
					<article class="content card">
						<p class="body">{lesson.description || 'Recurso adjunto.'}</p>
						<div class="res-actions">
							{#if lesson.url}<a class="btn" href={lesson.url} target="_blank" rel="noopener">🔗 Abrir enlace</a>{/if}
							{#if mediaUrl}<a class="btn" href={mediaUrl} download={lesson.fileName}>⬇ Descargar</a>{/if}
							<button class="btn primary" onclick={markViewed} disabled={!!tracker.progress[lesson.id]?.viewDone}>
								{tracker.progress[lesson.id]?.viewDone ? '✓ Visto' : 'Marcar como visto'}
							</button>
						</div>
					</article>
				{/if}
			{:else}
				<p class="muted center-note">El curso no tiene elementos.</p>
			{/if}
			{#if toast}<div class="toast" role="status">{toast}</div>{/if}
		</section>

		<aside class="panel card">
			<div class="head"><h2>Sesión SCORM</h2><span class="badge {statusKind}">{tracker.lessonStatus}</span></div>
			<div class="stats">
				<div class="stat"><span class="k">Puntaje</span><span class="v">{tracker.scoreRaw}/{tracker.scoreMax}</span><span class="muted">{tracker.scoreMax > 0 ? Math.round((tracker.scoreRaw / tracker.scoreMax) * 100) : 0}% · umbral {Math.round(courseThreshold * 100)}%</span></div>
				<div class="stat"><span class="k">Visto (elemento)</span><span class="v">{formatTime(lessonWatched)}</span><span class="muted">{lesson?.kind === 'video' ? `de ${formatTime(lesson.duration)} · ${Math.round(currentCoverage * 100)}%` : 'no aplica'}</span></div>
				<div class="stat"><span class="k">Tiempo sesión</span><span class="v">{tracker.sessionTimeLabel}</span><span class="muted">acumulado {formatTime(tracker.totalTime + tracker.sessionTime)}</span></div>
				<div class="stat"><span class="k">Aprobados</span><span class="v">{passedCount}/{lessons.length}</span><span class="muted">cobertura mín. {Math.round(COMPLETION_COVERAGE * 100)}%</span></div>
			</div>

			<div class="options">
				<span class="label">Opciones</span>
				<div class="actions">
					<button class="btn small" onclick={suspend}>💾 Suspender</button>
					<button class="btn small primary" onclick={finishCourse}>✓ Finalizar</button>
					<button class="btn small ghost danger" onclick={resetCourse}>🔄 Reiniciar</button>
				</div>
				{#if blocker}<p class="hint muted">Bloqueado en {formatTime(blocker.time)}: acierta la pregunta obligatoria para seguir.</p>{/if}
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
					<summary>Inspector CMI</summary>
					<pre>lesson_status   = {tracker.cmi.lessonStatus}
score.raw       = {tracker.cmi.scoreRaw}
score.max       = {tracker.cmi.scoreMax}
lesson_location = {tracker.cmi.lessonLocation}
session_time    = {tracker.cmi.sessionTime}
total_time      = {tracker.cmi.totalTime}
exit            = {tracker.cmi.exit || '(vacío)'}
interactions    = {tracker.cmi.interactions.length}</pre>
				</details>
			{/if}
		</aside>
	</main>
{/if}

<style>
	.title {
		font-weight: 700;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 30vw;
	}
	.entry {
		font-size: 12px;
		font-weight: 600;
		color: var(--muted);
	}
	main {
		display: grid;
		grid-template-columns: 260px minmax(0, 1fr) 330px;
		gap: 16px;
		align-items: start;
		max-width: 1440px;
		margin: 0 auto;
		padding: 18px;
	}
	@media (max-width: 1150px) {
		main {
			grid-template-columns: 1fr;
			padding: 16px;
		}
	}
	.lessons {
		padding: 14px;
		position: sticky;
		top: 72px;
	}
	@media (max-width: 1150px) {
		.lessons {
			position: static;
		}
	}
	.lessons h2 {
		font-size: 15px;
		margin-bottom: 10px;
	}
	.lessons ol {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 4px;
	}
	.lessons li.on {
		outline: 2px solid var(--accent);
		border-radius: var(--radius);
	}
	.item {
		width: 100%;
		display: flex;
		gap: 8px;
		align-items: center;
		text-align: left;
		padding: 8px;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
		cursor: pointer;
	}
	.item:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.item .num {
		width: 22px;
		height: 22px;
		border-radius: 50%;
		background: var(--surface-2);
		display: grid;
		place-items: center;
		font-size: 11px;
		font-weight: 700;
		flex: none;
	}
	.item .q {
		display: grid;
		min-width: 0;
		font-size: 13px;
		font-weight: 600;
	}
	.item .q small {
		font-weight: 400;
		font-size: 11px;
	}
	.coursebar {
		margin-top: 12px;
		display: grid;
		gap: 6px;
		font-size: 12px;
	}
	.coursebar .bar {
		height: 8px;
		border-radius: 999px;
		background: var(--surface-2);
		overflow: hidden;
	}
	.coursebar .bar span {
		display: block;
		height: 100%;
		background: var(--accent);
		transition: width 0.3s;
	}
	.stage {
		display: grid;
		gap: 14px;
		position: relative;
	}
	.stagehead {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
	}
	.stagehead h1 {
		font-size: 18px;
	}
	.spacer {
		flex: 1;
	}
	.center-note {
		text-align: center;
		padding: 40px;
	}
	.quiz {
		background: var(--surface-2);
		border-radius: var(--radius-lg);
		padding: 24px;
		display: grid;
		place-items: center;
		min-height: 340px;
	}
	.content {
		padding: 24px;
		display: grid;
		gap: 16px;
		justify-items: start;
	}
	.content img {
		max-width: 100%;
		border-radius: var(--radius);
	}
	.content .body {
		margin: 0;
		white-space: pre-wrap;
		line-height: 1.6;
	}
	.res-actions {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	.panel {
		padding: 16px;
		display: grid;
		gap: 16px;
		position: sticky;
		top: 72px;
	}
	@media (max-width: 1150px) {
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
		font-size: 16px;
	}
	.stats {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
	}
	.stat {
		display: grid;
		gap: 1px;
		padding: 9px;
		border-radius: var(--radius);
		background: var(--surface-2);
	}
	.stat .k {
		font-size: 11px;
		font-weight: 600;
		color: var(--muted);
	}
	.stat .v {
		font-size: 16px;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	.stat .muted {
		font-size: 11px;
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
		min-width: 100px;
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
	.toast {
		position: absolute;
		top: 0;
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
