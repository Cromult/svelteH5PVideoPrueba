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

// ---------------------------------------------------------------------------
// Curso multi-lección: un curso contiene elementos ordenados (videos, páginas de
// contenido, cuestionarios sin video y recursos descargables).
// ---------------------------------------------------------------------------

export type LessonKind = 'video' | 'content' | 'quiz' | 'resource';

interface LessonBase {
	id: string;
	title: string;
}

export interface VideoLesson extends LessonBase {
	kind: 'video';
	/** Clave del blob del video en IndexedDB. */
	videoKey: string;
	videoName: string;
	duration: number;
	interactions: Interaction[];
}

export interface ContentLesson extends LessonBase {
	kind: 'content';
	/** Texto de la página (se respetan los saltos de línea). */
	body: string;
	imageKey?: string;
	imageName?: string;
}

export interface QuizLesson extends LessonBase {
	kind: 'quiz';
	interactions: Interaction[];
	/** Umbral de acierto (0..1) para aprobar el cuestionario. */
	threshold: number;
}

export interface ResourceLesson extends LessonBase {
	kind: 'resource';
	description: string;
	/** Enlace externo. */
	url?: string;
	/** Archivo adjunto en IndexedDB. */
	fileKey?: string;
	fileName?: string;
}

export type Lesson = VideoLesson | ContentLesson | QuizLesson | ResourceLesson;

export interface Course {
	id: string;
	title: string;
	/** Paleta de marca del curso. Ausente en JSON antiguos = 'default'. */
	brand?: BrandId;
	/** Modo de color. Ausente en JSON antiguos = 'auto'. */
	mode?: ThemeMode;
	status: 'draft' | 'published';
	updatedAt: string;
	/** true = hay que aprobar un elemento para desbloquear el siguiente. */
	sequential: boolean;
	/** Umbral de dominio por defecto (0..1) para videos y cuestionarios. */
	threshold: number;
	lessons: Lesson[];
}

/** Interacciones de una lección (solo videos y cuestionarios las tienen). */
export function lessonInteractions(lesson: Lesson): Interaction[] {
	return lesson.kind === 'video' || lesson.kind === 'quiz' ? lesson.interactions : [];
}

export const LESSON_LABELS: Record<LessonKind, string> = {
	video: 'Video',
	content: 'Contenido',
	quiz: 'Cuestionario',
	resource: 'Recurso'
};

export const LESSON_ICONS: Record<LessonKind, string> = {
	video: '🎬',
	content: '📄',
	quiz: '📝',
	resource: '📎'
};

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
