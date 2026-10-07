<script lang="ts">
	import type { MultipleChoice } from '#lib/types.ts';

	interface Props {
		interaction: MultipleChoice;
		selected: string[];
		revealed: boolean;
	}
	let { interaction, selected = $bindable(), revealed }: Props = $props();

	function toggle(id: string) {
		if (revealed) return;
		if (interaction.multiple) {
			selected = selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id];
		} else {
			selected = [id];
		}
	}
</script>

{#if interaction.multiple}
	<p class="hint">Puedes marcar varias opciones.</p>
{/if}
<ul role={interaction.multiple ? 'group' : 'radiogroup'}>
	{#each interaction.options.filter((o) => o.text.trim()) as option, idx (option.id)}
		{@const isSel = selected.includes(option.id)}
		<li>
			<button
				class="opt"
				class:sel={isSel}
				class:ok={revealed && option.correct}
				class:bad={revealed && isSel && !option.correct}
				disabled={revealed}
				onclick={() => toggle(option.id)}
				role={interaction.multiple ? 'checkbox' : 'radio'}
				aria-checked={isSel}
			>
				<span class="mark" class:round={!interaction.multiple}>
					{#if revealed && option.correct}✓{:else if revealed && isSel}✗{:else if isSel}{interaction.multiple ? '✓' : '●'}{/if}
				</span>
				<span class="letter">{String.fromCharCode(65 + idx)}</span>
				<span class="text">{option.text}</span>
			</button>
		</li>
	{/each}
</ul>

<style>
	.hint {
		margin: -4px 0 10px;
		font-size: 13px;
		color: var(--muted);
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 8px;
	}
	.opt {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 12px;
		text-align: left;
		padding: 12px 14px;
		border-radius: var(--radius);
		border: 2px solid var(--border);
		background: var(--surface);
		cursor: pointer;
		font-size: 15px;
		transition: border-color 0.15s, background 0.15s;
	}
	.opt:hover:not(:disabled) {
		border-color: var(--accent);
	}
	.opt:disabled {
		cursor: default;
	}
	.opt.sel {
		border-color: var(--accent);
		background: var(--accent-soft);
	}
	.opt.ok {
		border-color: var(--ok);
		background: var(--ok-soft);
	}
	.opt.bad {
		border-color: var(--bad);
		background: var(--bad-soft);
	}
	.mark {
		flex: none;
		width: 22px;
		height: 22px;
		border-radius: 6px;
		border: 2px solid var(--border);
		display: grid;
		place-items: center;
		font-size: 12px;
		font-weight: 700;
		color: var(--accent);
	}
	.mark.round {
		border-radius: 50%;
	}
	.sel .mark {
		border-color: var(--accent);
	}
	.ok .mark {
		border-color: var(--ok);
		color: var(--ok);
	}
	.bad .mark {
		border-color: var(--bad);
		color: var(--bad);
	}
	.letter {
		font-weight: 700;
		color: var(--muted);
		font-size: 13px;
	}
	.text {
		flex: 1;
	}
</style>
