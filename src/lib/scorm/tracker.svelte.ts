// Controlador de la sesión SCORM: puentea los eventos del video y las respuestas
// del estudiante con la API CMI (cmi.core.*, cmi.interactions, cmi.suspend_data).
import { SvelteSet } from 'svelte/reactivity';
import type { GradeResult, Interaction, Response } from '#lib/types.ts';
import {
	ScormApi,
	clearSession,
	emptySession,
	exposeApi,
	formatScormTime,
	loadSession,
	saveSession,
	type LessonStatus,
	type ScormSessionData
} from './api.ts';

/** Datos que guardamos en cmi.suspend_data (patrón habitual en contenido SCORM). */
interface SuspendPayload {
	results: Record<string, GradeResult>;
	responses: Record<string, Response>;
	skipped: Record<string, true>;
	attempts: Record<string, number>;
	watched: number[];
	playSeconds: number;
	started: boolean;
	threshold: number;
}

const SCORM_TYPE: Record<string, string> = {
	'multiple-choice': 'choice',
	'true-false': 'true-false',
	'short-answer': 'fill-in',
	matching: 'matching'
};

/** Cobertura exigida del video para considerar la lección completada. */
export const COMPLETION_COVERAGE = 0.9;

export class ScormTracker {
	courseId = $state('');
	learnerId = $state('alumno-demo');
	learnerName = $state('Alumno Demo');
	ready = $state(false);
	started = $state(false);
	duration = $state(0);

	lessonStatus = $state<LessonStatus>('not attempted');
	scoreRaw = $state(0);
	scoreMax = $state(0);
	scoreMin = $state(0);
	location = $state(0);
	sessionTime = $state(0);
	totalTime = $state(0);
	exit = $state('');
	entry = $state<'ab-initio' | 'resume'>('ab-initio');
	threshold = $state(0.7);

	results = $state<Record<string, GradeResult>>({});
	responses = $state<Record<string, Response>>({});
	skipped = $state<Record<string, true>>({});
	attempts = $state<Record<string, number>>({});
	playSeconds = $state(0);
	watched = new SvelteSet<number>();

	private api: ScormApi | null = null;
	private removeApi: (() => void) | null = null;
	private lastCommit = 0;
	private finished = false;

	get coverage(): number {
		return this.duration > 0 ? Math.min(1, this.watched.size / this.duration) : 0;
	}
	get watchedSeconds(): number {
		return this.watched.size;
	}
	get scorePercent(): number {
		return this.scoreMax > 0 ? this.scoreRaw / this.scoreMax : 0;
	}
	get sessionTimeLabel(): string {
		return formatScormTime(this.sessionTime);
	}
	/** Instantánea del objeto CMI actual (para el inspector SCORM). */
	get cmi(): ScormSessionData | null {
		return this.api?.session ?? null;
	}

	/** Inicia la sesión: crea/reanuda el objeto CMI y publica `window.API`. */
	start(courseId: string, learnerId: string, learnerName: string, scoreMax: number, duration: number): void {
		this.courseId = courseId;
		this.learnerId = learnerId || 'alumno-demo';
		this.learnerName = learnerName || 'Alumno Demo';
		this.scoreMax = scoreMax;
		this.duration = duration;

		const data = loadSession(courseId, this.learnerId) ?? emptySession(courseId, this.learnerId, this.learnerName);
		data.learnerName = this.learnerName;
		if (data.scoreMax !== scoreMax) data.scoreMax = scoreMax;
		data.scoreMin = 0;

		this.api = new ScormApi(data);
		this.removeApi?.();
		this.removeApi = exposeApi(this.api);
		this.api.LMSInitialize('');

		this.readFromCmi();
		this.restoreSuspend(data.suspendData);
		this.setScoreMax(scoreMax);
		if (!this.started && this.lessonStatus !== 'not attempted') this.lessonStatus = 'incomplete';
		this.ready = true;
		this.finished = false;
	}

	private readFromCmi(): void {
		if (!this.api) return;
		this.lessonStatus = this.api.LMSGetValue('cmi.core.lesson_status') as LessonStatus;
		this.scoreRaw = Number(this.api.LMSGetValue('cmi.core.score.raw')) || 0;
		this.scoreMax = Number(this.api.LMSGetValue('cmi.core.score.max')) || 0;
		this.scoreMin = Number(this.api.LMSGetValue('cmi.core.score.min')) || 0;
		this.location = Number(this.api.LMSGetValue('cmi.core.lesson_location')) || 0;
		this.totalTime = this.api.session.totalTime;
		this.entry = this.api.LMSGetValue('cmi.core.entry') === 'resume' ? 'resume' : 'ab-initio';
	}

	private restoreSuspend(raw: string): void {
		try {
			const p = JSON.parse(raw) as Partial<SuspendPayload>;
			this.results = p.results ?? {};
			this.responses = p.responses ?? {};
			this.skipped = p.skipped ?? {};
			this.attempts = p.attempts ?? {};
			this.playSeconds = p.playSeconds ?? 0;
			this.started = p.started ?? false;
			this.threshold = p.threshold ?? 0.7;
			this.watched.clear();
			for (const s of p.watched ?? []) this.watched.add(s);
		} catch {
			/* sin estado previo */
		}
	}

	private saveSuspend(): void {
		if (!this.api) return;
		const payload: SuspendPayload = {
			results: this.results,
			responses: this.responses,
			skipped: this.skipped,
			attempts: this.attempts,
			watched: Array.from(this.watched),
			playSeconds: this.playSeconds,
			started: this.started,
			threshold: this.threshold
		};
		this.api.LMSSetValue('cmi.suspend_data', JSON.stringify(payload));
	}

	setScoreMax(max: number): void {
		this.scoreMax = max;
		this.api?.LMSSetValue('cmi.core.score.max', String(max));
		this.api?.LMSSetValue('cmi.core.score.min', '0');
	}

	/** Registra el avance natural del video (sin saltos) como tiempo visto. */
	tick(prev: number, now: number): void {
		if (!this.ready) return;
		if (this.lessonStatus === 'not attempted') this.setStatus('incomplete');
		const delta = now - prev;
		if (delta > 0 && delta < 0.6) {
			const from = Math.floor(prev);
			const to = Math.floor(now);
			for (let s = from; s <= to; s++) this.watched.add(s);
			this.playSeconds += delta;
			this.sessionTime += delta;
			this.started = true;
		}
		this.location = now;
		const nowMs = Date.now();
		if (nowMs - this.lastCommit > 5000) {
			this.lastCommit = nowMs;
			this.commit();
		}
	}

	setLocation(seconds: number): void {
		this.location = seconds;
		this.api?.LMSSetValue('cmi.core.lesson_location', String(Math.round(seconds)));
		this.saveSuspend();
		this.api?.LMSCommit('');
	}

	setStatus(status: LessonStatus): void {
		this.lessonStatus = status;
		this.api?.LMSSetValue('cmi.core.lesson_status', status);
	}

	/** Persiste el CMI (cmi.core.*, cmi.interactions, cmi.suspend_data). */
	commit(): void {
		this.api?.LMSCommit('');
	}

	/** Guarda la respuesta calificada y la registra como interacción CMI. */
	recordAnswer(interaction: Interaction, response: Response, result: GradeResult): void {
		const id = interaction.id;
		this.results[id] = result;
		this.responses[id] = response;
		this.attempts[id] = (this.attempts[id] ?? 0) + 1;
		this.saveSuspend();
		this.syncScore();

		if (this.api) {
			const idx = this.api.session.interactions.length;
			this.api.LMSSetValue(`cmi.interactions.${idx}.id`, id);
			this.api.LMSSetValue(`cmi.interactions.${idx}.type`, SCORM_TYPE[interaction.type] ?? 'other');
			this.api.LMSSetValue(`cmi.interactions.${idx}.student_response`, JSON.stringify(response));
			this.api.LMSSetValue(`cmi.interactions.${idx}.result`, result.correct ? 'correct' : 'wrong');
			this.api.LMSSetValue(`cmi.interactions.${idx}.weighting`, String(interaction.points));
			this.api.LMSSetValue(`cmi.interactions.${idx}.latency`, formatScormTime(0));
		}
	}

	markSkipped(id: string): void {
		this.skipped[id] = true;
		this.saveSuspend();
	}

	retryClear(id: string): void {
		delete this.results[id];
		delete this.responses[id];
		this.syncScore();
		this.saveSuspend();
	}

	/** Recalcula puntaje y estado (passed/failed/incomplete) según aciertos y cobertura. */
	evaluate(interactions: Interaction[]): LessonStatus {
		this.syncScore();
		// Sin preguntas, el dominio depende solo de completar el video.
		const scorePercent = this.scoreMax > 0 ? this.scoreRaw / this.scoreMax : 1;
		const done = interactions.every((i) =>
			i.required ? !!this.results[i.id]?.correct : !!this.results[i.id] || !!this.skipped[i.id]
		);
		let status: LessonStatus;
		if (!this.started && Object.keys(this.results).length === 0) status = 'not attempted';
		else if (!done || this.coverage < COMPLETION_COVERAGE) status = 'incomplete';
		else if (scorePercent >= this.threshold) status = 'passed';
		else status = 'failed';
		this.setStatus(status);
		this.saveSuspend();
		this.api?.LMSCommit('');
		return status;
	}

	private syncScore(): void {
		this.scoreRaw = Math.round(Object.values(this.results).reduce((sum, r) => sum + r.score, 0) * 100) / 100;
		this.api?.LMSSetValue('cmi.core.score.raw', String(this.scoreRaw));
	}

	/** Cierra la sesión y acumula el tiempo total. */
	finish(exit = 'suspend'): void {
		if (!this.api || this.finished) return;
		this.finished = true;
		this.totalTime += this.sessionTime;
		this.api.LMSSetValue('cmi.core.session_time', formatScormTime(this.sessionTime));
		this.api.LMSSetValue('cmi.core.total_time', formatScormTime(this.totalTime));
		this.api.LMSSetValue('cmi.core.exit', exit);
		this.saveSuspend();
		this.api.LMSCommit('');
		this.api.LMSFinish('');
	}

	/** Deja todo listo para reanudar (mantiene datos, cierra la sesión actual). */
	suspend(): void {
		this.finish('suspend');
	}

	/** Borra por completo la sesión del alumno. */
	reset(courseId: string, learnerId: string, learnerName: string, scoreMax: number, duration: number): void {
		this.api?.LMSFinish('');
		clearSession(courseId, learnerId);
		this.api = null;
		this.entry = 'ab-initio';
		this.started = false;
		this.finished = false;
		this.lessonStatus = 'not attempted';
		this.scoreRaw = 0;
		this.sessionTime = 0;
		this.totalTime = 0;
		this.location = 0;
		this.results = {};
		this.responses = {};
		this.skipped = {};
		this.attempts = {};
		this.playSeconds = 0;
		this.watched.clear();
		this.start(courseId, learnerId, learnerName, scoreMax, duration);
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

export function saveSnapshot(data: ScormSessionData): void {
	saveSession(data);
}
