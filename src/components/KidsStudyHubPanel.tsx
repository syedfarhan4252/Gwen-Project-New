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

const DEFAULT_SUBJECT_PRESETS = ['Math', 'English', 'Science', 'Hindi', 'Reading', 'General Knowledge'];

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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <p className="text-xs text-[var(--text-secondary)]">
            Every child gets their own completely isolated study vault (lessons, practice logs, quiz scores &amp; stars). Kids can simply say &ldquo;Hi Gwen, I&rsquo;m [Name]&rdquo; to switch automatically.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="min-h-[40px] px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          style={{
            backgroundColor: 'var(--accent)',
            color: 'var(--accent-contrast)',
          }}
        >
          <Plus className="h-4 w-4" />
          <span>{showForm ? 'Cancel' : 'Add Child Profile'}</span>
        </button>
      </div>

      {/* Add Child Profile Form */}
      {showForm && (
        <form
          onSubmit={(e) => void handleCreateKid(e)}
          className="rounded-2xl p-4 border space-y-3"
          style={{
            backgroundColor: 'var(--bg-elevated)',
            borderColor: 'var(--accent-ring)',
          }}
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                Child&rsquo;s Name
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Aarav or Zara"
                className="w-full h-11 rounded-xl px-3.5 text-sm bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-hairline)] focus:outline-none focus:border-[var(--accent)]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                Age
              </label>
              <input
                type="number"
                min={3}
                max={18}
                value={age}
                onChange={(e) => setAge(e.target.value)}
                className="w-full h-11 rounded-xl px-3.5 text-sm bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-hairline)] focus:outline-none focus:border-[var(--accent)]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                Grade / Class
              </label>
              <input
                type="text"
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
                placeholder="e.g. Grade 4"
                className="w-full h-11 rounded-xl px-3.5 text-sm bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-hairline)] focus:outline-none focus:border-[var(--accent)]"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <span className="block text-xs font-medium text-[var(--text-secondary)]">
              Subjects to Practice
            </span>
            <div className="flex flex-wrap gap-2">
              {DEFAULT_SUBJECT_PRESETS.map((subj) => {
                const active = selectedSubjects.includes(subj);
                return (
                  <button
                    key={subj}
                    type="button"
                    onClick={() => toggleSubject(subj)}
                    className="min-h-[36px] px-3 rounded-xl text-xs font-medium border transition-colors cursor-pointer"
                    style={{
                      backgroundColor: active ? 'var(--accent-soft)' : 'var(--bg-surface)',
                      borderColor: active ? 'var(--accent)' : 'var(--border-hairline)',
                      color: active ? 'var(--accent)' : 'var(--text-secondary)',
                    }}
                  >
                    {subj}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="min-h-[42px] px-5 rounded-xl text-xs font-semibold cursor-pointer"
              style={{
                backgroundColor: 'var(--accent)',
                color: 'var(--accent-contrast)',
              }}
            >
              {submitting ? 'Creating Vault...' : 'Create Isolated Study Profile'}
            </button>
          </div>
        </form>
      )}

      {/* Kid Profile Selector Strip */}
      {kidBundles.length === 0 ? (
        <div
          className="rounded-2xl p-6 border text-center space-y-2"
          style={{
            backgroundColor: 'var(--bg-elevated)',
            borderColor: 'var(--border-hairline)',
          }}
        >
          <GraduationCap className="h-8 w-8 mx-auto text-[var(--accent)]" />
          <h3 className="font-display text-base font-semibold text-[var(--text-primary)]">
            No Student Profiles Yet
          </h3>
          <p className="text-xs text-[var(--text-muted)] max-w-md mx-auto">
            Add each child separately so Gwen remembers their actual name, tracks their lessons &amp; quizzes independently, praises their effort, and gives parents individual progress reports.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {kidBundles.map((bundle) => {
              const isSelected = activeBundle?.profile.id === bundle.profile.id;
              return (
                <div
                  key={bundle.profile.id}
                  className="rounded-2xl p-4 border transition-colors flex flex-col justify-between gap-3"
                  style={{
                    backgroundColor: isSelected ? 'var(--accent-soft)' : 'var(--bg-elevated)',
                    borderColor: isSelected ? 'var(--accent)' : 'var(--border-hairline)',
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => onSelectKid(bundle.profile.id)}
                      className="flex items-center gap-3 text-left flex-1 min-w-0 cursor-pointer"
                    >
                      <span
                        className="h-10 w-10 rounded-2xl flex items-center justify-center font-display text-base font-bold text-[#091118] shrink-0"
                        style={{ backgroundColor: bundle.profile.avatarColor }}
                      >
                        {bundle.profile.name.slice(0, 1).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-[var(--text-primary)] truncate">
                          {bundle.profile.name}
                        </div>
                        <div className="text-xs text-[var(--text-muted)] truncate">
                          Age {bundle.profile.age} · {bundle.profile.grade}
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => void onDeleteKidProfile(bundle.profile.id)}
                      aria-label={`Remove ${bundle.profile.name}'s profile`}
                      className="h-8 w-8 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--danger)] cursor-pointer shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
                    <span className="flex items-center gap-1 font-mono-tabular">
                      <Star className="h-3.5 w-3.5 text-amber-400" />
                      {bundle.profile.stars} stars
                    </span>
                    <span className="font-mono-tabular text-[var(--text-muted)]">
                      {bundle.lessons.length} lessons · {bundle.quizResults.length} quizzes
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        onSelectKid(bundle.profile.id);
                        onStartLessonWithKid(bundle.profile.name, bundle.profile.subjects[0]);
                      }}
                      className="flex-1 min-h-[38px] px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
                      style={{
                        backgroundColor: 'var(--accent)',
                        color: 'var(--accent-contrast)',
                      }}
                    >
                      <BookOpen className="h-3.5 w-3.5" />
                      <span>Start Lesson</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onAskParentReport(bundle.profile.name)}
                      className="min-h-[38px] px-3 rounded-xl text-xs font-semibold bg-[var(--bg-surface)] border border-[var(--border-hairline)] text-[var(--text-primary)] hover:border-[var(--accent)] whitespace-nowrap cursor-pointer"
                    >
                      Report
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Active Child Isolated Study Vault Details */}
          {activeBundle && (
            <div
              className="rounded-2xl p-4 sm:p-5 border space-y-4"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                borderColor: 'var(--border-hairline)',
              }}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[var(--border-hairline)]">
                <div>
                  <h3 className="font-display text-base font-semibold text-[var(--text-primary)]">
                    {activeBundle.profile.name}&rsquo;s Isolated Study Record
                  </h3>
                  <p className="text-xs text-[var(--text-muted)]">
                    Subjects: {activeBundle.profile.subjects.join(' · ')} · {activeBundle.profile.streakDays}-day streak
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onStartLessonWithKid(activeBundle.profile.name)}
                  className="min-h-[38px] px-3.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 bg-[var(--bg-surface)] border border-[var(--border-hairline)] text-[var(--accent)] hover:border-[var(--accent)] whitespace-nowrap cursor-pointer"
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  <span>Open Home Teacher Session</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                {/* Recent Lessons */}
                <div className="rounded-xl p-3.5 bg-[var(--bg-surface)] border border-[var(--border-hairline)] space-y-2">
                  <div className="flex items-center gap-1.5 font-semibold text-[var(--text-primary)]">
                    <BookOpen className="h-3.5 w-3.5 text-[var(--accent)]" />
                    <span>Lessons ({activeBundle.lessons.length})</span>
                  </div>
                  {activeBundle.lessons.length === 0 ? (
                    <p className="text-[var(--text-muted)]">
                      No lessons recorded yet. Tap Start Lesson to begin teaching {activeBundle.profile.name}!
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {activeBundle.lessons.slice(0, 3).map((l) => (
                        <div key={l.id} className="border-t border-[var(--border-hairline)] pt-1.5 first:border-0 first:pt-0">
                          <div className="font-medium text-[var(--text-primary)]">
                            {l.subject}: {l.topic}
                          </div>
                          <div className="text-[var(--text-muted)]">
                            Mastery: {l.masteryLevel}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Practice & Gentle Corrections */}
                <div className="rounded-xl p-3.5 bg-[var(--bg-surface)] border border-[var(--border-hairline)] space-y-2">
                  <div className="flex items-center gap-1.5 font-semibold text-[var(--text-primary)]">
                    <Award className="h-3.5 w-3.5 text-[var(--accent)]" />
                    <span>Practice &amp; Praise ({activeBundle.practiceLogs.length})</span>
                  </div>
                  {activeBundle.practiceLogs.length === 0 ? (
                    <p className="text-[var(--text-muted)]">
                      Gwen logs gentle corrections and stars earned as {activeBundle.profile.name} practices.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {activeBundle.practiceLogs.slice(0, 3).map((p) => (
                        <div key={p.id} className="border-t border-[var(--border-hairline)] pt-1.5 first:border-0 first:pt-0">
                          <div className="font-medium text-[var(--text-primary)]">
                            {p.subject} (+{p.starsEarned} ★)
                          </div>
                          <div className="text-[var(--text-muted)] line-clamp-2">
                            {p.praiseGiven || p.activity}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Mini-Quizzes */}
                <div className="rounded-xl p-3.5 bg-[var(--bg-surface)] border border-[var(--border-hairline)] space-y-2">
                  <div className="flex items-center gap-1.5 font-semibold text-[var(--text-primary)]">
                    <ClipboardCheck className="h-3.5 w-3.5 text-[var(--accent)]" />
                    <span>Quizzes ({activeBundle.quizResults.length})</span>
                  </div>
                  {activeBundle.quizResults.length === 0 ? (
                    <p className="text-[var(--text-muted)]">
                      Ask Gwen to quiz {activeBundle.profile.name} anytime — scores save privately here.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {activeBundle.quizResults.slice(0, 3).map((q) => (
                        <div key={q.id} className="border-t border-[var(--border-hairline)] pt-1.5 first:border-0 first:pt-0">
                          <div className="flex items-center justify-between font-medium text-[var(--text-primary)]">
                            <span className="truncate">{q.topic}</span>
                            <span className="font-mono-tabular text-[var(--accent)] shrink-0">
                              {q.score}/{q.total}
                            </span>
                          </div>
                          <div className="text-[var(--text-muted)] line-clamp-1">{q.feedback}</div>
                        </div>
                      ))}
                    </div>
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
