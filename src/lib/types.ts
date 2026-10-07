// Modelo de datos del video interactivo.
// Pensado para que, en el LMS real, sea el mismo DTO que guarda y devuelve NestJS.

export type InteractionType = 'multiple-choice' | 'true-false' | 'short-answer' | 'matching';

/** Paleta de marca del video (viaja en el JSON, la usa también la vista del estudiante). */
export type BrandId = 'default' | 'esam' | 'upi';

/** Modo de color de la interfaz: claro, oscuro o según el sistema. */
export type ThemeMode = 'light' | 'dark' | 'auto';

interface InteractionBase {
	id: string;
	type: InteractionType;
	/** Segundo del video en el que aparece la pregunta. */
	time: number;
	/** Si es obligatoria, el estudiante no puede adelantar el video más allá de ella. */
	required: boolean;
	points: number;
	question: string;
	feedbackCorrect?: string;
	feedbackIncorrect?: string;
	/** Si el estudiante falla, el video retrocede a este segundo (null = no retrocede). */
	onFailSeekTo: number | null;
}

export interface ChoiceOption {
	id: string;
	text: string;
	correct: boolean;
}

export interface MultipleChoice extends InteractionBase {
	type: 'multiple-choice';
	options: ChoiceOption[];
	/** true = casillas (varias correctas); false = radio (una correcta). */
	multiple: boolean;
}

export interface TrueFalse extends InteractionBase {
	type: 'true-false';
	answer: boolean;
}

export interface ShortAnswer extends InteractionBase {
	type: 'short-answer';
	accepted: string[];
	caseSensitive: boolean;
}

export interface MatchingPair {
	id: string;
	left: string;
	right: string;
}

export interface Matching extends InteractionBase {
	type: 'matching';
	pairs: MatchingPair[];
}

export type Interaction = MultipleChoice | TrueFalse | ShortAnswer | Matching;

export interface InteractiveVideo {
	id: string;
	title: string;
	/** Paleta de marca del proyecto. Ausente en JSON antiguos = 'default'. */
	brand?: BrandId;
	/** Modo de color. Ausente en JSON antiguos = 'auto'. */
	mode?: ThemeMode;
	/** Clave del blob del video en IndexedDB (en el LMS real: id del archivo en el storage). */
	videoKey: string;
	videoName: string;
	duration: number;
	status: 'draft' | 'published';
	updatedAt: string;
	interactions: Interaction[];
}

// Respuestas del estudiante, una forma por tipo.
export type Response =
	| { type: 'multiple-choice'; selected: string[] }
	| { type: 'true-false'; value: boolean | null }
	| { type: 'short-answer'; text: string }
	/** leftId -> id del par cuyo texto derecho eligió el estudiante. */
	| { type: 'matching'; links: Record<string, string> };

export interface GradeResult {
	score: number;
	max: number;
	correct: boolean;
}

export const TYPE_LABELS: Record<InteractionType, string> = {
	'multiple-choice': 'Opción múltiple',
	'true-false': 'Verdadero / Falso',
	'short-answer': 'Respuesta corta',
	matching: 'Unir con flechas'
};

export const TYPE_ICONS: Record<InteractionType, string> = {
	'multiple-choice': '☰',
	'true-false': '✓✗',
	'short-answer': 'Aa',
	matching: '⇄'
};
