"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import CharacterCount from "@tiptap/extension-character-count";
import { useEffect, useRef } from "react";

interface GameEditorProps {
  onWordCountChange: (count: number) => void;
}

export default function GameEditor({ onWordCountChange }: GameEditorProps) {
  const trackedWords = useRef(0);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: "Write anything. Every word counts...",
        emptyEditorClass: "is-editor-empty",
        emptyNodeClass: "is-empty",
        showOnlyWhenEditable: true,
        showOnlyCurrent: true,
      }),
      CharacterCount,
    ],
    autofocus: true,
    editorProps: {
      // Paste is disabled in game mode — only typed words count
      handlePaste: () => true,
    },
    onUpdate({ editor }) {
      const current =
        (editor.storage.characterCount?.words?.() as number | undefined) ?? 0;
      if (current > trackedWords.current) {
        trackedWords.current = current;
        onWordCountChange(current);
      }
    },
  });

  useEffect(() => {
    if (editor) editor.commands.focus();
  }, [editor]);

  return (
    <div className="mx-auto w-full max-w-[680px] px-8 py-12">
      <EditorContent editor={editor} />
    </div>
  );
}
