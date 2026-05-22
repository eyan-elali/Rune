import { create } from "zustand";

interface EditorState {
  currentProjectId: string | null;
  currentChapterId: string | null;
  currentPageId: string | null;
  isSaving: boolean;
  lastSaved: Date | null;
  setCurrentPage: (projectId: string, chapterId: string, pageId: string) => void;
  setIsSaving: (isSaving: boolean) => void;
  setLastSaved: (date: Date) => void;
  clearLastSaved: () => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  currentProjectId: null,
  currentChapterId: null,
  currentPageId: null,
  isSaving: false,
  lastSaved: null,
  setCurrentPage: (projectId, chapterId, pageId) =>
    set({ currentProjectId: projectId, currentChapterId: chapterId, currentPageId: pageId }),
  setIsSaving: (isSaving) => set({ isSaving }),
  setLastSaved: (lastSaved) => set({ lastSaved }),
  clearLastSaved: () => set({ lastSaved: null }),
}));
