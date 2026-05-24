"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import { getTasks, createTask, updateTask, deleteTask } from "@/lib/actions/tasks";
import { useModeStore } from "@/store/modeStore";
import { useProfileStore } from "@/store/profileStore";
import { cn } from "@/lib/utils";
import { DARK_THEMES } from "@/lib/themes";
import type { Task } from "@/lib/types";

function getToday(): string {
  return new Date().toLocaleDateString("en-CA");
}

function isOverdue(task: Task, today: string): boolean {
  return !task.completed && task.due_date !== null && task.due_date < today;
}

function isCompletedVisible(task: Task, today: string): boolean {
  return task.completed && (task.due_date === null || task.due_date >= today);
}

function shouldRender(task: Task, today: string): boolean {
  if (task.completed && task.due_date !== null && task.due_date < today) return false;
  return true;
}

export function TaskList() {
  const mode = useModeStore((s) => s.mode);
  const activeTheme =
    (useProfileStore((s) => s.profile?.preferences)?.activeTheme as
      | string
      | undefined) ?? "parchment";
  const isParchment = activeTheme === "parchment";
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeTab, setActiveTab] = useState<"today" | "all-pending">("today");
  const [newText, setNewText] = useState("");
  const [newDueDate, setNewDueDate] = useState("");
  const [isPending, startTransition] = useTransition();

  const today = getToday();

  useEffect(() => {
    getTasks().then((result) => {
      if (result.data) setTasks(result.data);
    });
  }, []);

  function getVisibleTasks(): Task[] {
    const filtered =
      activeTab === "today"
        ? tasks.filter((t) => t.due_date === today)
        : tasks.filter((t) => !t.completed);
    return filtered.filter((t) => shouldRender(t, today));
  }

  function handleToggle(task: Task) {
    const updated = { ...task, completed: !task.completed };
    setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
    startTransition(async () => {
      await updateTask(task.id, { completed: !task.completed });
    });
  }

  function handleDelete(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    startTransition(async () => {
      await deleteTask(id);
    });
  }

  function handleCreate() {
    if (!newText.trim()) return;
    const text = newText.trim();
    const due = newDueDate || undefined;
    setNewText("");
    setNewDueDate("");
    startTransition(async () => {
      const result = await createTask(text, due);
      if (result.data) {
        setTasks((prev) => [...prev, result.data!]);
      }
    });
  }

  const visibleTasks = getVisibleTasks();

  return (
    <div
      className="rounded-lg p-5"
      style={{
        background: "var(--surface-card)",
        border: "1px solid var(--color-border)",
      }}
    >
      {/* Header + tab toggle */}
      <div className="mb-4 flex items-center justify-between">
        <h2
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: "var(--color-mist)" }}
        >
          Tasks
        </h2>
        <div
          className="flex overflow-hidden rounded-full"
          style={{ border: "1px solid var(--color-border-strong)" }}
          role="tablist"
          aria-label="Task filter"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "today"}
            onClick={() => setActiveTab("today")}
            className="px-4 py-1 text-xs font-medium transition-colors duration-150"
            style={{
              background:
                activeTab === "today" ? "var(--color-gold)" : "transparent",
              color:
                activeTab === "today" ? "var(--text-on-accent)" : "var(--color-mist)",
            }}
          >
            Today
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "all-pending"}
            onClick={() => setActiveTab("all-pending")}
            className="px-4 py-1 text-xs font-medium transition-colors duration-150"
            style={{
              background:
                activeTab === "all-pending" ? "var(--color-gold)" : "transparent",
              color:
                activeTab === "all-pending"
                  ? "var(--text-on-accent)"
                  : "var(--color-mist)",
            }}
          >
            All Pending
          </button>
        </div>
      </div>

      {/* Task list */}
      <ul className="flex flex-col" role="list">
        {visibleTasks.length === 0 && (
          <li
            className="py-5 text-center font-rune-serif text-sm"
            style={{ color: "var(--color-mist)" }}
          >
            {activeTab === "today" ? "Nothing due today." : "No pending tasks."}
          </li>
        )}
        {visibleTasks.map((task) => {
          const overdue = isOverdue(task, today);
          const completedVis = isCompletedVisible(task, today);
          const hideInFocus = mode === "focus" && completedVis;

          return (
            <li
              key={task.id}
              className={cn(
                "overflow-hidden transition-all duration-300",
                hideInFocus ? "max-h-0 opacity-0" : "max-h-40 opacity-100"
              )}
            >
              <div
                className={cn(
                  "group flex items-center gap-3 rounded px-3 py-2.5",
                  overdue ? "border-l-2" : ""
                )}
                style={{
                  borderLeftColor: overdue ? "var(--color-crimson)" : undefined,
                  background: "rgba(255,255,255,0.025)",
                  marginBottom: "2px",
                }}
              >
                {/* Custom checkbox */}
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={task.completed}
                  aria-label={`Mark "${task.text}" as ${task.completed ? "incomplete" : "complete"}`}
                  onClick={() => handleToggle(task)}
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border transition-colors duration-150"
                  style={{
                    borderColor: task.completed
                      ? "var(--color-gold)"
                      : "var(--color-border-strong)",
                    background: task.completed
                      ? "var(--color-gold)"
                      : "transparent",
                  }}
                >
                  {task.completed && (
                    <Check
                      size={12}
                      strokeWidth={3}
                      style={{ color: "var(--text-on-accent)" }}
                      aria-hidden
                    />
                  )}
                </button>
                {/* Text + due date */}
                <div className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block font-rune-serif text-sm",
                      completedVis ? "line-through" : ""
                    )}
                    style={{
                      color: overdue
                        ? "var(--color-mist)"
                        : completedVis
                          ? "var(--color-mist)"
                          : "var(--text-primary)",
                      textDecorationColor: "var(--color-mist)",
                    }}
                  >
                    {task.text}
                  </span>
                  {task.due_date && (
                    <span
                      className="text-xs"
                      style={{
                        color: overdue
                          ? "var(--color-crimson)"
                          : "var(--color-mist)",
                      }}
                    >
                      {task.due_date}
                    </span>
                  )}
                </div>
                {/* Delete */}
                <button
                  type="button"
                  onClick={() => handleDelete(task.id)}
                  aria-label={`Delete "${task.text}"`}
                  className="shrink-0 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                  style={{ color: "var(--color-mist)" }}
                >
                  <Trash2 size={14} aria-hidden />
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Inline creation */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleCreate();
        }}
        className="flex items-center gap-2 pt-3"
        style={{ borderTop: "1px solid var(--color-border)" }}
      >
        <input
          type="text"
          placeholder="Add a task…"
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          className="min-w-0 flex-1 bg-transparent font-rune-serif text-sm outline-none"
          style={{ color: "var(--text-primary)" }}
          aria-label="New task text"
        />
        <input
          type="date"
          value={newDueDate}
          onChange={(e) => setNewDueDate(e.target.value)}
          aria-label="Due date"
          className={cn(
            "bg-transparent text-xs outline-none",
            isParchment && "text-stone-700"
          )}
          style={{
            color: isParchment ? undefined : "var(--color-mist)",
            colorScheme: DARK_THEMES.has(activeTheme) ? "dark" : "light",
          }}
        />
        <button
          type="submit"
          disabled={!newText.trim() || isPending}
          aria-label="Add task"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-opacity duration-150 disabled:opacity-40"
          style={{ background: "var(--color-gold)", color: "var(--text-on-accent)" }}
        >
          <Plus size={14} aria-hidden />
        </button>
      </form>
    </div>
  );
}
