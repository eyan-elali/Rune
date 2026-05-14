"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { ProjectCard } from "./ProjectCard";
import { NewProjectModal } from "./NewProjectModal";
import { Button } from "@/components/ui/Button";
import type { Project } from "@/lib/types";

interface ProjectsGridProps {
  projects: Project[];
}

export function ProjectsGrid({ projects }: ProjectsGridProps) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);

  function openNew() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(project: Project) {
    setEditing(project);
    setModalOpen(true);
  }

  function handleClose() {
    setModalOpen(false);
    setEditing(null);
  }

  function handleSuccess() {
    router.refresh();
  }

  return (
    <>
      {/* Toolbar */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-rune-serif text-2xl text-rune-parchment">
          Projects
        </h1>
        <Button variant="primary" onClick={openNew} className="gap-1.5">
          <Plus size={15} aria-hidden="true" />
          New Project
        </Button>
      </div>

      {/* Grid */}
      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-20 text-center"
          style={{ borderColor: "var(--color-border)" }}>
          <p className="font-rune-serif text-lg text-rune-parchment/50">
            No projects yet.
          </p>
          <p className="mt-1 text-sm text-rune-mist/50">
            Create your first project to begin writing.
          </p>
          <Button variant="ghost" onClick={openNew} className="mt-5">
            <Plus size={14} />
            Create a project
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onEdit={openEdit}
            />
          ))}
        </div>
      )}

      <NewProjectModal
        open={modalOpen}
        onClose={handleClose}
        onSuccess={handleSuccess}
        editing={
          editing
            ? {
                id: editing.id,
                title: editing.title,
                description: editing.description,
                cover_color: editing.cover_color,
              }
            : undefined
        }
      />
    </>
  );
}
