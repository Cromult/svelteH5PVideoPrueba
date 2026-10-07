<script lang="ts">
	import type { ShortAnswer } from '#lib/types.ts';

	interface Props {
		interaction: ShortAnswer;
		text: string;
		revealed: boolean;
		correct: boolean;
		onenter: () => void;
	}
	let { interaction, text = $bindable(), revealed, correct, onenter }: Props = $props();

	const focus = (el: HTMLInputElement) => {
		el.focus();
	};
</script>

<input
	class="input answer"
	class:ok={revealed && correct}
	class:bad={revealed && !correct}
	bind:value={text}
	disabled={revealed}
	placeholder="Escribe tu respuesta…"
	onkeydown={(e) => e.key === 'Enter' && onenter()}
	{@attach focus}
	aria-label="Tu respuesta"
/>
{#if revealed && !correct}
	<p class="expected">
		Respuesta esperada: <b>{interaction.accepted.filter((a) => a.trim()).join(' / ')}</b>
	</p>
{/if}

<style>
	.answer {
		font-size: 17px;
		padding: 12px 14px;
		border-width: 2px;
	}
	.answer.ok {
		border-color: var(--ok);
		background: var(--ok-soft);
	}
	.answer.bad {
		border-color: var(--bad);
		background: var(--bad-soft);
	}
	.expected {
		margin: 10px 0 0;
		font-size: 14px;
		color: var(--muted);
	}
</style>
