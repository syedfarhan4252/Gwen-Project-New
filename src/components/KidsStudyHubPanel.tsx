import React, { useState } from 'react';
import {
  Award,
  BookOpen,
  ClipboardCheck,
  GraduationCap,
  MessageSquare,
  Plus,
  Star,
  Trash2,
} from 'lucide-react';
import type { KidStudyBundle } from '../types/gwen';

interface KidsStudyHubPanelProps {
  kidBundles: KidStudyBundle[];
  activeKidId: string | null;
  onSelectKid: (kidId: string | null) => void;
  onAddKidProfile: (
    name: string,
    age: number,
    grade: string,
    subjects: string[]
  ) => Promise<void>;
  onDeleteKidProfile: (kidId: string) => Promise<void>;
  onStartLessonWithKid: (kidName: string, subject?: string) => void;
  onAskParentReport: (kidName: string) => void;
}

const DEFAULT_SUBJECT_PRESETS = ['Math', 'English', 'Science', 'Hindi', 'Reading', 'GK'];

export const KidsStudyHubPanel: React.FC<KidsStudyHubPanelProps> = ({
  kidBundles,
  activeKidId,
  onSelectKid,
  onAddKidProfile,
  onDeleteKidProfile,
  onStartLessonWithKid,
  onAskParentReport,
}) => {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [age, setAge] = useState('8');
  const [grade, setGrade] = useState('Grade 3');
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([
    'Math',
    'English',
    'Science',
  ]);
  const [submitting, setSubmitting] = useState(false);

  const activeBundle = kidBundles.find((b) => b.profile.id === activeKidId) || kidBundles[0] || null;

  const toggleSubject = (subj: string) => {
    setSelectedSubjects((prev) =>
      prev.includes(subj) ? prev.filter((s) => s !== subj) : [...prev, subj]
    );
  };

  const handleCreateKid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onAddKidProfile(
        name.trim(),
        Number(age) || 8,
        grade.trim() || 'Grade 3',
        selectedSubjects.length > 0 ? selectedSubjects : ['Math', 'English', 'Science']
      );
      setName('');
      setAge('8');
      setGrade('Grade 3');
      setShowForm(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <p className="text-xs text-[var(--text-secondary)] max-w-lg leading-relaxed">
          Isolated study vaults per child — kids simply say &ldquo;Hi Gwen, I&rsquo;m [Name]&rdquo; to switch automatically.
        </p>

        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="h-8 px-3.5 rounded-full glass-pill text-xs font-semibold text-[var(--text-primary)] hover:bg-white/[0.12] flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Plus className="h-3.5 w-3.5 text-[var(--accent)]" />
          <span>{showForm ? 'Cancel' : 'Add Child'}</span>
        </button>
      </div>

      {/* Add Child Profile Form */}
      {showForm && (
        <form
          onSubmit={(e) => void handleCreateKid(e)}
          className="rounded-2xl p-3.5 bg-white/[0.04] border border-cyan-400/25 space-y-3"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div>
              <label className="block text-[11px] font-medium text-[var(--text-muted)] mb-1">
                Child&rsquo;s Name
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Aarav or Zara"
                className="w-full h-9 rounded-xl px-3 text-xs bg-white/[0.06] text-[var(--text-primary)] border border-white/[0.08] focus:outline-none focus:border-cyan-400/45"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[var(--text-muted)] mb-1">
                Age
              </label>
              <input
                type="number"
                min={3}
                max={18}
                value={age}
                onChange={(e) => setAge(e.target.value)}
                className="w-full h-9 rounded-xl px-3 text-xs bg-white/[0.06] text-[var(--text-primary)] border border-white/[0.08] focus:outline-none focus:border-cyan-400/45"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[var(--text-muted)] mb-1">
                Grade / Class
              </label>
              <input
                type="text"
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
                placeholder="e.g. Grade 4"
                className="w-full h-9 rounded-xl px-3 text-xs bg-white/[0.06] text-[var(--text-primary)] border border-white/[0.08] focus:outline-none focus:border-cyan-400/45"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {DEFAULT_SUBJECT_PRESETS.map((subj) => {
              const active = selectedSubjects.includes(subj);
              return (
                <button
                  key={subj}
                  type="button"
                  onClick={() => toggleSubject(subj)}
                  className={`h-7 px-3 rounded-full text-[11px] font-medium border cursor-pointer transition-colors ${
                    active
                      ? 'bg-cyan-400/15 border-cyan-400/35 text-[var(--accent)]'
                      : 'glass-pill text-[var(--text-secondary)]'
                  }`}
                >
                  {subj}
                </button>
              );
            })}
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="h-9 px-4 rounded-full cta-aurora text-xs font-semibold cursor-pointer"
            >
              {submitting ? 'Creating...' : 'Create Study Vault'}
            </button>
          </div>
        </form>
      )}

      {kidBundles.length === 0 ? (
        <div className="rounded-2xl p-6 bg-white/[0.03] border border-white/[0.07] text-center space-y-1.5">
          <GraduationCap className="h-7 w-7 mx-auto text-[var(--accent)]" />
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
            No Student Profiles Yet
          </h3>
          <p className="text-xs text-[var(--text-muted)] max-w-sm mx-auto">
            Add each child separately so Gwen teaches by name, tracks quizzes independently, and shares parent reports.
          </p>
        </div>
      ) : (
        <div className="space-y-3.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {kidBundles.map((bundle) => {
              const isSelected = activeBundle?.profile.id === bundle.profile.id;
              return (
                <div
                  key={bundle.profile.id}
                  className={`rounded-2xl p-3.5 border transition-all space-y-2.5 ${
                    isSelected
                      ? 'bg-cyan-400/10 border-cyan-400/35'
                      : 'bg-white/[0.03] border-white/[0.07]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => onSelectKid(bundle.profile.id)}
                      className="flex items-center gap-2.5 text-left flex-1 min-w-0 cursor-pointer"
                    >
                      <span
                        className="h-9 w-9 rounded-xl flex items-center justify-center font-display text-sm font-bold text-[#05070e] shrink-0"
                        style={{ backgroundColor: bundle.profile.avatarColor }}
                      >
                        {bundle.profile.name.slice(0, 1).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-[var(--text-primary)] truncate">
                          {bundle.profile.name}
                        </div>
                        <div className="text-[11px] text-[var(--text-muted)] truncate">
                          Age {bundle.profile.age} · {bundle.profile.grade}
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => void onDeleteKidProfile(bundle.profile.id)}
                      aria-label={`Remove ${bundle.profile.name}'s profile`}
                      className="h-7 w-7 rounded-full flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--danger)] cursor-pointer shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)] font-mono-tabular">
                    <span className="flex items-center gap-1">
                      <Star className="h-3 w-3 text-amber-400" />
                      {bundle.profile.stars} stars
                    </span>
                    <span className="text-[var(--text-muted)]">
                      {bundle.lessons.length} lessons · {bundle.quizResults.length} quizzes
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        onSelectKid(bundle.profile.id);
                        onStartLessonWithKid(bundle.profile.name, bundle.profile.subjects[0]);
                      }}
                      className="flex-1 h-8 px-3 rounded-full bg-cyan-400/15 border border-cyan-400/35 text-[11px] font-semibold text-[var(--accent)] hover:bg-cyan-400/25 flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <BookOpen className="h-3.5 w-3.5" />
                      <span>Start Lesson</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onAskParentReport(bundle.profile.name)}
                      className="h-8 px-3 rounded-full glass-pill text-[11px] font-medium text-[var(--text-primary)] cursor-pointer"
                    >
                      Report
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {activeBundle && (
            <div className="rounded-2xl p-3.5 bg-white/[0.03] border border-white/[0.07] space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-white/[0.06]">
                <div>
                  <h3 className="text-xs font-semibold text-[var(--text-primary)]">
                    {activeBundle.profile.name}&rsquo;s Study Record
                  </h3>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    {activeBundle.profile.subjects.join(' · ')} · {activeBundle.profile.streakDays}-day streak
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onStartLessonWithKid(activeBundle.profile.name)}
                  className="h-8 px-3 rounded-full glass-pill text-[11px] font-semibold text-[var(--accent)] flex items-center gap-1.5 cursor-pointer"
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  <span>Teach Now</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px]">
                <div className="rounded-xl p-3 bg-white/[0.03] border border-white/[0.06] space-y-1.5">
                  <div className="flex items-center gap-1.5 font-semibold text-[var(--text-primary)]">
                    <BookOpen className="h-3.5 w-3.5 text-cyan-400" />
                    <span>Lessons ({activeBundle.lessons.length})</span>
                  </div>
                  {activeBundle.lessons.length === 0 ? (
                    <p className="text-[var(--text-muted)]">No lessons yet.</p>
                  ) : (
                    activeBundle.lessons.slice(0, 3).map((l) => (
                      <div key={l.id} className="truncate text-[var(--text-secondary)]">
                        {l.subject}: {l.topic}
                      </div>
                    ))
                  )}
                </div>

                <div className="rounded-xl p-3 bg-white/[0.03] border border-white/[0.06] space-y-1.5">
                  <div className="flex items-center gap-1.5 font-semibold text-[var(--text-primary)]">
                    <Award className="h-3.5 w-3.5 text-violet-400" />
                    <span>Praise ({activeBundle.practiceLogs.length})</span>
                  </div>
                  {activeBundle.practiceLogs.length === 0 ? (
                    <p className="text-[var(--text-muted)]">Stars &amp; gentle notes appear here.</p>
                  ) : (
                    activeBundle.practiceLogs.slice(0, 3).map((p) => (
                      <div key={p.id} className="truncate text-[var(--text-secondary)]">
                        {p.subject} (+{p.starsEarned} ★)
                      </div>
                    ))
                  )}
                </div>

                <div className="rounded-xl p-3 bg-white/[0.03] border border-white/[0.06] space-y-1.5">
                  <div className="flex items-center gap-1.5 font-semibold text-[var(--text-primary)]">
                    <ClipboardCheck className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Quizzes ({activeBundle.quizResults.length})</span>
                  </div>
                  {activeBundle.quizResults.length === 0 ? (
                    <p className="text-[var(--text-muted)]">Quiz scores save privately here.</p>
                  ) : (
                    activeBundle.quizResults.slice(0, 3).map((q) => (
                      <div
                        key={q.id}
                        className="flex items-center justify-between gap-2 text-[var(--text-secondary)]"
                      >
                        <span className="truncate">{q.topic}</span>
                        <span className="font-mono-tabular text-[var(--accent)] shrink-0">
                          {q.score}/{q.total}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
