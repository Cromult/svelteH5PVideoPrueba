// Controlador de la sesión SCORM a nivel de curso: puentea el avance del video,
// las respuestas y los elementos no-video con la API CMI (cmi.core.*,
// cmi.interactions y cmi.suspend_data). El progreso de cada elemento se guarda
// en cmi.suspend_data (patrón habitual en contenido SCORM).
import { SvelteSet } from 'svelte/reactivity';
import { lessonInteractions, type Course, type GradeResult, type Interaction, type Lesson, type Response } from '#lib/types.ts';
import {
	ScormApi,
	clearSession,
	emptySession,
	exposeApi,
	formatScormTime,
	loadSession,
	type LessonStatus,
	type ScormSessionData
} from './api.ts';

/** Cobertura exigida del video para considerar la lección completada. */
export const COMPLETION_COVERAGE = 0.9;

export interface LessonProgress {
	results: Record<string, GradeResult>;
	skipped: Record<string, true>;
	attempts: Record<string, number>;
	viewDone: boolean;
	watched: number[];
	playSeconds: number;
	location: number;
}

interface SuspendPayload {
	progress: Record<string, LessonProgress>;
	threshold: number;
	started: boolean;
	playSeconds: number;
}

const SCORM_TYPE: Record<string, string> = {
	'multiple-choice': 'choice',
	'true-false': 'true-false',
	'short-answer': 'fill-in',
	matching: 'matching'
};

function emptyProgress(): LessonProgress {
	return { results: {}, skipped: {}, attempts: {}, viewDone: false, watched: [], playSeconds: 0, location: 0 };
}

export class ScormTracker {
	courseId = $state('');
	learnerId = $state('alumno-demo');
	learnerName = $state('Alumno Demo');
	ready = $state(false);
	entry = $state<'ab-initio' | 'resume'>('ab-initio');

	lessonStatus = $state<LessonStatus>('not attempted');
	scoreRaw = $state(0);
	scoreMax = $state(0);
	sessionTime = $state(0);
	totalTime = $state(0);
	exit = $state('');
	playSeconds = $state(0);
	/** Progreso por elemento (id de lección → estado). */
	progress = $state<Record<string, LessonProgress>>({});

	activeLessonId = $state<string | null>(null);
	private watched = new SvelteSet<number>();

	private api: ScormApi | null = null;
	private removeApi: (() => void) | null = null;
	private lastCommit = 0;
	private finished = false;

	get cmi(): ScormSessionData | null {
		return this.api?.session ?? null;
	}
	get sessionTimeLabel(): string {
		return formatScormTime(this.sessionTime);
	}

	start(courseId: string, learnerId: string, learnerName: string, course: Course): void {
		this.courseId = courseId;
		this.learnerId = learnerId || 'alumno-demo';
		this.learnerName = learnerName || 'Alumno Demo';

		const data = loadSession(courseId, this.learnerId) ?? emptySession(courseId, this.learnerId, this.learnerName);
		data.learnerName = this.learnerName;
		this.api = new ScormApi(data);
		this.removeApi?.();
		this.removeApi = exposeApi(this.api);
		this.api.LMSInitialize('');

		this.lessonStatus = this.api.LMSGetValue('cmi.core.lesson_status') as LessonStatus;
		this.scoreRaw = Number(this.api.LMSGetValue('cmi.core.score.raw')) || 0;
		this.totalTime = data.totalTime;
		this.entry = this.api.LMSGetValue('cmi.core.entry') === 'resume' ? 'resume' : 'ab-initio';
		this.restore(data.suspendData);
		this.scoreMax = course.lessons.reduce(
			(sum, l) => sum + lessonInteractions(l).reduce((s, i) => s + i.points, 0),
			0
		);
		this.api.LMSSetValue('cmi.core.score.min', '0');
		this.api.LMSSetValue('cmi.core.score.max', String(this.scoreMax));
		this.ready = true;
		this.finished = false;
	}

	private restore(raw: string): void {
		try {
			const p = JSON.parse(raw) as Partial<SuspendPayload>;
			this.progress = p.progress ?? {};
			this.playSeconds = p.playSeconds ?? 0;
		} catch {
			this.progress = {};
		}
	}

	/** Cambia de elemento: vuelca el tiempo visto y carga el del nuevo. */
	enterLesson(lesson: Lesson): void {
		this.flushWatched();
		this.activeLessonId = lesson.id;
		if (!this.progress[lesson.id]) this.progress[lesson.id] = emptyProgress();
		this.watched.clear();
		for (const s of this.progress[lesson.id].watched ?? []) this.watched.add(s);
		if (lesson.kind === 'video') {
			this.api?.LMSSetValue('cmi.core.lesson_location', String(this.progress[lesson.id].location || 0));
		}
	}

	private flushWatched(): void {
		const id = this.activeLessonId;
		if (!id) return;
		const p = this.progress[id];
		if (!p) return;
		p.watched = Array.from(this.watched);
	}

	/** Avance natural del video (sin saltos) como tiempo visto. */
	tick(prev: number, now: number): void {
		if (!this.ready || !this.activeLessonId) return;
		if (this.lessonStatus === 'not attempted') this.setStatus('incomplete');
		const delta = now - prev;
		if (delta > 0 && delta < 0.6) {
			for (let s = Math.floor(prev); s <= Math.floor(now); s++) this.watched.add(s);
			this.sessionTime += delta;
			this.playSeconds += delta;
			const p = this.progress[this.activeLessonId];
			if (p) {
				p.playSeconds += delta;
				p.location = now;
			}
		}
		const nowMs = Date.now();
		if (nowMs - this.lastCommit > 5000) {
			this.lastCommit = nowMs;
			this.commit();
		}
	}

	get watchedCount(): number {
		return this.watched.size;
	}

	watchedFor(lessonId: string): number {
		if (lessonId === this.activeLessonId) return this.watched.size;
		return this.progress[lessonId]?.watched?.length ?? 0;
	}

	setLocation(seconds: number): void {
		if (!this.activeLessonId) return;
		const p = this.progress[this.activeLessonId];
		if (p) p.location = seconds;
		this.api?.LMSSetValue('cmi.core.lesson_location', String(Math.round(seconds)));
		this.commit();
	}

	setStatus(status: LessonStatus): void {
		this.lessonStatus = status;
		this.api?.LMSSetValue('cmi.core.lesson_status', status);
	}

	recordAnswer(interaction: Interaction, response: Response, result: GradeResult): void {
		if (!this.activeLessonId) return;
		const p = (this.progress[this.activeLessonId] ??= emptyProgress());
		p.results[interaction.id] = result;
		p.attempts[interaction.id] = (p.attempts[interaction.id] ?? 0) + 1;
		this.syncScore();

		if (this.api) {
			const idx = this.api.session.interactions.length;
			this.api.LMSSetValue(`cmi.interactions.${idx}.id`, interaction.id);
			this.api.LMSSetValue(`cmi.interactions.${idx}.type`, SCORM_TYPE[interaction.type] ?? 'other');
			this.api.LMSSetValue(`cmi.interactions.${idx}.student_response`, JSON.stringify(response));
			this.api.LMSSetValue(`cmi.interactions.${idx}.result`, result.correct ? 'correct' : 'wrong');
			this.api.LMSSetValue(`cmi.interactions.${idx}.weighting`, String(interaction.points));
		}
		this.saveSuspend();
	}

	markSkipped(lessonId: string, interactionId: string): void {
		const p = (this.progress[lessonId] ??= emptyProgress());
		p.skipped[interactionId] = true;
		this.saveSuspend();
	}

	retryClear(lessonId: string, interactionId: string): void {
		const p = this.progress[lessonId];
		if (!p) return;
		delete p.results[interactionId];
		this.syncScore();
		this.saveSuspend();
	}

	markViewed(lessonId: string): void {
		const p = (this.progress[lessonId] ??= emptyProgress());
		p.viewDone = true;
		this.saveSuspend();
	}

	/** Recalcula puntaje y estado del curso. */
	evaluate(course: Course): LessonStatus {
		this.flushWatched();
		this.syncScore();
		const allDone = course.lessons.every((l) => this.lessonPassed(l, course.threshold ?? 0.6));
		const scorePercent = this.scoreMax > 0 ? this.scoreRaw / this.scoreMax : 1;
		let status: LessonStatus;
		if (!this.progressStarted()) status = 'not attempted';
		else if (!allDone) status = 'incomplete';
		else if (scorePercent >= (course.threshold ?? 0.6)) status = 'passed';
		else status = 'failed';
		this.setStatus(status);
		this.saveSuspend();
		this.api?.LMSCommit('');
		return status;
	}

	private progressStarted(): boolean {
		return this.activeLessonId !== null || Object.keys(this.progress).length > 0;
	}

	lessonPassed(lesson: Lesson, courseThreshold = 0.6): boolean {
		if (lesson.kind === 'content' || lesson.kind === 'resource') return !!this.progress[lesson.id]?.viewDone;
		const ints = lessonInteractions(lesson);
		const p = this.progress[lesson.id];
		if (!ints.length) return lesson.kind === 'quiz' ? true : !!p?.viewDone;
		if (!p) return false;
		const max = ints.reduce((s, i) => s + i.points, 0);
		const score = Math.round(ints.reduce((s, i) => s + (p.results[i.id]?.score ?? 0), 0) * 100) / 100;
		const percent = max ? score / max : 1;
		const threshold = lesson.kind === 'quiz' ? lesson.threshold : courseThreshold;
		return percent >= threshold;
	}

	private syncScore(): void {
		let score = 0;
		for (const p of Object.values(this.progress)) {
			for (const r of Object.values(p.results)) score += r.score;
		}
		this.scoreRaw = Math.round(score * 100) / 100;
		this.api?.LMSSetValue('cmi.core.score.raw', String(this.scoreRaw));
	}

	private saveSuspend(): void {
		if (!this.api) return;
		const payload: SuspendPayload = {
			progress: this.progress,
			threshold: 0.6,
			started: this.progressStarted(),
			playSeconds: this.playSeconds
		};
		this.api.LMSSetValue('cmi.suspend_data', JSON.stringify(payload));
	}

	commit(): void {
		this.saveSuspend();
		this.api?.LMSCommit('');
	}

	finish(exit = 'suspend'): void {
		if (!this.api || this.finished) return;
		this.finished = true;
		this.flushWatched();
		this.totalTime += this.sessionTime;
		this.api.LMSSetValue('cmi.core.session_time', formatScormTime(this.sessionTime));
		this.api.LMSSetValue('cmi.core.total_time', formatScormTime(this.totalTime));
		this.api.LMSSetValue('cmi.core.exit', exit);
		this.saveSuspend();
		this.api.LMSCommit('');
		this.api.LMSFinish('');
	}

	suspend(): void {
		this.finish('suspend');
	}

	reset(courseId: string, learnerId: string, learnerName: string, course: Course): void {
		this.api?.LMSFinish('');
		clearSession(courseId, learnerId);
		this.api = null;
		this.progress = {};
		this.watched.clear();
		this.playSeconds = 0;
		this.sessionTime = 0;
		this.totalTime = 0;
		this.finished = false;
		this.entry = 'ab-initio';
		this.start(courseId, learnerId, learnerName, course);
	}

	detach(): void {
		this.finish('suspend');
		this.removeApi?.();
		this.removeApi = null;
		this.ready = false;
	}
}

export function createTracker(): ScormTracker {
	return new ScormTracker();
}
