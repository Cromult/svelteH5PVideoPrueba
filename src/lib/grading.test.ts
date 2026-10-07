import { describe, expect, it } from 'vitest';
import { grade, validate } from './grading.ts';
import type { Matching, MultipleChoice, ShortAnswer, TrueFalse } from './types.ts';

const base = { id: 'q', time: 5, required: true, points: 10, question: '¿?', onFailSeekTo: null };

const mcSingle: MultipleChoice = {
	...base,
	type: 'multiple-choice',
	multiple: false,
	options: [
		{ id: 'a', text: 'A', correct: true },
		{ id: 'b', text: 'B', correct: false }
	]
};

const mcMulti: MultipleChoice = {
	...mcSingle,
	multiple: true,
	options: [
		{ id: 'a', text: 'A', correct: true },
		{ id: 'b', text: 'B', correct: true },
		{ id: 'c', text: 'C', correct: false }
	]
};

describe('opción múltiple', () => {
	it('respuesta única', () => {
		expect(grade(mcSingle, { type: 'multiple-choice', selected: ['a'] })).toEqual({ score: 10, max: 10, correct: true });
		expect(grade(mcSingle, { type: 'multiple-choice', selected: ['b'] }).score).toBe(0);
	});
	it('varias correctas con puntaje parcial y penalización', () => {
		expect(grade(mcMulti, { type: 'multiple-choice', selected: ['a', 'b'] }).correct).toBe(true);
		expect(grade(mcMulti, { type: 'multiple-choice', selected: ['a'] }).score).toBe(5);
		expect(grade(mcMulti, { type: 'multiple-choice', selected: ['a', 'c'] }).score).toBe(0);
		expect(grade(mcMulti, { type: 'multiple-choice', selected: ['a', 'b', 'c'] }).score).toBe(5);
	});
});

describe('verdadero / falso', () => {
	const tf: TrueFalse = { ...base, type: 'true-false', answer: false };
	it('califica', () => {
		expect(grade(tf, { type: 'true-false', value: false }).correct).toBe(true);
		expect(grade(tf, { type: 'true-false', value: true }).correct).toBe(false);
		expect(grade(tf, { type: 'true-false', value: null }).correct).toBe(false);
	});
});

describe('respuesta corta', () => {
	const sa: ShortAnswer = { ...base, type: 'short-answer', accepted: ['Fotosíntesis', 'la fotosíntesis'], caseSensitive: false };
	it('ignora mayúsculas y espacios extra', () => {
		expect(grade(sa, { type: 'short-answer', text: '  FOTOSÍNTESIS ' }).correct).toBe(true);
		expect(grade(sa, { type: 'short-answer', text: 'la   fotosíntesis' }).correct).toBe(true);
		expect(grade(sa, { type: 'short-answer', text: 'respiración' }).correct).toBe(false);
		expect(grade(sa, { type: 'short-answer', text: '' }).correct).toBe(false);
	});
	it('respeta mayúsculas si se pide', () => {
		const strict = { ...sa, caseSensitive: true };
		expect(grade(strict, { type: 'short-answer', text: 'fotosíntesis' }).correct).toBe(false);
		expect(grade(strict, { type: 'short-answer', text: 'Fotosíntesis' }).correct).toBe(true);
	});
});

describe('unir', () => {
	const m: Matching = {
		...base,
		type: 'matching',
		pairs: [
			{ id: 'p1', left: 'Perú', right: 'Lima' },
			{ id: 'p2', left: 'Chile', right: 'Santiago' },
			{ id: 'p3', left: 'Bolivia', right: 'Sucre' },
			{ id: 'p4', left: 'Ecuador', right: 'Quito' }
		]
	};
	it('puntaje parcial por par', () => {
		expect(grade(m, { type: 'matching', links: { p1: 'p1', p2: 'p2', p3: 'p3', p4: 'p4' } }).correct).toBe(true);
		expect(grade(m, { type: 'matching', links: { p1: 'p1', p2: 'p3', p3: 'p2' } }).score).toBe(2.5);
		expect(grade(m, { type: 'matching', links: {} }).score).toBe(0);
	});
});

describe('validate', () => {
	it('detecta preguntas incompletas', () => {
		expect(validate(mcSingle)).toEqual([]);
		expect(validate({ ...mcSingle, options: mcSingle.options.map((o) => ({ ...o, correct: false })) })).toContain(
			'Marca al menos una opción correcta.'
		);
		expect(validate({ ...mcSingle, question: ' ' })).toContain('Falta el enunciado.');
	});
});
