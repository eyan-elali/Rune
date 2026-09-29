"use client";

import { useEffect, useRef, useState } from "react";
import { Link2, X } from "lucide-react";
import { describeObject, type ObjectRef } from "@/lib/rune2/references";
import { manuscriptSceneOrder } from "@/lib/rune2/sceneViews";
import { ObjectPicker } from "./ObjectPicker";
import { usePropertyStore } from "./PropertyStore";
import { isPendingReference, useReferenceStore } from "./ReferenceStore";
import { useRune2Selection } from "./Rune2Selection";
import { useOpenObject } from "./useOpenObject";

// An object's connections, in the Inspector (migration 028) — beside the
// writing, never in it:
//   Related        — the object's own links to other Entries, Pages and
//                    Scenes, added from a search and removed without
//                    touching either object.
//   Referenced by  — derived from every reference whose target this is
//                    (Relationship values and links alike), each saying how.
//                    Shown only when there is one.
// For a Scene this is its metadata: nothing here goes near its prose, and a
// link never changes its content, version or words. A writer who never links
// anything sees only a faint "Link to…".

export function ObjectLinks({ subject }: { subject: ObjectRef }) {
  const { index } = useRune2Selection();
  const { propertyById } = usePropertyStore();
  const { relatedOf, backlinksOf, addReference, removeReference } = useReferenceStore();
  const openObject = useOpenObject();
  const [picking, setPicking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  const related = relatedOf(subject.id).flatMap((r) => {
    const d = describeObject(index, r.target.id);
    return d ? [{ reference: r, ...d }] : [];
  });
  // Scenes first, in manuscript order (where the object appears in the story),
  // then everything else by title.
  const sceneOrder = new Map(
    (({ placed, unplaced }) => [...placed, ...unplaced])(manuscriptSceneOrder(index)).map((id, at) => [id, at])
  );
  const backlinks = backlinksOf(subject.id)
    .map((b, at) => ({ b, at, rank: sceneOrder.get(b.source.id) ?? Number.MAX_SAFE_INTEGER }))
    .sort((x, y) => x.rank - y.rank || x.at - y.at)
    .flatMap(({ b }) => {
      const d = describeObject(index, b.source.id);
      if (!d) return [];
      // How it refers: a Relationship by its property's name (a Collection's or
      // a Scene property), a plain link as "Link".
      const names = b.via.map((propertyId) =>
        propertyId === null ? "Link" : propertyById(propertyId)?.name || "Relationship"
      );
      return [{ id: b.source.id, title: d.title, hint: [d.hint, ...names].join(" · ") }];
    });

  const toggle = async (target: ObjectRef) => {
    const existing = related.find((r) => r.reference.target.id === target.id);
    const error = existing ? await removeReference(existing.reference) : await addReference(subject, target);
    if (error) setNotice(existing ? "The link couldn’t be removed." : "The link couldn’t be added.");
  };

  return (
    <section className="r2-links" aria-label="Links">
      <h3 className="r2-links-head">Related</h3>
      {related.length > 0 && (
        <ul className="r2-links-list">
          {related.map((r) => (
            <li key={r.reference.id}>
              <button type="button" className="r2-link" {...openObject(r.reference.target.id)}>
                <span className="r2-link-title">{r.title}</span>
                <span className="r2-link-hint">{r.hint}</span>
              </button>
              <button
                type="button"
                className="r2-icon-button r2-link-remove"
                aria-label={`Remove the link to ${r.title}`}
                title="Remove the link (nothing is deleted)"
                disabled={isPendingReference(r.reference)}
                onClick={() => void toggle(r.reference.target)}
              >
                <X size={12} strokeWidth={1.75} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="r2-links-add">
        <button
          ref={button}
          type="button"
          className="r2-panel-link r2-links-add-button"
          aria-haspopup="listbox"
          aria-expanded={picking}
          onClick={() => setPicking((p) => !p)}
        >
          <Link2 size={12} strokeWidth={1.75} aria-hidden />
          Link to…
        </button>
        {picking && (
          <ObjectPicker
            spec={{ type: "any" }}
            chosen={related.map((r) => r.reference.target.id)}
            multi
            label="Link to"
            exclude={new Set([subject.id])}
            onChoose={(c) => void toggle({ type: c.type, id: c.id })}
            onClose={(refocus) => {
              setPicking(false);
              if (refocus) button.current?.focus();
            }}
          />
        )}
      </div>

      {backlinks.length > 0 && (
        <>
          <h3 className="r2-links-head">Referenced by</h3>
          <ul className="r2-links-list">
            {backlinks.map((b) => (
              <li key={b.id}>
                <button type="button" className="r2-link" {...openObject(b.id)}>
                  <span className="r2-link-title">{b.title}</span>
                  <span className="r2-link-hint">{b.hint}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {notice && (
        <p role="status" className="r2-panel-notice">
          {notice}
        </p>
      )}
    </section>
  );
}
