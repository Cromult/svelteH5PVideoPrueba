<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { formatTime, project } from '#lib/project.svelte.ts';
	import { COMPLETION_COVERAGE } from '#lib/scorm/tracker.svelte.ts';
	import {
		clearSession,
		formatScormTime,
		listSessions,
		type ScormSessionData
	} from '#lib/scorm/api.ts';
	import type { GradeResult } from '#lib/types.ts';

	if (!project.data) void goto(resolve('/'), { replaceState: true });

	let sessions = $state<ScormSessionData[]>([]);
	let selected = $state('');
	let tick = $state(0);

	function reload() {
		sessions = project.data ? listSessions(project.data.id) : [];
		if (!selected && sessions.length) selected = sessions[0].learnerId;
		tick++;
	}
	reload();

	const courseId = $derived(project.data?.id ?? '');
	const duration = $derived(project.data?.duration ?? 0);
	const interactions = $derived(project.sorted ?? []);
	const current = $derived(sessions.find((s) => s.learnerId === selected) ?? sessions[0] ?? null);

	const payload = $derived.by(() => {
		void tick;
		if (!current?.suspendData) return null;
		try {
			return JSON.parse(current.suspendData) as {
				results?: Record<string, GradeResult>;
				watched?: number[];
				attempts?: Record<string, number>;
				playSeconds?: number;
				threshold?: number;
			};
		} catch {
			return null;
		}
	});

	const watchedSeconds = $derived(payload?.watched?.length ?? 0);
	const coverage = $derived(duration > 0 ? Math.min(1, watchedSeconds / duration) : 0);
	const scorePercent = $derived(current && current.scoreMax > 0 ? current.scoreRaw / current.scoreMax : 0);

	const statusKind = $derived(
		current?.lessonStatus === 'passed'
			? 'ok'
			: current?.lessonStatus === 'failed'
				? 'bad'
				: current?.lessonStatus === 'incomplete'
					? 'warn'
					: ''
	);

	const tips = $derived.by(() => {
		const t: string[] = [];
		if (!current) return ['Aún no hay sesiones SCORM para este curso.'];
		if (coverage < COMPLETION_COVERAGE)
			t.push(`Viste el ${Math.round(coverage * 100)}% del video: te falta ${Math.round((1 - coverage) * 100)}% para completar.`);
		const failed = interactions.filter((i) => payload?.results?.[i.id] && !payload.results[i.id].correct);
		if (failed.length) t.push(`${failed.length} pregunta(s) fallada(s) para repasar (${failed.map((i) => formatTime(i.time)).join(', ')}).`);
		const threshold = payload?.threshold ?? 0.7;
		if (scorePercent < threshold)
			t.push(`Debes alcanzar el ${Math.round(threshold * 100)}% de puntaje para aprobar (llevas ${Math.round(scorePercent * 100)}%).`);
		if (current.lessonStatus === 'passed') t.push('¡Lección aprobada! Puedes pasar al siguiente video.');
		if (!t.length) t.push('Sin observaciones.');
		return t;
	});

	function resetCurrent() {
		if (!current || !courseId) return;
		clearSession(courseId, current.learnerId);
		if (selected === current.learnerId) selected = '';
		reload();
	}
</script>

<main>
	<header class="topbar">
		<a class="btn ghost small" href={resolve('/scorm')}>← Reproductor</a>
		<div>
			<h1>Informe SCORM</h1>
			<p class="muted">Estadísticas de progreso y opciones según el desempeño</p>
		</div>
		<span class="spacer"></span>
		<button class="btn small" onclick={reload}>↻ Actualizar</button>
	</header>

	{#if sessions.length > 1}
		<div class="picker">
			<label class="label" for="learner">Alumno</label>
			<select id="learner" class="input" bind:value={selected}>
				{#each sessions as s (s.learnerId)}
					<option value={s.learnerId}>{s.learnerName} · {s.learnerId}</option>
				{/each}
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
			<div class="card metric">
				<span class="k">Estado</span>
				<span class="badge {statusKind}">{current.lessonStatus}</span>
				<small class="muted">cmi.core.lesson_status</small>
			</div>
			<div class="card metric">
				<span class="k">Puntaje</span>
				<span class="v">{current.scoreRaw}/{current.scoreMax}</span>
				<small class="muted">{Math.round(scorePercent * 100)}% · {current.interactions.length} interacciones</small>
			</div>
			<div class="card metric">
				<span class="k">Tiempo visto</span>
				<span class="v">{formatTime(watchedSeconds)}</span>
				<small class="muted">de {formatTime(duration)} ({Math.round(coverage * 100)}%)</small>
			</div>
			<div class="card metric">
				<span class="k">Tiempo acumulado</span>
				<span class="v">{formatScormTime(current.totalTime + current.sessionTime)}</span>
				<small class="muted">sesión: {formatScormTime(current.sessionTime)}</small>
			</div>
		</div>

		<section class="card">
			<h2>Detalle por pregunta</h2>
			<table>
				<thead>
					<tr>
						<th>#</th>
						<th>Momento</th>
						<th>Pregunta</th>
						<th>Intentos</th>
						<th>Resultado</th>
					</tr>
				</thead>
				<tbody>
					{#each interactions as i, idx (i.id)}
						{@const r = payload?.results?.[i.id]}
						<tr>
							<td>{idx + 1}</td>
							<td class="t">{formatTime(i.time)}</td>
							<td>{i.question || 'Sin enunciado'}</td>
							<td>{payload?.attempts?.[i.id] ?? 0}</td>
							<td>
								{#if r}
									<span class="badge {r.correct ? 'ok' : 'bad'}">{r.correct ? '✓ correcta' : '✗ incorrecta'}</span>
								{:else}
									<span class="badge">pendiente</span>
								{/if}
							</td>
						</tr>
					{/each}
					{#if interactions.length === 0}
						<tr><td colspan="5" class="muted">Sin preguntas evaluables.</td></tr>
					{/if}
				</tbody>
			</table>
		</section>

		<section class="card">
			<h2>Opciones según tus estadísticas</h2>
			<ul class="tips">
				{#each tips as tip, i (i)}
					<li>{tip}</li>
				{/each}
			</ul>
			<div class="actions">
				<a class="btn primary" href={resolve('/scorm')}>▶ {current.lessonStatus === 'not attempted' ? 'Comenzar' : 'Reanudar'}</a>
				<button class="btn" onclick={resetCurrent}>🔄 Reiniciar esta sesión</button>
			</div>
			<details class="cmi">
				<summary>Datos CMI guardados</summary>
				<pre>{JSON.stringify(current, null, 2)}</pre>
			</details>
		</section>
	{/if}
</main>

<style>
	main {
		max-width: 980px;
		margin: 0 auto;
		padding: 20px;
		display: grid;
		gap: 16px;
	}
	.topbar {
		position: static;
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 0;
		background: transparent;
		border: 0;
	}
	.topbar h1 {
		font-size: 22px;
	}
	.topbar p {
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
	td.t {
		font-variant-numeric: tabular-nums;
		font-weight: 700;
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
