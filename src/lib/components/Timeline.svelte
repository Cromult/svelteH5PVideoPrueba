<script lang="ts">
	import { formatTimePrecise } from '#lib/project.svelte.ts';
	import { TYPE_ICONS, TYPE_LABELS, type Interaction } from '#lib/types.ts';

	type MarkerState = 'pending' | 'correct' | 'wrong' | 'partial';

	interface Props {
		duration: number;
		currentTime: number;
		interactions: Interaction[];
		editable?: boolean;
		selectedId?: string | null;
		/** Estado de cada pregunta en modo estudiante. */
		states?: Record<string, MarkerState>;
		/** Hasta dónde puede llegar el estudiante (zona bloqueada después). */
		limit?: number | null;
		onseek: (time: number) => void;
		onselect?: (id: string) => void;
		onmove?: (id: string, time: number) => void;
	}

	let {
		duration,
		currentTime,
		interactions,
		editable = false,
		selectedId = null,
		states = {},
		limit = null,
		onseek,
		onselect,
		onmove
	}: Props = $props();

	let track: HTMLDivElement;
	let hoverTime = $state<number | null>(null);
	let dragging = $state<{ id: string; time: number; moved: boolean; startX: number } | null>(null);
	let scrubbing = false;

	const pct = (t: number) => (duration ? (Math.min(Math.max(t, 0), duration) / duration) * 100 : 0);

	function timeAt(clientX: number) {
		const r = track.getBoundingClientRect();
		const ratio = Math.min(Math.max((clientX - r.left) / r.width, 0), 1);
		return Math.round(ratio * duration * 10) / 10;
	}

	function trackDown(e: PointerEvent) {
		if (!duration) return;
		scrubbing = true;
		track.setPointerCapture(e.pointerId);
		onseek(timeAt(e.clientX));
	}
	function trackMove(e: PointerEvent) {
		if (!duration) return;
		hoverTime = timeAt(e.clientX);
		if (scrubbing) onseek(hoverTime);
	}
	function trackUp(e: PointerEvent) {
		scrubbing = false;
		if (track.hasPointerCapture(e.pointerId)) track.releasePointerCapture(e.pointerId);
	}

	function markerDown(e: PointerEvent, i: Interaction) {
		e.stopPropagation();
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		dragging = { id: i.id, time: i.time, moved: false, startX: e.clientX };
	}
	function markerMove(e: PointerEvent) {
		if (!dragging || !editable) return;
		if (!dragging.moved && Math.abs(e.clientX - dragging.startX) < 4) return;
		dragging.moved = true;
		dragging.time = timeAt(e.clientX);
		hoverTime = dragging.time;
	}
	function markerUp(i: Interaction) {
		if (!dragging) return;
		if (dragging.moved) onmove?.(i.id, dragging.time);
		else onselect?.(i.id);
		dragging = null;
	}

	function markerKey(e: KeyboardEvent, i: Interaction) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			onselect?.(i.id);
		} else if (editable && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
			e.preventDefault();
			const step = e.shiftKey ? 1 : 0.1;
			const next = i.time + (e.key === 'ArrowLeft' ? -step : step);
			onmove?.(i.id, Math.round(Math.min(Math.max(next, 0), duration) * 10) / 10);
		}
	}
</script>

<div class="timeline" class:editable>
	<div
		class="track"
		bind:this={track}
		onpointerdown={trackDown}
		onpointermove={trackMove}
		onpointerup={trackUp}
		onpointerleave={() => (hoverTime = dragging ? hoverTime : null)}
		role="slider"
		tabindex="-1"
		aria-label="Línea de tiempo"
		aria-valuemin={0}
		aria-valuemax={duration}
		aria-valuenow={currentTime}
	>
		<div class="rail"></div>
		<div class="played" style:width="{pct(currentTime)}%"></div>
		{#if limit !== null && limit < duration}
			<div class="locked" style:left="{pct(limit)}%" title="Responde la pregunta para avanzar"></div>
		{/if}
		{#if hoverTime !== null}
			<div class="hover" style:left="{pct(hoverTime)}%">
				<span>{formatTimePrecise(hoverTime)}</span>
			</div>
		{/if}
		<div class="head" style:left="{pct(currentTime)}%"></div>

		{#each interactions as i (i.id)}
			{@const t = dragging?.id === i.id ? dragging.time : i.time}
			<button
				class="marker {states[i.id] ?? ''}"
				class:selected={selectedId === i.id}
				class:dragging={dragging?.id === i.id && dragging.moved}
				style:left="{pct(t)}%"
				onpointerdown={(e) => markerDown(e, i)}
				onpointermove={markerMove}
				onpointerup={() => markerUp(i)}
				onkeydown={(e) => markerKey(e, i)}
				title="{formatTimePrecise(t)} · {TYPE_LABELS[i.type]}{i.question ? ' · ' + i.question : ''}"
				aria-label="Pregunta en {formatTimePrecise(t)}: {TYPE_LABELS[i.type]}"
			>
				<span>{TYPE_ICONS[i.type]}</span>
			</button>
		{/each}
	</div>
</div>

<style>
	.timeline {
		padding: 22px 0 6px;
		user-select: none;
		touch-action: none;
	}
	.track {
		outline: none;
		position: relative;
		height: 22px;
		cursor: pointer;
	}
	.rail,
	.played,
	.locked {
		position: absolute;
		top: 8px;
		height: 6px;
		border-radius: 3px;
	}
	.rail {
		left: 0;
		right: 0;
		background: rgb(255 255 255 / 0.18);
	}
	.played {
		left: 0;
		background: var(--accent);
	}
	.locked {
		right: 0;
		background: repeating-linear-gradient(45deg, rgb(255 255 255 / 0.08) 0 4px, transparent 4px 8px);
		border-radius: 0 3px 3px 0;
		cursor: not-allowed;
	}
	.head {
		position: absolute;
		top: 4px;
		width: 14px;
		height: 14px;
		margin-left: -7px;
		border-radius: 50%;
		background: #fff;
		box-shadow: 0 0 0 3px var(--accent);
		pointer-events: none;
	}
	.hover {
		position: absolute;
		top: 2px;
		bottom: 2px;
		width: 1px;
		background: rgb(255 255 255 / 0.5);
		pointer-events: none;
	}
	.hover span {
		position: absolute;
		bottom: 100%;
		left: 50%;
		transform: translateX(-50%);
		margin-bottom: 4px;
		font-size: 11px;
		color: #fff;
		background: #000c;
		padding: 1px 5px;
		border-radius: 4px;
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
	}
	.marker {
		position: absolute;
		top: -18px;
		width: 26px;
		height: 26px;
		margin-left: -13px;
		border: 2px solid #fff;
		border-radius: 8px 8px 8px 2px;
		transform: rotate(-45deg);
		background: var(--accent-2);
		color: #fff;
		font-size: 10px;
		font-weight: 700;
		display: grid;
		place-items: center;
		padding: 0;
		cursor: pointer;
		box-shadow: 0 2px 8px rgb(0 0 0 / 0.4);
		transition: box-shadow 0.15s, background 0.15s;
		touch-action: none;
	}
	.marker span {
		transform: rotate(45deg);
		line-height: 1;
	}
	.editable .marker {
		cursor: grab;
	}
	.marker.dragging {
		cursor: grabbing;
		z-index: 2;
	}
	.marker.selected {
		box-shadow: 0 0 0 3px var(--accent), 0 2px 8px rgb(0 0 0 / 0.4);
		z-index: 1;
	}
	.marker.correct {
		background: var(--ok);
	}
	.marker.wrong {
		background: var(--bad);
	}
	.marker.partial {
		background: var(--warn);
	}
	.marker:focus-visible {
		outline: 2px solid #fff;
		outline-offset: 2px;
	}
</style>
