/**
 * The interactive tutorial: short lessons in a coach card (an idea, some
 * cards to look at, one question with instant feedback) and the spotlight
 * tour of the app, whose steps set up live examples through `demo`.
 */
import { SpotlightTour } from './spotlight';
import { LESSONS, TOUR, WELCOME, loadProgress, progressSummary, saveProgress, type GameTab, type Lesson, type Progress, type TourDemo } from './lessons';
import { cardFace } from '../ui/cards';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...kids: (Node | string)[]) => {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids);
  return e;
};

export interface TutorialHooks {
  onFinish(): void;
  /** Show a tab before a lesson or tour step about it. */
  showTab(tab: GameTab): void;
  /** The tour opened or closed: the app remembers and restores the tab the player was on. */
  tourOpen?: (open: boolean) => void;
  /** Set up a tour step's live example (null: put everything back). */
  demo(id: TourDemo | null): void;
}

export class Tutorial {
  progress: Progress;
  private coach: HTMLElement;
  private tour: SpotlightTour;
  private mode: 'off' | 'lesson' | 'tour' = 'off';

  constructor(private hooks: TutorialHooks, private store: Pick<Storage, 'getItem' | 'setItem'> = localStorage) {
    this.progress = loadProgress(store);
    this.coach = el('section', { id: 'coach', className: 'coach hidden' });
    this.coach.setAttribute('role', 'dialog');
    this.coach.setAttribute('aria-modal', 'false');
    this.coach.setAttribute('aria-labelledby', 'coach-title');
    document.body.append(this.coach);
    this.tour = new SpotlightTour(TOUR, {
      onStep: (id) => {
        const k = Math.max(0, TOUR.findIndex((t) => t.id === id));
        this.progress.tour = k; this.save();
        this.hooks.demo(null);
        if (TOUR[k].tab) this.hooks.showTab(TOUR[k].tab!);
        this.hooks.demo(TOUR[k].demo ?? null);
      },
      onClose: (finished) => {
        this.hooks.demo(null);
        this.hooks.tourOpen?.(false);
        if (finished) { this.progress.tourDone = true; this.progress.tour = 0; }
        this.save();
        this.mode = 'off';
      },
    });
  }

  private save() { saveProgress(this.store, this.progress); }
  get busy() { return this.mode !== 'off'; }
  summary() { return progressSummary(this.progress); }

  offer(slot: HTMLElement) {
    if (this.progress.offered) return;
    const done = () => { this.progress.offered = true; this.save(); slot.classList.add('hidden'); };
    const learn = el('button', { className: 'primary', textContent: WELCOME.learn });
    learn.onclick = () => { done(); this.startLessons(); };
    const tour = el('button', { textContent: WELCOME.tour });
    tour.onclick = () => { done(); this.startTour(); };
    const skip = el('button', { textContent: WELCOME.skip });
    skip.onclick = done;
    slot.replaceChildren(el('b', { id: 'offer-title' }, WELCOME.title), el('p', {}, WELCOME.body), el('div', { className: 'row' }, skip, tour, learn));
    slot.setAttribute('aria-labelledby', 'offer-title');
    slot.classList.remove('hidden');
    learn.focus();
  }

  startLessons(from = this.progress.lesson) {
    this.stopAll();
    this.mode = 'lesson';
    this.showLesson(Math.max(0, Math.min(from, LESSONS.length - 1)));
  }

  private markDone(l: Lesson) {
    if (!this.progress.lessonsDone.includes(l.id)) this.progress.lessonsDone.push(l.id);
    this.save();
  }

  private showLesson(i: number) {
    this.progress.lesson = i;
    this.save();
    const lesson = LESSONS[i];
    this.hooks.showTab(lesson.tab);
    const last = i + 1 === LESSONS.length;
    const feedback = el('p', { className: 'feedback' });
    feedback.setAttribute('aria-live', 'polite');
    const next = el('button', { className: 'primary', textContent: last ? 'Finish' : 'Next lesson', disabled: !this.progress.lessonsDone.includes(lesson.id) });
    next.onclick = () => (last ? this.finish() : this.showLesson(i + 1));
    const opts = el('div', { className: 'quiz-opts' });
    opts.setAttribute('aria-label', 'Answers');
    lesson.choices.forEach((c, k) => {
      const b = el('button', { textContent: c });
      b.onclick = () => {
        if (k === lesson.answer) {
          b.classList.add('right');
          feedback.className = 'feedback good'; feedback.textContent = `✓ ${lesson.explain}`;
          this.markDone(lesson); next.disabled = false; next.focus(); refreshDots();
        } else {
          b.classList.add('wrong');
          feedback.className = 'feedback bad'; feedback.textContent = `Not quite. ${lesson.hint}`;
        }
      };
      opts.append(b);
    });
    const back = el('button', { textContent: 'Back', disabled: i === 0 });
    back.onclick = () => this.showLesson(i - 1);
    const close = el('button', { className: 'icon', textContent: '✕' });
    close.setAttribute('aria-label', 'Close the lessons');
    close.onclick = () => this.stopAll();
    const dots = el('div', { className: 'dots' });
    const refreshDots = () => {
      dots.replaceChildren(...LESSONS.map((l, k) => {
        const d = el('button', { className: 'dot' + (k === i ? ' cur' : '') + (this.progress.lessonsDone.includes(l.id) ? ' done' : '') });
        d.setAttribute('aria-label', `Lesson ${k + 1}: ${l.title}${this.progress.lessonsDone.includes(l.id) ? ' (done)' : ''}`);
        d.onclick = () => this.showLesson(k);
        return d;
      }));
    };
    refreshDots();
    const title = el('h2', { id: 'coach-title', textContent: `${i + 1}. ${lesson.title}` });
    title.tabIndex = -1;
    const shown = lesson.show ? el('div', { className: 'lesson-cards' }, ...lesson.show.split('|').map((g) => el('span', { className: 'card-group' }, ...g.trim().split(/\s+/).map((t) => cardFace(t, 'sm'))))) : '';
    this.coach.replaceChildren(
      el('div', { className: 'row spread coach-head' }, dots, close),
      title,
      ...lesson.body.map((p) => el('p', {}, p)),
      shown,
      el('p', { className: 'ask' }, lesson.ask),
      opts,
      feedback,
      el('div', { className: 'row spread' }, back, next),
    );
    this.coach.classList.remove('hidden');
    title.focus({ preventScroll: true });
  }

  private finish() { this.stopAll(); this.hooks.onFinish(); }

  startTour(from = this.progress.tour) {
    this.stopAll();
    this.mode = 'tour';
    this.hooks.tourOpen?.(true);
    this.tour.start(from);
  }

  stopAll() {
    this.coach.classList.add('hidden');
    if (this.tour.isOpen) this.tour.close(false);
    this.mode = 'off';
  }

  resetProgress() {
    this.progress = { ...loadProgress({ getItem: () => null, setItem: () => {} }), offered: true };
    this.save();
  }
}
