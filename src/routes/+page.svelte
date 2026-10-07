<script lang="ts">
	import { goto } from '$app/navigation';
	import { asset, resolve } from '$app/paths';
	import { formatTime, project } from '#lib/project.svelte.ts';

	let title = $state('');
	let file = $state<File | null>(null);
	let dragOver = $state(false);
	let busy = $state(false);
	let error = $state('');

	function pick(f: File | undefined | null) {
		error = '';
		if (!f) return;
		if (!f.type.startsWith('video/')) {
			error = 'El archivo debe ser un video (MP4 recomendado).';
			return;
		}
		file = f;
		if (!title) title = f.name.replace(/\.[^.]+$/, '');
	}

	async function useSample() {
		busy = true;
		error = '';
		try {
			const res = await fetch(asset('video-ejemplo.mp4'));
			const blob = await res.blob();
			file = new File([blob], 'video-ejemplo.mp4', { type: 'video/mp4' });
			if (!title) title = 'Video de ejemplo';
		} catch (e) {
			error = 'No se pudo cargar el video de ejemplo: ' + (e as Error).message;
		} finally {
			busy = false;
		}
	}

	async function create() {
		if (!file) return;
		busy = true;
		try {
			await project.createFromFile(file, title.trim());
			await goto(resolve('/editor'));
		} catch (e) {
			error = 'No se pudo guardar el video en el navegador: ' + (e as Error).message;
		} finally {
			busy = false;
		}
	}
</script>

<main>
	<header>
		<span class="logo">▶</span>
		<div>
			<h1>Video interactivo</h1>
			<p class="muted">Demo aislada del LMS · Editor + vista del estudiante, sin H5P</p>
		</div>
	</header>

	{#if project.data}
		<section class="card current">
			<div class="info">
				<span class="label">Proyecto guardado en este navegador</span>
				<h2>{project.data.title}</h2>
				<p class="muted">
					{project.data.videoName} · {formatTime(project.data.duration)} ·
					{project.data.interactions.length} pregunta(s) ·
					{#if project.data.status === 'published'}
						<span class="badge ok">Publicado</span>
					{:else}
						<span class="badge warn">Borrador</span>
					{/if}
				</p>
			</div>
			<div class="actions">
				<a class="btn primary" href={resolve('/editor')}>✎ Abrir editor</a>
				<a class="btn" href={resolve('/preview')}>👁 Ver como estudiante</a>
				<button class="btn ghost danger" onclick={() => project.reset()}>Borrar</button>
			</div>
		</section>
		<h3 class="or muted">o empieza con otro video</h3>
	{/if}

	<section class="card new">
		<label
			class="drop"
			class:over={dragOver}
			class:has={file}
			ondragover={(e) => {
				e.preventDefault();
				dragOver = true;
			}}
			ondragleave={() => (dragOver = false)}
			ondrop={(e) => {
				e.preventDefault();
				dragOver = false;
				pick(e.dataTransfer?.files[0]);
			}}
		>
			<input type="file" accept="video/mp4,video/webm,video/*" onchange={(e) => pick(e.currentTarget.files?.[0])} hidden />
			{#if file}
				<span class="big">🎬</span>
				<strong>{file.name}</strong>
				<span class="muted">{(file.size / 1024 / 1024).toFixed(1)} MB · clic para cambiar</span>
			{:else}
				<span class="big">⬆</span>
				<strong>Arrastra un MP4 aquí o haz clic para elegirlo</strong>
				<span class="muted">El video se queda en tu navegador (IndexedDB). No se sube a ningún servidor.</span>
			{/if}
		</label>

		<div class="row">
			<div class="grow">
				<label class="label" for="title">Título</label>
				<input id="title" class="input" bind:value={title} placeholder="Ej.: Clase 3 – La célula" />
			</div>
			<button class="btn primary" disabled={!file || busy} onclick={create}>
				{busy ? 'Guardando…' : 'Crear video interactivo →'}
			</button>
		</div>
		{#if !file}
			<button class="btn ghost small sample" onclick={useSample} disabled={busy}>
				¿No tienes un video a mano? Usar el video de ejemplo (60 s)
			</button>
		{/if}
		{#if error}<p class="error">{error}</p>{/if}
	</section>

	<ol class="steps muted">
		<li><b>1. Editor:</b> reproduce el video y en cada momento pulsa <kbd>Agregar pregunta aquí</kbd>.</li>
		<li><b>2. Previsualizar:</b> revisa el resultado final antes de publicar.</li>
		<li><b>3. Estudiante:</b> el video se pausa en cada pregunta, califica y muestra el resumen.</li>
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
		color: #fff;
		font-size: 20px;
		background: linear-gradient(135deg, var(--accent), var(--accent-2));
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
		min-width: 220px;
	}
	.current p {
		margin: 4px 0 0;
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
