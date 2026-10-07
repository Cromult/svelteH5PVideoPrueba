<script lang="ts">
	import { goto } from '$app/navigation';
	import { asset, resolve } from '$app/paths';
	import { formatTime, project } from '#lib/project.svelte.ts';
	import { lessonInteractions, LESSON_ICONS, type Lesson } from '#lib/types.ts';

	let title = $state('');
	let files = $state<File[]>([]);
	let dragOver = $state(false);
	let busy = $state(false);
	let error = $state('');

	const totalDuration = $derived(
		(project.data?.lessons ?? []).reduce((s, l) => s + (l.kind === 'video' ? l.duration : 0), 0)
	);
	const totalQuestions = $derived((project.data?.lessons ?? []).reduce((s, l) => s + lessonInteractions(l).length, 0));

	function pick(list: FileList | File[] | null | undefined) {
		error = '';
		if (!list) return;
		const chosen = Array.from(list).filter((f) => f.type.startsWith('video/'));
		if (!chosen.length) {
			error = 'Los archivos deben ser videos (MP4 recomendado).';
			return;
		}
		files = chosen;
		if (!title) title = chosen[0].name.replace(/\.[^.]+$/, '');
	}

	async function useSample() {
		busy = true;
		error = '';
		try {
			const res = await fetch(asset('video-ejemplo.mp4'));
			const blob = await res.blob();
			files = [new File([blob], 'video-ejemplo.mp4', { type: 'video/mp4' })];
			if (!title) title = 'Video de ejemplo';
		} catch (e) {
			error = 'No se pudo cargar el video de ejemplo: ' + (e as Error).message;
		} finally {
			busy = false;
		}
	}

	async function create() {
		if (!files.length) return;
		busy = true;
		try {
			await project.createCourseFromFiles(files, title.trim());
			await goto(resolve('/editor'));
		} catch (e) {
			error = 'No se pudo guardar en el navegador: ' + (e as Error).message;
		} finally {
			busy = false;
		}
	}

	function lessonSummary(l: Lesson): string {
		switch (l.kind) {
			case 'video':
				return `${formatTime(l.duration)} · ${l.interactions.length} pregunta(s)`;
			case 'quiz':
				return `${l.interactions.length} pregunta(s)`;
			case 'content':
				return l.imageKey ? 'Página con imagen' : 'Página de texto';
			case 'resource':
				return l.url || l.fileName || 'Recurso';
		}
	}
</script>

<main>
	<header>
		<span class="logo">▶</span>
		<div>
			<h1>Curso interactivo</h1>
			<p class="muted">Demo aislada del LMS · Curso con varios videos y elementos, editor + vista del estudiante</p>
		</div>
	</header>

	{#if project.data}
		<section class="card current">
			<div class="info">
				<span class="label">Curso guardado en este navegador</span>
				<h2>{project.data.title}</h2>
				<p class="muted">
					{project.data.lessons.length} elemento(s) · {formatTime(totalDuration)} de video · {totalQuestions} pregunta(s) ·
					{#if project.data.status === 'published'}
						<span class="badge ok">Publicado</span>
					{:else}
						<span class="badge warn">Borrador</span>
					{/if}
				</p>
				<ul class="lessons">
					{#each project.data.lessons as l (l.id)}
						<li><span class="ico">{LESSON_ICONS[l.kind]}</span> {l.title} <span class="muted">— {lessonSummary(l)}</span></li>
					{/each}
				</ul>
			</div>
			<div class="actions">
				<a class="btn primary" href={resolve('/editor')}>✎ Abrir editor</a>
				<a class="btn" href={resolve('/preview')}>👁 Ver como estudiante</a>
				<a class="btn" href={resolve('/scorm')}>🎓 Simular SCORM</a>
				<button class="btn ghost danger" onclick={() => project.reset()}>Borrar</button>
			</div>
		</section>
		<h3 class="or muted">o empieza con otros videos</h3>
	{/if}

	<section class="card new">
		<label
			class="drop"
			class:over={dragOver}
			class:has={files.length}
			ondragover={(e) => {
				e.preventDefault();
				dragOver = true;
			}}
			ondragleave={() => (dragOver = false)}
			ondrop={(e) => {
				e.preventDefault();
				dragOver = false;
				pick(e.dataTransfer?.files);
			}}
		>
			<input
				type="file"
				accept="video/mp4,video/webm,video/*"
				multiple
				onchange={(e) => pick(e.currentTarget.files)}
				hidden
			/>
			{#if files.length}
				<span class="big">🎬</span>
				<strong>{files.length} video(s): {files.map((f) => f.name).join(', ')}</strong>
				<span class="muted">Cada archivo será una lección de video · clic para cambiar</span>
			{:else}
				<span class="big">⬆</span>
				<strong>Arrastra uno o varios MP4 aquí, o haz clic para elegirlos</strong>
				<span class="muted">Los archivos se quedan en tu navegador (IndexedDB). No se suben a ningún servidor.</span>
			{/if}
		</label>

		<div class="row">
			<div class="grow">
				<label class="label" for="title">Título del curso</label>
				<input id="title" class="input" bind:value={title} placeholder="Ej.: Curso de Biología – Módulo 1" />
			</div>
			<button class="btn primary" disabled={!files.length || busy} onclick={create}>
				{busy ? 'Guardando…' : 'Crear curso →'}
			</button>
		</div>
		{#if !files.length}
			<button class="btn ghost small sample" onclick={useSample} disabled={busy}>
				¿No tienes videos a mano? Usar el video de ejemplo (60 s)
			</button>
		{/if}
		{#if error}<p class="error">{error}</p>{/if}
		<p class="muted small-note">
			Luego, en el editor, puedes agregar páginas de contenido, cuestionarios sin video y recursos descargables.
		</p>
	</section>

	<ol class="steps muted">
		<li><b>1. Editor:</b> arma el curso con videos y otros elementos; agrega preguntas en el momento exacto.</li>
		<li><b>2. Previsualizar:</b> revisa la secuencia y el desbloqueo entre elementos.</li>
		<li><b>3. Estudiante / SCORM:</b> el curso se pausa en cada pregunta, califica y reporta el progreso.</li>
	</ol>
</main>

<style>
	main {
		max-width: 760px;
		margin: 0 auto;
		padding: 48px 16px;
		display: grid;
		gap: 20px;
	}
	header {
		display: flex;
		align-items: center;
		gap: 14px;
	}
	.logo {
		width: 48px;
		height: 48px;
		border-radius: 14px;
		display: grid;
		place-items: center;
		color: var(--accent-contrast, #fff);
		font-size: 20px;
		background: var(--accent);
		box-shadow: var(--shadow);
	}
	h1 {
		font-size: 26px;
	}
	header p {
		margin: 2px 0 0;
	}
	.current {
		padding: 20px;
		display: flex;
		gap: 16px;
		align-items: center;
		flex-wrap: wrap;
	}
	.current .info {
		flex: 1;
		min-width: 240px;
	}
	.current p {
		margin: 4px 0 0;
	}
	.lessons {
		list-style: none;
		margin: 10px 0 0;
		padding: 0;
		display: grid;
		gap: 2px;
		font-size: 13px;
	}
	.lessons .ico {
		margin-right: 4px;
	}
	.actions {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	.or {
		text-align: center;
		font-size: 13px;
		font-weight: 500;
	}
	.new {
		padding: 20px;
		display: grid;
		gap: 16px;
	}
	.drop {
		display: grid;
		justify-items: center;
		gap: 4px;
		text-align: center;
		padding: 36px 16px;
		border: 2px dashed var(--border);
		border-radius: var(--radius-lg);
		cursor: pointer;
		transition: border-color 0.15s, background 0.15s;
	}
	.drop:hover,
	.drop.over {
		border-color: var(--accent);
		background: var(--accent-soft);
	}
	.drop.has {
		border-style: solid;
		border-color: var(--accent);
	}
	.big {
		font-size: 30px;
	}
	.row {
		display: flex;
		gap: 12px;
		align-items: end;
		flex-wrap: wrap;
	}
	.grow {
		flex: 1;
		min-width: 200px;
	}
	.sample {
		justify-self: start;
		color: var(--accent);
	}
	.small-note {
		font-size: 12px;
		margin: 0;
	}
	.error {
		color: var(--bad);
		margin: 0;
	}
	.steps {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 6px;
		font-size: 14px;
	}
</style>
