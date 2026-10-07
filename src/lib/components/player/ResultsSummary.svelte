<script lang="ts">
	import type { Snippet } from 'svelte';
	import { formatTime } from '#lib/project.svelte.ts';
	import { TYPE_ICONS, type GradeResult, type Interaction } from '#lib/types.ts';

	interface Props {
		interactions: Interaction[];
		results: Record<string, GradeResult>;
		onrestart: () => void;
		onreview: (interaction: Interaction) => void;
		actions?: Snippet;
	}

	let { interactions, results, onrestart, onreview, actions }: Props = $props();

	const max = $derived(interactions.reduce((s, i) => s + i.points, 0));
	const score = $derived(Math.round(interactions.reduce((s, i) => s + (results[i.id]?.score ?? 0), 0) * 100) / 100);
	const percent = $derived(max ? Math.round((score / max) * 100) : 0);
	const passed = $derived(percent >= 60);
</script>

<div class="card summary" role="dialog" aria-modal="true" aria-labelledby="sum-title">
	<div class="ring" style:--p={percent} class:passed>
		<span>{percent}%</span>
	</div>
	<h2 id="sum-title">{passed ? '¡Buen trabajo!' : 'Puedes mejorar'}</h2>
	<p class="muted">Obtuviste <b>{score}</b> de <b>{max}</b> puntos</p>

	<ol>
		{#each interactions as i (i.id)}
			{@const r = results[i.id]}
			<li>
				<button onclick={() => onreview(i)} title="Ver esta parte del video">
					<span class="state {r ? (r.correct ? 'ok' : r.score > 0 ? 'partial' : 'bad') : 'none'}">
						{r ? (r.correct ? '✓' : r.score > 0 ? '◐' : '✗') : '–'}
					</span>
					<span class="t">{formatTime(i.time)}</span>
					<span class="ico">{TYPE_ICONS[i.type]}</span>
					<span class="q">{i.question}</span>
					<span class="pts">{r ? r.score : 0}/{i.points}</span>
				</button>
			</li>
		{/each}
	</ol>

	<footer>
		<button class="btn" onclick={onrestart}>↻ Intentar de nuevo</button>
		{@render actions?.()}
	</footer>
</div>

<style>
	.summary {
		width: min(560px, 100%);
		max-height: 100%;
		overflow: auto;
		padding: 24px;
		display: grid;
		justify-items: center;
		gap: 8px;
		text-align: center;
		animation: pop 0.25s cubic-bezier(0.2, 0.9, 0.3, 1.2);
	}
	@keyframes pop {
		from {
			transform: scale(0.95);
			opacity: 0;
		}
	}
	.ring {
		--c: var(--warn);
		width: 96px;
		height: 96px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		background: conic-gradient(var(--c) calc(var(--p) * 1%), var(--surface-2) 0);
	}
	.ring.passed {
		--c: var(--ok);
	}
	.ring span {
		width: 76px;
		height: 76px;
		border-radius: 50%;
		background: var(--surface);
		display: grid;
		place-items: center;
		font-size: 22px;
		font-weight: 800;
	}
	h2 {
		font-size: 20px;
		margin-top: 6px;
	}
	p {
		margin: 0;
	}
	ol {
		list-style: none;
		margin: 10px 0 0;
		padding: 0;
		width: 100%;
		display: grid;
		gap: 4px;
		text-align: left;
	}
	ol button {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 10px;
		border: none;
		border-radius: var(--radius);
		background: var(--surface-2);
		cursor: pointer;
		font-size: 14px;
		text-align: left;
	}
	ol button:hover {
		outline: 1px solid var(--accent);
	}
	.state {
		width: 22px;
		height: 22px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		color: #fff;
		font-size: 12px;
		font-weight: 700;
		flex: none;
	}
	.state.ok {
		background: var(--ok);
	}
	.state.bad {
		background: var(--bad);
	}
	.state.partial {
		background: var(--warn);
	}
	.state.none {
		background: var(--border);
		color: var(--muted);
	}
	.t {
		font-variant-numeric: tabular-nums;
		color: var(--muted);
		font-size: 12px;
		width: 34px;
	}
	.ico {
		color: var(--accent);
		font-size: 12px;
		font-weight: 700;
		width: 22px;
	}
	.q {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.pts {
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}
	footer {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
		justify-content: center;
		margin-top: 12px;
	}
</style>
