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
	import { loadAsset, loadVideo } from '#lib/storage.ts';
	import { lessonInteractions, LESSON_ICONS, LESSON_LABELS, type GradeResult, type Interaction, type Lesson, type Response } from '#lib/types.ts';

	if (!project.data) void goto(resolve('/'), { replaceState: true });

	let index = $state(0);
	let mediaUrl = $state<string | null>(null);

	let player = $state<VideoPlayer>();
	let currentTime = $state(0);
	let duration = $state(0);
	let paused = $state(true);

	let results = $state<Record<string, GradeResult>>({});
	let skipped = $state<Record<string, true>>({});
	let viewDone = $state<Record<string, true>>({});
	let active = $state<Interaction | null>(null);
	let finished = $state(false);
	let toast = $state('');

	const lessons = $derived(project.data?.lessons ?? []);
	const lesson = $derived<Lesson | undefined>(lessons[index]);
	const sequential = $derived(project.data?.sequential ?? true);
	const courseThreshold = $derived(project.data?.threshold ?? 0.6);

	const ints = $derived(lesson ? validInts(lesson) : []);
	const passedCount = $derived(lessons.filter((l) => lessonPassed(l)).length);

	function validInts(l: Lesson): Interaction[] {
		return lessonInteractions(l)
			.filter((i) => validate(i).length === 0)
			.sort((a, b) => a.time - b.time);
	}

	function lessonScore(l: Lesson): { score: number; max: number; percent: number } {
		const list = validInts(l);
		const max = list.reduce((s, i) => s + i.points, 0);
		const score = Math.round(list.reduce((s, i) => s + (results[i.id]?.score ?? 0), 0) * 100) / 100;
		return { score, max, percent: max ? score / max : 1 };
	}

	function thresholdFor(l: Lesson): number {
		return l.kind === 'quiz' ? l.threshold : courseThreshold;
	}

	function lessonPassed(l: Lesson): boolean {
		if (l.kind === 'content' || l.kind === 'resource') return !!viewDone[l.id];
		const list = validInts(l);
		if (list.length === 0) return l.kind === 'quiz' ? true : !!viewDone[l.id];
		return lessonScore(l).percent >= thresholdFor(l);
	}

	function unlocked(i: number): boolean {
		if (!sequential || i === 0) return true;
		return lessonPassed(lessons[i - 1]);
	}

	function go(i: number) {
		if (i < 0 || i >= lessons.length || !unlocked(i)) return;
		index = i;
		active = null;
		finished = false;
		currentTime = 0;
		flash(`Elemento ${i + 1}: ${lessons[i].title}`);
	}

	function next() {
		if (lessonPassed(lessons[index]) && index < lessons.length - 1) go(index + 1);
		else if (index >= lessons.length - 1) flash('¡Curso completado!');
		else flash('Aprueba este elemento para continuar');
	}

	// Carga el video o activo de la lección actual.
	$effect(() => {
		const l = lesson;
		let url: string | null = null;
		let cancelled = false;
		mediaUrl = null;
		(async () => {
			if (l?.kind === 'video') {
				const b = await loadVideo(l.videoKey).catch(() => undefined);
				if (!cancelled && b) {
					url = URL.createObjectURL(b);
					mediaUrl = url;
				}
			} else if (l?.kind === 'content' && l.imageKey) {
				const b = await loadAsset(l.imageKey).catch(() => undefined);
				if (!cancelled && b) {
					url = URL.createObjectURL(b);
					mediaUrl = url;
				}
			} else if (l?.kind === 'resource' && l.fileKey) {
				const b = await loadAsset(l.fileKey).catch(() => undefined);
				if (!cancelled && b) {
					url = URL.createObjectURL(b);
					mediaUrl = url;
				}
			}
		})();
		return () => {
			cancelled = true;
			if (url) URL.revokeObjectURL(url);
		};
	});

	// Abre automáticamente la primera pregunta pendiente del cuestionario.
	$effect(() => {
		if (lesson?.kind !== 'quiz' || active) return;
		const pending = ints.find((i) => !results[i.id]);
		if (pending) active = pending;
		else if (ints.length) finished = true;
	});

	const done = (i: Interaction) =>
		i.required ? !!results[i.id]?.correct : !!results[i.id] || !!skipped[i.id];
	const blocker = $derived(ints.find((i) => !done(i) && i.required) ?? null);

	const markerStates = $derived(
		Object.fromEntries(
			Object.entries(results).map(([id, r]) => [id, r.correct ? 'correct' : r.score > 0 ? 'partial' : 'wrong'])
		) as Record<string, 'correct' | 'wrong' | 'partial'>
	);

	function open(i: Interaction) {
		player?.pause();
		if (lesson?.kind === 'video') player?.seek(i.time, { force: true });
		active = i;
	}

	function onframe(prev: number, now: number) {
		if (active || finished || lesson?.kind !== 'video') return;
		const hit = ints.find((i) => !done(i) && i.time > prev - 0.05 && i.time <= now);
		if (hit) open(hit);
	}

	function clampSeek(target: number) {
		if (blocker && target > blocker.time) {
			flash('Responde correctamente para avanzar');
			return blocker.time;
		}
		return target;
	}

	function onended() {
		const pending = ints.find((i) => !done(i));
		if (pending) open(pending);
		else {
			finished = true;
			if (lesson?.kind === 'video' && ints.length === 0 && lesson) viewDone[lesson.id] = true;
		}
	}

	function onanswer(response: Response, result: GradeResult) {
		if (!active) return;
		results[active.id] = result;
		if (lesson?.kind === 'quiz') {
			const pending = ints.find((i) => !results[i.id]);
			active = pending ?? null;
			if (!pending) finished = true;
		}
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
		if (!active) return;
		skipped[active.id] = true;
		resume();
	}

	function restartLesson() {
		const l = lesson;
		if (!l) return;
		for (const i of validInts(l)) {
			delete results[i.id];
			delete skipped[i.id];
		}
		delete viewDone[l.id];
		active = null;
		finished = false;
		player?.seek(0, { force: true });
		if (l.kind === 'quiz') {
			const first = ints[0] ?? null;
			active = first;
		} else if (l.kind === 'video') {
			player?.play();
		}
	}

	function markViewed() {
		if (!lesson) return;
		viewDone[lesson.id] = true;
		flash('Elemento completado');
	}

	let toastTimer: ReturnType<typeof setTimeout>;
	function flash(msg: string) {
		toast = msg;
		clearTimeout(toastTimer);
		toastTimer = setTimeout(() => (toast = ''), 2200);
	}
</script>

{#if project.data}
	<div class="topbar">
		<a class="btn ghost small" href={resolve('/editor')}>← Editor</a>
		<BrandPicker />
		<ModeToggle />
		<span class="title">{project.data.title}</span>
		<span class="spacer"></span>
		<a class="btn small" href={resolve('/scorm')}>🎓 Simular SCORM</a>
		<span class="score">{passedCount}/{lessons.length} completados</span>
	</div>

	<main>
		<nav class="lessons card">
			<h2>Contenido del curso</h2>
			<ol>
				{#each lessons as l, i (l.id)}
					<li class:on={i === index}>
						<button class="item" disabled={!unlocked(i)} onclick={() => go(i)}>
							<span class="num">{unlocked(i) ? i + 1 : '🔒'}</span>
							<span class="ico">{LESSON_ICONS[l.kind]}</span>
							<span class="q">
								{l.title}
								<small class="muted">{LESSON_LABELS[l.kind]} · {lessonPassed(l) ? '✓ completado' : 'pendiente'}</small>
							</span>
						</button>
					</li>
				{/each}
			</ol>
		</nav>

		<section class="stage">
			{#if lesson}
				<div class="stagehead">
					<span class="badge">{LESSON_LABELS[lesson.kind]}</span>
					<h1>{lesson.title}</h1>
					<span class="spacer"></span>
					<button class="btn small" onclick={restartLesson}>↻ Reiniciar elemento</button>
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
												onretry={() => active && delete results[active.id]}
											/>
										{/key}
									{:else if finished}
										<ResultsSummary
											interactions={ints}
											{results}
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
									onretry={() => active && delete results[active.id]}
								/>
							{/key}
						{:else if finished}
							<ResultsSummary
								interactions={ints}
								{results}
								onrestart={restartLesson}
								onreview={(i) => (active = i)}
							>
								{#snippet actions()}
									<button class="btn primary" disabled={!lessonPassed(lesson)} onclick={next}>Siguiente →</button>
								{/snippet}
							</ResultsSummary>
						{:else if ints.length === 0}
							<p class="muted center-note">Este cuestionario aún no tiene preguntas.</p>
						{/if}
					</div>
				{:else if lesson.kind === 'content'}
					<article class="content card">
						{#if mediaUrl}<img src={mediaUrl} alt={lesson.imageName ?? ''} />{/if}
						{#if lesson.body}<p class="body">{lesson.body}</p>{:else}<p class="muted">Página sin contenido.</p>{/if}
						<button class="btn primary" onclick={markViewed} disabled={!!viewDone[lesson.id]}>
							{viewDone[lesson.id] ? '✓ Visto' : 'Marcar como visto'}
						</button>
					</article>
				{:else if lesson.kind === 'resource'}
					<article class="content card">
						<p class="body">{lesson.description || 'Recurso adjunto.'}</p>
						<div class="res-actions">
							{#if lesson.url}<a class="btn" href={lesson.url} target="_blank" rel="noopener">🔗 Abrir enlace</a>{/if}
							{#if mediaUrl}<a class="btn" href={mediaUrl} download={lesson.fileName}>⬇ Descargar {lesson.fileName}</a>{/if}
							<button class="btn primary" onclick={markViewed} disabled={!!viewDone[lesson.id]}>
								{viewDone[lesson.id] ? '✓ Visto' : 'Marcar como visto'}
							</button>
						</div>
					</article>
				{/if}
			{:else}
				<p class="muted center-note">El curso no tiene elementos.</p>
			{/if}
			{#if toast}<div class="toast" role="status">{toast}</div>{/if}
		</section>
	</main>
{/if}

<style>
	.title {
		font-weight: 700;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 40vw;
	}
	.score {
		font-size: 13px;
		color: var(--muted);
		font-variant-numeric: tabular-nums;
	}
	main {
		display: grid;
		grid-template-columns: 280px minmax(0, 1fr);
		gap: 18px;
		align-items: start;
		max-width: 1200px;
		margin: 0 auto;
		padding: 20px;
	}
	@media (max-width: 900px) {
		main {
			grid-template-columns: 1fr;
			padding: 16px;
		}
	}
	.lessons {
		padding: 16px;
		position: sticky;
		top: 72px;
	}
	@media (max-width: 900px) {
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
	.item .ico {
		font-size: 15px;
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
		font-size: 19px;
	}
	.spacer {
		flex: 1;
	}
	.player-wrap .center-note {
		padding: 40px;
		text-align: center;
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
	.center-note {
		text-align: center;
		padding: 40px;
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
</style>
