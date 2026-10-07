<script lang="ts">
	import { lessonInteractions, LESSON_ICONS, LESSON_LABELS, type Lesson, type LessonKind } from '#lib/types.ts';

	interface Props {
		lessons: Lesson[];
		currentId: string | null;
		onselect: (id: string) => void;
		onadd: (kind: LessonKind) => void;
		onaddvideo: () => void;
		onremove: (id: string) => void;
		onmove: (id: string, delta: number) => void;
		onduplicate: (id: string) => void;
	}

	let { lessons, currentId, onselect, onadd, onaddvideo, onremove, onmove, onduplicate }: Props = $props();

	function count(l: Lesson): number {
		return lessonInteractions(l).length;
	}
</script>

<div class="list">
	<div class="head">
		<h2>Elementos <span class="muted">({lessons.length})</span></h2>
	</div>

	<ol>
		{#each lessons as l, idx (l.id)}
			<li class:on={l.id === currentId}>
				<button class="item" onclick={() => onselect(l.id)}>
					<span class="ico">{LESSON_ICONS[l.kind]}</span>
					<span class="q">
						{l.title || 'Sin título'}
						<small class="muted">{LESSON_LABELS[l.kind]}{count(l) ? ` · ${count(l)} preg.` : ''}</small>
					</span>
				</button>
				<div class="tools">
					<button class="mini" title="Subir" disabled={idx === 0} onclick={() => onmove(l.id, -1)}>↑</button>
					<button class="mini" title="Bajar" disabled={idx === lessons.length - 1} onclick={() => onmove(l.id, 1)}>↓</button>
					<button class="mini" title="Duplicar" onclick={() => onduplicate(l.id)}>⧉</button>
					<button class="mini danger" title="Eliminar" onclick={() => onremove(l.id)}>🗑</button>
				</div>
			</li>
		{/each}
		{#if lessons.length === 0}
			<li class="empty muted">Aún no hay elementos. Agrega el primero abajo.</li>
		{/if}
	</ol>

	<div class="add">
		<button class="btn small" onclick={onaddvideo}>+ 🎬 Video</button>
		<button class="btn small" onclick={() => onadd('content')}>+ 📄 Contenido</button>
		<button class="btn small" onclick={() => onadd('quiz')}>+ 📝 Cuestionario</button>
		<button class="btn small" onclick={() => onadd('resource')}>+ 📎 Recurso</button>
	</div>
</div>

<style>
	.list {
		display: grid;
		gap: 12px;
		align-content: start;
	}
	.head h2 {
		font-size: 16px;
	}
	ol {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 4px;
	}
	li {
		display: grid;
		grid-template-columns: 1fr auto;
		align-items: center;
		gap: 4px;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
		padding: 2px 4px 2px 0;
	}
	li.on {
		border-color: var(--accent);
		background: var(--accent-soft);
	}
	li.empty {
		display: block;
		border: 1px dashed var(--border);
		padding: 12px;
		font-size: 13px;
		text-align: center;
	}
	.item {
		display: flex;
		gap: 8px;
		align-items: center;
		text-align: left;
		border: 0;
		background: transparent;
		padding: 8px;
		cursor: pointer;
		min-width: 0;
	}
	.item .ico {
		font-size: 16px;
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
	.tools {
		display: flex;
		gap: 1px;
	}
	.mini {
		width: 22px;
		height: 22px;
		border: 0;
		background: transparent;
		color: var(--muted);
		cursor: pointer;
		border-radius: 6px;
		font-size: 12px;
	}
	.mini:hover:not(:disabled) {
		background: var(--surface-2);
		color: var(--text);
	}
	.mini.danger:hover {
		color: var(--bad);
	}
	.mini:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}
	.add {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
</style>
