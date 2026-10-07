<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import BrandPicker from '#lib/components/BrandPicker.svelte';
	import ModeToggle from '#lib/components/ModeToggle.svelte';
	import InteractionForm from '#lib/components/editor/InteractionForm.svelte';
	import LessonList from '#lib/components/editor/LessonList.svelte';
	import Timeline from '#lib/components/Timeline.svelte';
	import VideoPlayer from '#lib/components/VideoPlayer.svelte';
	import { lessonReady } from '#lib/course.ts';
	import { validate } from '#lib/grading.ts';
	import { formatTimePrecise, project } from '#lib/project.svelte.ts';
	import { lessonInteractions, LESSON_LABELS, TYPE_ICONS, TYPE_LABELS, type InteractionType, type LessonKind } from '#lib/types.ts';

	if (!project.data) void goto(resolve('/'), { replaceState: true });

	let player = $state<VideoPlayer>();
	let currentTime = $state(0);
	let duration = $state(0);
	let paused = $state(true);
	let selectedId = $state<string | null>(null);
	let saved = $state(true);

	let videoInput = $state<HTMLInputElement>();
	let imageInput = $state<HTMLInputElement>();
	let fileInput = $state<HTMLInputElement>();

	const current = $derived(project.current);
	const isVideo = $derived(current?.kind === 'video');
	const isQuiz = $derived(current?.kind === 'quiz');
	const hasPanel = $derived(isVideo || isQuiz);

	const selected = $derived(
		current && (current.kind === 'video' || current.kind === 'quiz')
			? (current.interactions.find((i) => i.id === selectedId) ?? null)
			: null
	);
	const incomplete = $derived(project.sorted.filter((i) => validate(i).length > 0).length);
	const types: InteractionType[] = ['multiple-choice', 'true-false', 'short-answer', 'matching'];

	// Guardar la duración real del video cuando el navegador la conoce.
	$effect(() => {
		if (duration) project.updateDuration(duration);
	});

	// Al cambiar de elemento, limpiar la selección.
	$effect(() => {
		project.currentId;
		selectedId = null;
	});

	// Autoguardado (con pequeño retardo) ante cualquier cambio del curso.
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
		const interaction = project.add(type, isVideo ? currentTime : 0);
		if (interaction) selectedId = interaction.id;
	}

	function selectInteraction(id: string) {
		const i = project.sorted.find((x) => x.id === id);
		if (!i) return;
		player?.pause();
		player?.seek(i.time);
		selectedId = id;
	}

	function move(id: string, time: number) {
		const i = project.sorted.find((x) => x.id === id);
		if (!i) return;
		i.time = time;
		if (i.onFailSeekTo !== null && i.onFailSeekTo > time) i.onFailSeekTo = time;
		project.markDraft();
		selectedId = id;
	}

	function removeInteraction(id: string) {
		project.remove(id);
		if (selectedId === id) selectedId = null;
	}

	async function selectLesson(id: string) {
		await project.selectLesson(id);
		currentTime = 0;
	}

	function addLesson(kind: LessonKind) {
		if (kind === 'content') project.addContentLesson();
		else if (kind === 'quiz') project.addQuizLesson();
		else if (kind === 'resource') project.addResourceLesson();
	}

	function publish() {
		project.publish();
	}

	function downloadJson() {
		if (!project.data) return;
		const data = $state.snapshot(project.data);
		const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
		const a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		a.download = `curso-${(project.data.title || 'demo').replace(/[^\w-]+/g, '_')}.json`;
		a.click();
		setTimeout(() => URL.revokeObjectURL(a.href), 1000);
	}

	function onKey(e: KeyboardEvent) {
		const target = e.target as HTMLElement;
		if (target.closest('input, textarea, select, [contenteditable]') || e.ctrlKey || e.metaKey || e.altKey) return;
		if (!hasPanel) return;
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

{#if project.data}
	<div class="topbar">
		<a class="btn ghost small" href={resolve('/')}>← Inicio</a>
		<BrandPicker />
		<ModeToggle />
		<input class="title-input" bind:value={project.data.title} aria-label="Título del curso" />
		{#if project.data.status === 'published'}
			<span class="badge ok">Publicado</span>
		{:else}
			<span class="badge warn">Borrador</span>
		{/if}
		<span class="muted save">{saved ? 'Guardado' : 'Guardando…'}</span>
		<span class="spacer"></span>
		<button class="btn small ghost" onclick={downloadJson} title="Exportar el curso como JSON">⬇ JSON</button>
		{#if project.data.status !== 'published'}
			<button class="btn small" onclick={publish}>🚀 Publicar</button>
		{/if}
		<a class="btn small" href={resolve('/scorm')}>🎓 Simular SCORM</a>
		<a class="btn primary" href={resolve('/preview')}>👁 Previsualizar</a>
	</div>

	<div class="coursebar card">
		<label class="switch">
			<input type="checkbox" checked={project.data.sequential} onchange={(e) => project.setSequential(e.currentTarget.checked)} />
			<span><b>Secuencial</b> · aprobar un elemento para desbloquear el siguiente</span>
		</label>
		<span class="spacer"></span>
		<label class="threshold">
			Umbral de dominio
			<input class="input narrow" type="number" min="0" max="100" step="5" value={Math.round(project.data.threshold * 100)} onchange={(e) => project.data && (project.data.threshold = Math.max(0, Math.min(1, e.currentTarget.valueAsNumber / 100)))} />
			<span class="muted">%</span>
		</label>
	</div>

	<input type="file" accept="video/mp4,video/webm,video/*" bind:this={videoInput} hidden onchange={(e) => { const f = e.currentTarget.files?.[0]; if (f) void project.addVideoLesson(f); e.currentTarget.value = ''; }} />
	<input type="file" accept="image/*" bind:this={imageInput} hidden onchange={(e) => { const f = e.currentTarget.files?.[0]; if (f) void project.setLessonImage(f); e.currentTarget.value = ''; }} />
	<input type="file" bind:this={fileInput} hidden onchange={(e) => { const f = e.currentTarget.files?.[0]; if (f) void project.setLessonFile(f); e.currentTarget.value = ''; }} />

	{#if current}
	<div class="editor" class:no-panel={!hasPanel}>
		<aside class="lessons card">
			<LessonList
				lessons={project.data.lessons}
				currentId={current.id}
				onselect={selectLesson}
				onadd={addLesson}
				onaddvideo={() => videoInput?.click()}
				onremove={(id) => void project.removeLesson(id)}
				onmove={(id, d) => project.moveLesson(id, d)}
				onduplicate={(id) => project.duplicateLesson(id)}
			/>
		</aside>

		<section class="work">
			<div class="workhead card">
				<span class="badge">{LESSON_LABELS[current.kind]}</span>
				<input class="input lesson-title" bind:value={current.title} aria-label="Título del elemento" />
				{#if !lessonReady(current)}<span class="badge warn">Vacío</span>{/if}
			</div>

			{#if current.kind === 'video' && project.videoUrl}
				<VideoPlayer bind:this={player} src={project.videoUrl} bind:currentTime bind:duration bind:paused>
					{#snippet bar()}
						<Timeline
							{duration}
							{currentTime}
							interactions={project.sorted}
							editable
							{selectedId}
							onseek={(t) => player?.seek(t)}
							onselect={(id) => selectInteraction(id)}
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
			{:else if current.kind === 'quiz'}
				<div class="card addbar">
					<div class="addhead">
						<strong>Cuestionario sin video</strong>
						<span class="muted small">Agrega preguntas; el estudiante debe alcanzar el {Math.round(current.threshold * 100)}% para aprobar.</span>
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
					<div class="quiz-settings">
						<label class="label" for="q-threshold">Umbral de aprobación (%)</label>
						<input id="q-threshold" class="input narrow" type="number" min="0" max="100" step="5" bind:value={current.threshold} />
					</div>
				</div>
			{:else if current.kind === 'content'}
				<div class="card form">
					<label class="label" for="c-body">Texto de la página</label>
					<textarea id="c-body" class="textarea tall" bind:value={current.body} placeholder="Escribe el contenido de lectura…"></textarea>
					<div class="row">
						<button class="btn small" onclick={() => imageInput?.click()}>🖼 {current.imageKey ? 'Cambiar imagen' : 'Agregar imagen'}</button>
						{#if current.imageKey}
							<button class="btn small ghost danger" onclick={() => project.clearLessonImage()}>Quitar imagen</button>
						{/if}
						{#if current.imageName}<span class="muted small">{current.imageName}</span>{/if}
					</div>
					{#if project.assetUrl}
						<img class="preview-img" src={project.assetUrl} alt={current.imageName ?? 'Imagen de la página'} />
					{/if}
				</div>
			{:else if current.kind === 'resource'}
				<div class="card form">
					<label class="label" for="r-desc">Descripción</label>
					<textarea id="r-desc" class="textarea" bind:value={current.description} placeholder="¿Para qué sirve este recurso?"></textarea>
					<label class="label" for="r-url">Enlace externo (opcional)</label>
					<input id="r-url" class="input" bind:value={current.url} placeholder="https://…" />
					<div class="row">
						<button class="btn small" onclick={() => fileInput?.click()}>📎 {current.fileKey ? 'Cambiar archivo' : 'Adjuntar archivo'}</button>
						{#if current.fileKey}
							<button class="btn small ghost danger" onclick={() => project.clearLessonFile()}>Quitar archivo</button>
						{/if}
						{#if current.fileName}<span class="muted small">{current.fileName}</span>{/if}
					</div>
				</div>
			{:else if current.kind === 'video'}
				<p class="muted loading-video">Cargando video…</p>
			{/if}
		</section>

		{#if hasPanel}
			<aside class="panel card">
				{#if selected}
					{#key selected.id}
						<InteractionForm
							interaction={selected}
							{currentTime}
							{duration}
							onclose={() => (selectedId = null)}
							ondelete={() => removeInteraction(selected.id)}
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
							<p>Aún no hay preguntas en este elemento.</p>
							<p>{isVideo ? 'Dale ▶ al video y pulsa un tipo de pregunta debajo.' : 'Pulsa un tipo de pregunta arriba.'}</p>
						</div>
					{:else}
						<ol class="list">
							{#each project.sorted as i (i.id)}
								{@const errs = validate(i)}
								<li>
									<button class="item" onclick={() => selectInteraction(i.id)}>
										{#if isVideo}<span class="t">{formatTimePrecise(i.time)}</span>{/if}
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
		{/if}
	</div>
	{:else}
		<div class="empty-course card">
			<h2>Tu curso está vacío</h2>
			<p class="muted">Agrega un video, una página de contenido, un cuestionario o un recurso.</p>
			<div class="addrow">
				<button class="btn primary" onclick={() => videoInput?.click()}>+ 🎬 Video</button>
				<button class="btn" onclick={() => project.addContentLesson()}>+ 📄 Contenido</button>
				<button class="btn" onclick={() => project.addQuizLesson()}>+ 📝 Cuestionario</button>
				<button class="btn" onclick={() => project.addResourceLesson()}>+ 📎 Recurso</button>
			</div>
		</div>
	{/if}
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
		flex: 0 1 300px;
	}
	.title-input:hover,
	.title-input:focus {
		border-color: var(--border);
		outline: none;
	}
	.save {
		font-size: 12px;
	}
	.coursebar {
		display: flex;
		align-items: center;
		gap: 12px;
		flex-wrap: wrap;
		margin: 12px 20px 0;
		padding: 10px 14px;
		font-size: 13px;
	}
	.switch {
		display: flex;
		gap: 8px;
		align-items: center;
		cursor: pointer;
	}
	.switch input {
		accent-color: var(--accent);
	}
	.spacer {
		flex: 1;
	}
	.threshold {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.narrow {
		width: 72px;
	}
	.editor {
		display: grid;
		grid-template-columns: 250px minmax(0, 1fr) 400px;
		gap: 18px;
		padding: 16px 20px 24px;
		max-width: 1500px;
		margin: 0 auto;
		align-items: start;
	}
	.editor.no-panel {
		grid-template-columns: 250px minmax(0, 1fr);
	}
	@media (max-width: 1100px) {
		.editor,
		.editor.no-panel {
			grid-template-columns: 1fr;
		}
	}
	.lessons {
		padding: 14px;
		position: sticky;
		top: 88px;
	}
	@media (max-width: 1100px) {
		.lessons {
			position: static;
		}
	}
	.work {
		display: grid;
		gap: 16px;
	}
	.workhead {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 12px;
	}
	.lesson-title {
		flex: 1;
		min-width: 0;
		font-weight: 700;
	}
	.loading-video {
		padding: 24px;
		text-align: center;
	}
	.card.form {
		padding: 18px;
		display: grid;
		gap: 10px;
	}
	.tall {
		min-height: 200px;
	}
	.form .row {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}
	.preview-img {
		max-width: 100%;
		border-radius: var(--radius);
		border: 1px solid var(--border);
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
	.quiz-settings {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.quiz-settings .label {
		margin: 0;
	}
	.panel {
		padding: 18px;
		position: sticky;
		top: 88px;
		max-height: calc(100vh - 108px);
		overflow: auto;
	}
	@media (max-width: 1100px) {
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
	.empty-course {
		max-width: 560px;
		margin: 40px auto;
		padding: 28px;
		display: grid;
		gap: 10px;
		justify-items: start;
	}
	.empty-course h2 {
		font-size: 20px;
	}
	.empty-course p {
		margin: 0;
	}
	.addrow {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
</style>
