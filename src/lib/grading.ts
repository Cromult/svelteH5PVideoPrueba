// Calificación pura (sin DOM ni Svelte): en el LMS real la misma función corre en NestJS
// para que la nota no dependa del navegador del estudiante.
import type { GradeResult, Interaction, Response } from './types.ts';

const round2 = (n: number) => Math.round(n * 100) / 100;

export function normalizeAnswer(text: string, caseSensitive: boolean): string {
	const trimmed = text.trim().replace(/\s+/g, ' ');
	return caseSensitive ? trimmed : trimmed.toLocaleLowerCase('es');
}

export function grade(interaction: Interaction, response: Response): GradeResult {
	const max = interaction.points;
	if (response.type !== interaction.type) return { score: 0, max, correct: false };

	switch (interaction.type) {
		case 'multiple-choice': {
			const { selected } = response as Extract<Response, { type: 'multiple-choice' }>;
			const correctIds = interaction.options.filter((o) => o.correct).map((o) => o.id);
			if (!interaction.multiple) {
				const ok = selected.length === 1 && correctIds.includes(selected[0]);
				return { score: ok ? max : 0, max, correct: ok };
			}
			// Varias correctas: +1 por acierto, -1 por marca incorrecta, mínimo 0.
			const hits = selected.filter((id) => correctIds.includes(id)).length;
			const misses = selected.length - hits;
			const ratio = correctIds.length ? Math.max(0, hits - misses) / correctIds.length : 0;
			return { score: round2(ratio * max), max, correct: ratio === 1 };
		}
		case 'true-false': {
			const { value } = response as Extract<Response, { type: 'true-false' }>;
			const ok = value === interaction.answer;
			return { score: ok ? max : 0, max, correct: ok };
		}
		case 'short-answer': {
			const { text } = response as Extract<Response, { type: 'short-answer' }>;
			const given = normalizeAnswer(text, interaction.caseSensitive);
			const ok =
				given.length > 0 &&
				interaction.accepted.some((a) => normalizeAnswer(a, interaction.caseSensitive) === given);
			return { score: ok ? max : 0, max, correct: ok };
		}
		case 'matching': {
			const { links } = response as Extract<Response, { type: 'matching' }>;
			const total = interaction.pairs.length;
			const hits = interaction.pairs.filter((p) => links[p.id] === p.id).length;
			const ratio = total ? hits / total : 0;
			return { score: round2(ratio * max), max, correct: ratio === 1 };
		}
	}
}

/** Errores de validación del editor; lista vacía = la pregunta está lista. */
export function validate(i: Interaction): string[] {
	const errors: string[] = [];
	if (!i.question.trim()) errors.push('Falta el enunciado.');
	if (!(i.points > 0)) errors.push('Los puntos deben ser mayores que 0.');
	switch (i.type) {
		case 'multiple-choice': {
			const filled = i.options.filter((o) => o.text.trim());
			if (filled.length < 2) errors.push('Agrega al menos 2 opciones con texto.');
			const correct = i.options.filter((o) => o.correct && o.text.trim()).length;
			if (correct === 0) errors.push('Marca al menos una opción correcta.');
			if (!i.multiple && correct > 1) errors.push('Respuesta única: solo una opción puede ser correcta.');
			break;
		}
		case 'short-answer':
			if (!i.accepted.some((a) => a.trim())) errors.push('Agrega al menos una respuesta aceptada.');
			break;
		case 'matching':
			if (i.pairs.filter((p) => p.left.trim() && p.right.trim()).length < 2)
				errors.push('Agrega al menos 2 pares completos.');
			break;
	}
	return errors;
}
