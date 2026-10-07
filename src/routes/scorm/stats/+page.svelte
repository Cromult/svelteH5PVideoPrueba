<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { formatTime, project } from '#lib/project.svelte.ts';
	import { COMPLETION_COVERAGE } from '#lib/scorm/tracker.svelte.ts';
	import { clearSession, formatScormTime, listSessions, type ScormSessionData } from '#lib/scorm/api.ts';
	import { lessonInteractions, LESSON_ICONS, LESSON_LABELS, type GradeResult, type Lesson } from '#lib/types.ts';

	if (!project.data) void goto(resolve('/'), { replaceState: true });

	interface LessonProgress {
		results: Record<string, GradeResult>;
		skipped: Record<string, true>;
		attempts: Record<string, number>;
		viewDone: boolean;
		watched: number[];
		playSeconds: number;
		location: number;
	}

	let sessions = $state<ScormSessionData[]>([]);
	let selected = $state('');
	let tick = $state(0);

	function reload() {
		sessions = project.data ? listSessions(project.data.id) : [];
		if (!selected && sessions.length) selected = sessions[0].learnerId;
		tick++;
	}
	reload();

	const course = $derived(project.data);
	const lessons = $derived(course?.lessons ?? []);
	const courseThreshold = $derived(course?.threshold ?? 0.6);
	const current = $derived(sessions.find((s) => s.learnerId === selected) ?? sessions[0] ?? null);

	const progress = $derived.by(() => {
		void tick;
		if (!current?.suspendData) return {} as Record<string, LessonProgress>;
		try {
			const p = JSON.parse(current.suspendData) as { progress?: Record<string, LessonProgress> };
			return p.progress ?? {};
		} catch {
			return {} as Record<string, LessonProgress>;
		}
	});

	interface Info {
		done: boolean;
		score: number;
		max: number;
		percent: number;
		watched: number;
		attempts: number;
	}
	function info(l: Lesson): Info {
		const p = progress[l.id];
		if (l.kind === 'content' || l.kind === 'resource') {
			return { done: !!p?.viewDone, score: 0, max: 0, percent: p?.viewDone ? 1 : 0, watched: 0, attempts: 0 };
		}
		const ints = lessonInteractions(l);
		const max = ints.reduce((s, i) => s + i.points, 0);
		const score = Math.round(ints.reduce((s, i) => s + (p?.results?.[i.id]?.score ?? 0), 0) * 100) / 100;
		const percent = max ? score / max : 1;
		const threshold = l.kind === 'quiz' ? l.threshold : courseThreshold;
		return {
			done: !ints.length ? !!p?.viewDone || l.kind === 'quiz' : percent >= threshold,
			score,
			max,
			percent,
			watched: p?.watched?.length ?? 0,
			attempts: ints.reduce((s, i) => s + (p?.attempts?.[i.id] ?? 0), 0)
		};
	}

	const passedCount = $derived(lessons.filter((l) => info(l).done).length);
	const totalScore = $derived(lessons.reduce((s, l) => s + info(l).score, 0));
	const totalMax = $derived(lessons.reduce((s, l) => s + info(l).max, 0));
	const scorePercent = $derived(totalMax ? totalScore / totalMax : 0);

	const statusKind = $derived(
		current?.lessonStatus === 'passed' ? 'ok' : current?.lessonStatus === 'failed' ? 'bad' : current?.lessonStatus === 'incomplete' ? 'warn' : ''
	);

	const tips = $derived.by(() => {
		const t: string[] = [];
		if (!current) return ['Aún no hay sesiones SCORM para este curso.'];
		const pending = lessons.filter((l) => !info(l).done);
		if (pending.length) t.push(`Te faltan ${pending.length} elemento(s): ${pending.map((l) => l.title).join(', ')}.`);
		if (scorePercent < courseThreshold) t.push(`Debes alcanzar el ${Math.round(courseThreshold * 100)}% de puntaje para aprobar (llevas ${Math.round(scorePercent * 100)}%).`);
		if (passedCount === lessons.length && lessons.length) t.push('¡Curso aprobado! Puedes pasar al siguiente módulo.');
		if (!t.length) t.push('Sin observaciones.');
		return t;
	});

	function resetCurrent() {
		if (!current || !project.data) return;
		clearSession(project.data.id, current.learnerId);
		if (selected === current.learnerId) selected = '';
		reload();
	}
</script>

<main>
	<header class="bar">
		<a class="btn ghost small" href={resolve('/scorm')}>← Reproductor</a>
		<div>
			<h1>Informe SCORM</h1>
			<p class="muted">Estadísticas de progreso del curso y opciones según el desempeño</p>
		</div>
		<span class="spacer"></span>
		<button class="btn small" onclick={reload}>↻ Actualizar</button>
	</header>

	{#if sessions.length > 1}
		<div class="picker">
			<label class="label" for="learner">Alumno</label>
			<select id="learner" class="input" bind:value={selected}>
				{#each sessions as s (s.learnerId)}<option value={s.learnerId}>{s.learnerName} · {s.learnerId}</option>{/each}
			</select>
		</div>
	{/if}

	{#if !current}
		<div class="card empty">
			<p>No hay ninguna sesión guardada para <b>{project.data?.title}</b>.</p>
			<a class="btn primary" href={resolve('/scorm')}>▶ Abrir el reproductor SCORM</a>
		</div>
	{:else}
		<div class="cards">
			<div class="card metric"><span class="k">Estado</span><span class="badge {statusKind}">{current.lessonStatus}</span><small class="muted">cmi.core.lesson_status</small></div>
			<div class="card metric"><span class="k">Puntaje</span><span class="v">{totalScore}/{totalMax}</span><small class="muted">{Math.round(scorePercent * 100)}% · {current.interactions.length} interacciones</small></div>
			<div class="card metric"><span class="k">Aprobados</span><span class="v">{passedCount}/{lessons.length}</span><small class="muted">elementos del curso</small></div>
			<div class="card metric"><span class="k">Tiempo</span><span class="v">{formatScormTime(current.totalTime + current.sessionTime)}</span><small class="muted">sesión: {formatScormTime(current.sessionTime)}</small></div>
		</div>

		<section class="card">
			<h2>Detalle por elemento</h2>
			<table>
				<thead>
					<tr><th>#</th><th>Elemento</th><th>Tipo</th><th>Progreso</th><th>Puntaje</th><th>Estado</th></tr>
				</thead>
				<tbody>
					{#each lessons as l, idx (l.id)}
						{@const d = info(l)}
						<tr>
							<td>{idx + 1}</td>
							<td>{l.title}</td>
							<td>{LESSON_ICONS[l.kind]} {LESSON_LABELS[l.kind]}</td>
							<td>
								{#if l.kind === 'video'}
									{formatTime(d.watched)}{l.duration ? ` / ${formatTime(l.duration)} (${Math.round(Math.min(1, d.watched / l.duration) * 100)}%)` : ''}
								{:else if l.kind === 'quiz'}
									{d.attempts} intento(s)
								{:else}
									{d.done ? 'visto' : 'pendiente'}
								{/if}
							</td>
							<td>{d.max ? `${d.score}/${d.max} (${Math.round(d.percent * 100)}%)` : '—'}</td>
							<td><span class="badge {d.done ? 'ok' : ''}">{d.done ? '✓ aprobado' : 'pendiente'}</span></td>
						</tr>
					{/each}
					{#if lessons.length === 0}
						<tr><td colspan="6" class="muted">El curso no tiene elementos.</td></tr>
					{/if}
				</tbody>
			</table>
			<p class="muted tiny">Cobertura de video exigida: {Math.round(COMPLETION_COVERAGE * 100)}%.</p>
		</section>

		<section class="card">
			<h2>Opciones según tus estadísticas</h2>
			<ul class="tips">{#each tips as tip, i (i)}<li>{tip}</li>{/each}</ul>
			<div class="actions">
				<a class="btn primary" href={resolve('/scorm')}>▶ {current.lessonStatus === 'not attempted' ? 'Comenzar' : 'Reanudar'}</a>
				<button class="btn" onclick={resetCurrent}>🔄 Reiniciar esta sesión</button>
			</div>
			<details class="cmi"><summary>Datos CMI guardados</summary><pre>{JSON.stringify(current, null, 2)}</pre></details>
		</section>
	{/if}
</main>

<style>
	main {
		max-width: 1080px;
		margin: 0 auto;
		padding: 20px;
		display: grid;
		gap: 16px;
	}
	.bar {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.bar h1 {
		font-size: 22px;
	}
	.bar p {
		margin: 2px 0 0;
		font-size: 13px;
	}
	.spacer {
		flex: 1;
	}
	.picker {
		max-width: 360px;
	}
	.cards {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 12px;
	}
	@media (max-width: 780px) {
		.cards {
			grid-template-columns: repeat(2, 1fr);
		}
	}
	.metric {
		padding: 14px;
		display: grid;
		gap: 4px;
		align-content: start;
	}
	.metric .k {
		font-size: 12px;
		font-weight: 600;
		color: var(--muted);
	}
	.metric .v {
		font-size: 22px;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	.metric small {
		font-size: 11px;
	}
	section.card {
		padding: 18px;
	}
	section h2 {
		font-size: 17px;
		margin-bottom: 12px;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 14px;
	}
	th,
	td {
		text-align: left;
		padding: 8px 6px;
		border-bottom: 1px solid var(--border);
	}
	th {
		font-size: 12px;
		color: var(--muted);
	}
	.tiny {
		font-size: 12px;
		margin: 10px 0 0;
	}
	.tips {
		margin: 0 0 14px;
		padding-left: 18px;
		display: grid;
		gap: 4px;
		font-size: 14px;
	}
	.actions {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	details.cmi {
		margin-top: 14px;
	}
	details.cmi summary {
		cursor: pointer;
		font-size: 13px;
		font-weight: 600;
		color: var(--muted);
	}
	details.cmi pre {
		margin: 8px 0 0;
		padding: 12px;
		border-radius: var(--radius);
		background: var(--surface-2);
		font-size: 12px;
		max-height: 320px;
		overflow: auto;
	}
	.empty {
		padding: 28px;
		display: grid;
		gap: 14px;
		justify-items: start;
	}
	.empty p {
		margin: 0;
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
