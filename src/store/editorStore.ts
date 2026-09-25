import { create } from "zustand";

interface EditorState {
  currentProjectId: string | null;
  currentChapterId: string | null;
  currentSceneId: string | null;
  isSaving: boolean;
  lastSaved: Date | null;
  /** chapterId is null while editing an Unplaced Scene. */
  setCurrentScene: (projectId: string, chapterId: string | null, sceneId: string) => void;
  setIsSaving: (isSaving: boolean) => void;
  setLastSaved: (date: Date) => void;
  clearLastSaved: () => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  currentProjectId: null,
  currentChapterId: null,
  currentSceneId: null,
  isSaving: false,
  lastSaved: null,
  setCurrentScene: (projectId, chapterId, sceneId) =>
    set({ currentProjectId: projectId, currentChapterId: chapterId, currentSceneId: sceneId }),
  setIsSaving: (isSaving) => set({ isSaving }),
  setLastSaved: (lastSaved) => set({ lastSaved }),
  clearLastSaved: () => set({ lastSaved: null }),
}));
