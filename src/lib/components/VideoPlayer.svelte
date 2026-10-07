<script lang="ts">
	import type { Snippet } from 'svelte';
	import { formatTime } from '#lib/project.svelte.ts';

	interface Props {
		src: string;
		currentTime?: number;
		duration?: number;
		paused?: boolean;
		/** Capa sobre el video (preguntas). */
		overlay?: Snippet;
		/** Si la capa está visible (por defecto, siempre que exista). */
		overlayOpen?: boolean;
		/** Zona de progreso bajo el video (timeline del editor o barra del estudiante). */
		bar?: Snippet;
		/** Permite al dueño corregir un salto (p. ej. no adelantar preguntas obligatorias). */
		clampSeek?: (target: number) => number;
		/** Se llama en cada frame mientras reproduce, con el tiempo anterior y el actual. */
		onframe?: (prev: number, now: number) => void;
		onended?: () => void;
		/** Bloquea play/teclado mientras hay una pregunta abierta. */
		locked?: boolean;
	}

	let {
		src,
		currentTime = $bindable(0),
		duration = $bindable(0),
		paused = $bindable(true),
		overlay,
		overlayOpen = true,
		bar,
		clampSeek,
		onframe,
		onended,
		locked = false
	}: Props = $props();

	let video: HTMLVideoElement;
	let wrapper: HTMLDivElement;
	let rate = $state(1);
	let muted = $state(false);
	let raf = 0;
	let prev = 0;
	let endedFired = false;

	function loop() {
		const now = video.currentTime;
		currentTime = now;
		onframe?.(prev, now);
		prev = video.currentTime;
		if (!video.paused) {
			raf = requestAnimationFrame(loop);
		} else {
			// Si el navegador no emitió 'pause'/'ended' (p. ej. salto directo al final), sincronizamos aquí.
			onPause();
			if (video.ended) fireEnded();
		}
	}

	function fireEnded() {
		if (endedFired) return;
		endedFired = true;
		onPause();
		onended?.();
	}

	function onPlay() {
		endedFired = false;
		paused = false;
		prev = video.currentTime;
		cancelAnimationFrame(raf);
		raf = requestAnimationFrame(loop);
	}

	function onPause() {
		paused = true;
		cancelAnimationFrame(raf);
		currentTime = video.currentTime;
	}

	$effect(() => () => cancelAnimationFrame(raf));
	$effect(() => {
		if (video) video.playbackRate = rate;
	});

	export function play() {
		if (!locked) void video.play();
	}
	export function pause() {
		video.pause();
	}
	export function toggle() {
		if (video.paused) play();
		else pause();
	}
	/** Salto respetando clampSeek. Devuelve el tiempo final. */
	export function seek(target: number, { force = false } = {}) {
		let t = Math.min(Math.max(0, target), duration || target);
		if (!force && clampSeek) t = clampSeek(t);
		endedFired = false;
		video.currentTime = t;
		currentTime = t;
		prev = t;
		return t;
	}
	export function getVideo() {
		return video;
	}

	function onKey(e: KeyboardEvent) {
		if (locked) return;
		const target = e.target as HTMLElement;
		if (target.closest('input, textarea, select, [contenteditable], [role="dialog"]')) return;
		if (e.ctrlKey || e.metaKey || e.altKey) return;
		if ((e.key === ' ' && !target.closest('button, a')) || e.key === 'k') {
			e.preventDefault();
			toggle();
		} else if (e.key === 'ArrowLeft') {
			seek(currentTime - 5);
		} else if (e.key === 'ArrowRight') {
			seek(currentTime + 5);
		}
	}

	function fullscreen() {
		if (document.fullscreenElement) void document.exitFullscreen();
		else void wrapper.requestFullscreen();
	}
</script>

<svelte:window onkeydown={onKey} />

<div class="player" bind:this={wrapper} role="region" aria-label="Reproductor de video">
	<div class="stage">
		<!-- svelte-ignore a11y_media_has_caption -->
		<video
			bind:this={video}
			{src}
			bind:duration
			bind:muted
			playsinline
			preload="auto"
			onplay={onPlay}
			onpause={onPause}
			onended={fireEnded}
			onseeked={() => {
				currentTime = video.currentTime;
				if (video.ended) fireEnded();
			}}
			onclick={() => toggle()}
		></video>

		{#if paused && !(overlay && overlayOpen) && !locked}
			<button class="big-play" onclick={() => play()} aria-label="Reproducir">▶</button>
		{/if}

		{#if overlay && overlayOpen}
			<div class="overlay">{@render overlay()}</div>
		{/if}
	</div>

	{#if bar}
		<div class="bar">{@render bar()}</div>
	{/if}

	<div class="controls">
		<button class="icon" onclick={() => toggle()} disabled={locked} aria-label={paused ? 'Reproducir' : 'Pausar'}>
			{paused ? '▶' : '❚❚'}
		</button>
		<button class="icon" onclick={() => seek(currentTime - 5)} disabled={locked} aria-label="Retroceder 5 segundos">↺5</button>
		<span class="time">{formatTime(currentTime)} / {formatTime(duration)}</span>
		<span class="spacer"></span>
		<select bind:value={rate} aria-label="Velocidad">
			{#each [0.5, 0.75, 1, 1.25, 1.5, 2] as r (r)}
				<option value={r}>{r}×</option>
			{/each}
		</select>
		<button class="icon" onclick={() => (muted = !muted)} aria-label={muted ? 'Activar sonido' : 'Silenciar'}>
			{muted ? '🔇' : '🔊'}
		</button>
		<button class="icon" onclick={fullscreen} aria-label="Pantalla completa">⛶</button>
	</div>
</div>

<style>
	.player {
		background: #000;
		border-radius: var(--radius-lg);
		overflow: hidden;
		outline: none;
		display: flex;
		flex-direction: column;
		box-shadow: var(--shadow);
	}
	.player:fullscreen .stage {
		flex: 1;
	}
	.stage {
		position: relative;
		aspect-ratio: 16 / 9;
		background: #000;
	}
	.player:fullscreen .stage {
		aspect-ratio: auto;
	}
	video {
		width: 100%;
		height: 100%;
		display: block;
		object-fit: contain;
		cursor: pointer;
	}
	.overlay {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		padding: 16px;
		background: rgb(10 12 20 / 0.55);
		backdrop-filter: blur(3px);
		overflow: auto;
		animation: fade 0.18s ease-out;
	}
	@keyframes fade {
		from {
			opacity: 0;
		}
	}
	.big-play {
		position: absolute;
		inset: 0;
		margin: auto;
		width: 72px;
		height: 72px;
		border-radius: 50%;
		border: none;
		background: rgb(255 255 255 / 0.92);
		color: #111;
		font-size: 28px;
		padding-left: 6px;
		cursor: pointer;
		box-shadow: 0 6px 30px rgb(0 0 0 / 0.4);
		transition: transform 0.15s;
	}
	.big-play:hover {
		transform: scale(1.06);
	}
	.bar {
		background: #11131a;
		padding: 10px 14px 0;
	}
	.controls {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px 10px;
		background: #11131a;
		color: #e8eaf0;
	}
	.icon {
		background: transparent;
		border: none;
		color: inherit;
		font-size: 15px;
		min-width: 36px;
		height: 32px;
		border-radius: 8px;
		cursor: pointer;
	}
	.icon:hover:not(:disabled) {
		background: rgb(255 255 255 / 0.1);
	}
	.icon:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	.time {
		font-variant-numeric: tabular-nums;
		font-size: 13px;
		opacity: 0.85;
		margin-left: 4px;
	}
	.spacer {
		flex: 1;
	}
	select {
		background: transparent;
		color: inherit;
		border: 1px solid rgb(255 255 255 / 0.2);
		border-radius: 8px;
		padding: 3px 6px;
		font-size: 13px;
	}
	select option {
		color: #111;
	}
</style>
