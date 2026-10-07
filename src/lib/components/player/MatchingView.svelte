<script lang="ts">
	import type { Matching } from '#lib/types.ts';

	interface Props {
		interaction: Matching;
		/** leftId -> id del par elegido a la derecha. */
		links: Record<string, string>;
		revealed: boolean;
	}
	let { interaction, links = $bindable(), revealed }: Props = $props();

	const COLORS = ['#6366f1', '#ec4899', '#14b8a6', '#f59e0b', '#8b5cf6', '#0ea5e9', '#ef4444', '#22c55e'];

	const pairs = $derived(interaction.pairs.filter((p) => p.left.trim() && p.right.trim()));

	// Columna derecha desordenada una sola vez por montaje (y distinta del orden original).
	const rightOrder: string[] = (() => {
		const ids = interaction.pairs.filter((p) => p.left.trim() && p.right.trim()).map((p) => p.id);
		const shuffled = [...ids];
		for (let tries = 0; tries < 10; tries++) {
			for (let i = shuffled.length - 1; i > 0; i--) {
				const j = Math.floor(Math.random() * (i + 1));
				[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
			}
			if (shuffled.length < 2 || shuffled.some((id, i) => id !== ids[i])) break;
		}
		return shuffled;
	})();
	const rights = $derived(rightOrder.map((id) => pairs.find((p) => p.id === id)!).filter(Boolean));

	let box: HTMLDivElement;
	const leftDots: Record<string, HTMLElement> = {};
	const rightDots: Record<string, HTMLElement> = {};

	/** Sube cuando cambia el tamaño, para recalcular las coordenadas de los cables. */
	let layoutVersion = $state(0);
	let drag = $state<{ side: 'L' | 'R'; id: string; x: number; y: number } | null>(null);
	/** Selección por clic (alternativa accesible al arrastre). */
	let picked = $state<{ side: 'L' | 'R'; id: string } | null>(null);

	$effect(() => {
		const ro = new ResizeObserver(() => layoutVersion++);
		ro.observe(box);
		return () => ro.disconnect();
	});

	function center(el: HTMLElement | undefined) {
		if (!el || !box) return { x: 0, y: 0 };
		const b = box.getBoundingClientRect();
		const r = el.getBoundingClientRect();
		return { x: r.left + r.width / 2 - b.left, y: r.top + r.height / 2 - b.top };
	}

	function cable(a: { x: number; y: number }, b: { x: number; y: number }) {
		const dx = Math.max(40, Math.abs(b.x - a.x) * 0.45);
		const sx = b.x >= a.x ? 1 : -1;
		return `M ${a.x} ${a.y} C ${a.x + dx * sx} ${a.y}, ${b.x - dx * sx} ${b.y}, ${b.x} ${b.y}`;
	}

	const leftIndex = (id: string) => pairs.findIndex((p) => p.id === id);
	const colorOf = (leftId: string) => COLORS[leftIndex(leftId) % COLORS.length];
	const rightOwner = (rightId: string) => Object.keys(links).find((l) => links[l] === rightId);

	const lines = $derived.by(() => {
		void layoutVersion;
		void pairs.length;
		return Object.entries(links).map(([l, r]) => ({
			left: l,
			right: r,
			d: cable(center(leftDots[l]), center(rightDots[r])),
			ok: l === r
		}));
	});

	function connect(leftId: string, rightId: string) {
		const next: Record<string, string> = {};
		// Uno a uno: cada lado solo puede tener un cable.
		for (const [l, r] of Object.entries(links)) if (l !== leftId && r !== rightId) next[l] = r;
		next[leftId] = rightId;
		links = next;
	}

	function disconnect(leftId: string) {
		if (revealed) return;
		const { [leftId]: _, ...rest } = links;
		links = rest;
	}

	function start(e: PointerEvent, side: 'L' | 'R', id: string) {
		if (revealed) return;
		e.preventDefault();
		const b = box.getBoundingClientRect();
		drag = { side, id, x: e.clientX - b.left, y: e.clientY - b.top };
		// Al tomar un extremo ya conectado, se suelta para poder re-enchufarlo.
		if (side === 'L') disconnect(id);
		else {
			const owner = rightOwner(id);
			if (owner) disconnect(owner);
		}
		window.addEventListener('pointermove', move);
		window.addEventListener('pointerup', end, { once: true });
	}

	function move(e: PointerEvent) {
		if (!drag) return;
		const b = box.getBoundingClientRect();
		drag.x = e.clientX - b.left;
		drag.y = e.clientY - b.top;
	}

	function end(e: PointerEvent) {
		window.removeEventListener('pointermove', move);
		const d = drag;
		drag = null;
		if (!d) return;
		// elementsFromPoint (plural): el destino puede estar debajo de otro cable.
		const target = document
			.elementsFromPoint(e.clientX, e.clientY)
			.map((el) => el.closest<HTMLElement>('[data-side]'))
			.find((el) => el && box.contains(el));
		if (!target) return;
		const side = target.dataset.side as 'L' | 'R';
		const id = target.dataset.id!;
		if (side === d.side) {
			// Soltó sobre el mismo lado sin moverse: lo tratamos como clic.
			if (id === d.id) pick(side, id);
			return;
		}
		picked = null;
		if (d.side === 'L') connect(d.id, id);
		else connect(id, d.id);
	}

	function pick(side: 'L' | 'R', id: string) {
		if (revealed) return;
		if (picked && picked.side !== side) {
			if (side === 'R') connect(picked.id, id);
			else connect(id, picked.id);
			picked = null;
		} else {
			picked = picked?.id === id ? null : { side, id };
		}
	}

	function onKey(e: KeyboardEvent, side: 'L' | 'R', id: string) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			pick(side, id);
		}
	}

	const dragFrom = $derived(
		drag ? (void layoutVersion, center(drag.side === 'L' ? leftDots[drag.id] : rightDots[drag.id])) : null
	);
</script>

<p class="hint">
	{revealed ? 'Verde = bien unido · Rojo = incorrecto' : 'Arrastra desde un punto hasta su pareja. Clic en un cable para quitarlo.'}
</p>

<div class="board" class:dragging={drag} bind:this={box}>
	<ul class="col left">
		{#each pairs as p (p.id)}
			{@const linked = p.id in links}
			<li>
				<div
					class="item"
					class:linked
					class:picked={picked?.side === 'L' && picked.id === p.id}
					class:ok={revealed && links[p.id] === p.id}
					class:bad={revealed && links[p.id] !== p.id}
					data-side="L"
					data-id={p.id}
					onpointerdown={(e) => start(e, 'L', p.id)}
					onkeydown={(e) => onKey(e, 'L', p.id)}
					role="button"
					tabindex={revealed ? -1 : 0}
					style:--c={colorOf(p.id)}
				>
					<span class="text">{p.left}</span>
					<span class="dot" bind:this={leftDots[p.id]}></span>
				</div>
			</li>
		{/each}
	</ul>

	<ul class="col right">
		{#each rights as p (p.id)}
			{@const owner = rightOwner(p.id)}
			<li>
				<div
					class="item"
					class:linked={owner}
					class:picked={picked?.side === 'R' && picked.id === p.id}
					class:ok={revealed && owner === p.id}
					class:bad={revealed && owner !== undefined && owner !== p.id}
					data-side="R"
					data-id={p.id}
					onpointerdown={(e) => start(e, 'R', p.id)}
					onkeydown={(e) => onKey(e, 'R', p.id)}
					role="button"
					tabindex={revealed ? -1 : 0}
					style:--c={owner ? colorOf(owner) : 'var(--border)'}
				>
					<span class="dot" bind:this={rightDots[p.id]}></span>
					<span class="text">{p.right}</span>
				</div>
			</li>
		{/each}
	</ul>

	<svg class="cables" aria-hidden="true">
		{#each lines as line (line.left)}
			{@const color = revealed ? (line.ok ? 'var(--ok)' : 'var(--bad)') : colorOf(line.left)}
			<g class="cable" class:interactive={!revealed}>
				<path d={line.d} class="shadow" />
				<path d={line.d} stroke={color} class="wire" />
				<path d={line.d} class="hit" onclick={() => disconnect(line.left)} role="presentation" />
			</g>
		{/each}
		{#if drag && dragFrom}
			<path
				d={drag.side === 'L' ? cable(dragFrom, drag) : cable(drag, dragFrom)}
				class="wire live"
				stroke={drag.side === 'L' ? colorOf(drag.id) : 'var(--accent)'}
			/>
			<circle cx={drag.x} cy={drag.y} r="7" fill={drag.side === 'L' ? colorOf(drag.id) : 'var(--accent)'} />
		{/if}
	</svg>
</div>

{#if revealed}
	{@const wrong = pairs.filter((p) => links[p.id] !== p.id)}
	{#if wrong.length}
		<ul class="answers">
			{#each wrong as p (p.id)}
				<li><b>{p.left}</b> → {p.right}</li>
			{/each}
		</ul>
	{/if}
{/if}

<style>
	.hint {
		margin: -4px 0 12px;
		font-size: 13px;
		color: var(--muted);
	}
	.board {
		position: relative;
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: clamp(48px, 14vw, 140px);
		user-select: none;
		touch-action: none;
	}
	.board.dragging {
		cursor: grabbing;
	}
	.col {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 10px;
		align-content: start;
		position: relative;
		z-index: 1;
	}
	.item {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 46px;
		padding: 8px 12px;
		border-radius: var(--radius);
		border: 2px solid var(--border);
		background: var(--surface);
		cursor: grab;
		font-size: 15px;
		transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
		outline: none;
	}
	.left .item {
		justify-content: space-between;
	}
	.item:hover,
	.item:focus-visible {
		border-color: var(--accent);
	}
	.item.picked {
		box-shadow: 0 0 0 3px var(--accent-soft);
		border-color: var(--accent);
	}
	.item.linked {
		border-color: var(--c);
	}
	.item.ok {
		border-color: var(--ok);
		background: var(--ok-soft);
	}
	.item.bad {
		border-color: var(--bad);
		background: var(--bad-soft);
	}
	.text {
		flex: 1;
	}
	.dot {
		flex: none;
		width: 16px;
		height: 16px;
		border-radius: 50%;
		border: 3px solid var(--c, var(--border));
		background: var(--surface);
		transition: transform 0.15s, background 0.15s;
	}
	.left .dot {
		margin-right: -21px;
	}
	.right .dot {
		margin-left: -21px;
	}
	.item.linked .dot {
		background: var(--c);
	}
	.item:hover .dot {
		transform: scale(1.25);
	}
	.cables {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		overflow: visible;
		pointer-events: none;
		z-index: 2;
	}
	.wire,
	.shadow,
	.hit {
		fill: none;
		stroke-linecap: round;
	}
	.wire {
		stroke-width: 4;
	}
	.shadow {
		stroke: rgb(0 0 0 / 0.15);
		stroke-width: 7;
	}
	.hit {
		stroke: transparent;
		stroke-width: 18;
	}
	.cable.interactive .hit {
		pointer-events: stroke;
		cursor: pointer;
	}
	.cable.interactive:hover .wire {
		stroke-dasharray: 8 6;
	}
	.live {
		stroke-dasharray: 2 0;
		opacity: 0.9;
	}
	.answers {
		margin: 14px 0 0;
		padding: 10px 12px 10px 28px;
		border-radius: var(--radius);
		background: var(--surface-2);
		font-size: 14px;
	}
</style>
