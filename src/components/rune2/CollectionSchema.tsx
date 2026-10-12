"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, Trash2 } from "lucide-react";
import { ICON } from "./icons";
import { convertibleTypes, countValues, isChoiceType, isSceneProperty, PROPERTY_TYPE_LABEL } from "@/lib/rune2/collectionProperties";
import { targetPhrase } from "@/lib/rune2/references";
import type { CollectionPropertyType, PropertyDefinition } from "@/lib/types";
import { AddProperty } from "./PropertyFields";
import { MenuSelect, OptionsEditor, STATUS_DEFAULTS } from "./PropertyMenus";
import { usePropertyStore } from "./PropertyStore";
import { useRune2Selection } from "./Rune2Selection";
import { useViewStore } from "./ViewStore";

// A Collection's property settings, opened from its view: each property's
// name, type, order, and a choice property's options. The one place a
// property is renamed, reordered or removed. Which properties a View shows
// belongs to the View (migration 027, ViewOptions); only before 027 does
// this say whether the list shows each one (shown_in_list).
//
// Nothing here removes writing. Removing a property removes the values
// Entries hold for it, so it always asks first and says how many; the server
// refuses if that number has changed meanwhile (delete_workspace_collection_property)
// and the question is asked again with the new number. Removing an option
// that Entries use asks first too, and clears it from them. A Relationship
// (028) says what it points to and whether it holds one or several; removing
// it removes its links, never the objects they pointed to.
//
// The same settings serve the Manuscript's Scene properties (032), given the
// Manuscript's id: the facts a writer wants to keep about each Scene. Nothing
// here ever touches a Scene's prose; removing a Scene property removes only
// the values Scenes hold for it.
//
// Opened on an Entry (`scope: "entry"`, Milestone 21E.2) they are the same
// settings — the Collection's, never the Entry's — and say so: a line names
// the Collection and that every entry is affected, and removing a property
// says it goes from every entry, not only this one. `focusId` opens them on
// one property (its name ready to edit), from a row's pencil.

function plural(n: number, one: string, many = `${one}s`) {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

/** Two quiet starting points for Scene properties — suggestions, never created for the writer. */
const SCENE_SUGGESTIONS: { name: string; type: CollectionPropertyType }[] = [
  { name: "Synopsis", type: "text" },
  { name: "Status", type: "status" },
];

export function CollectionSchema({
  ownerId,
  ownerTitle,
  scope,
  focusId,
}: {
  ownerId: string;
  ownerTitle: string;
  /** "entry": opened from an Entry — the Collection's settings, shown as such. */
  scope?: "entry";
  /** Open on this property, its name focused. */
  focusId?: string;
}) {
  const { propertiesOf, manuscriptId } = usePropertyStore();
  const properties = propertiesOf(ownerId);
  const forScenes = ownerId === manuscriptId;
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  return (
    <section className="r2-schema" aria-label={`Properties of ${ownerTitle}`} data-scope={scope}>
      {scope === "entry" && (
        <p className="r2-schema-scope">
          <span className="r2-schema-scope-owner">Properties of {ownerTitle}</span>
          <span className="r2-schema-scope-note">Changes here apply to every entry, not only this one.</span>
        </p>
      )}
      {scope !== "entry" && properties.length > 0 && (
        <p className="r2-schema-scope">
          <span className="r2-schema-scope-note">
            {forScenes ? "Every scene has these properties." : "Every entry in this collection has these properties."}
          </span>
        </p>
      )}
      {properties.length === 0 ? (
        forScenes ? (
          <>
            <p className="r2-schema-intro">
              Scene properties are the facts you want to keep about each scene — a point of view, a place, who is in
              it, how far along it is. They sit beside your prose, never in it, and they’re optional.
            </p>
            <SceneSuggestions ownerId={ownerId} onNotice={setNotice} />
          </>
        ) : (
          <p className="r2-schema-intro">
            Properties are the facts every entry can hold — a role, a status, a date. They’re optional; add them only if
            they help.
          </p>
        )
      ) : (
        <ol className="r2-schema-list">
          {properties.map((p, i) => (
            <SchemaRow
              key={p.id}
              property={p}
              index={i}
              count={properties.length}
              onNotice={setNotice}
              scope={scope}
              focus={p.id === focusId}
            />
          ))}
        </ol>
      )}
      <AddProperty ownerId={ownerId} />
      {notice && (
        <p role="status" className="r2-doc-note">
          {notice}
        </p>
      )}
    </section>
  );
}

/** "Start with Synopsis · Status": one click adds that property; nothing is added until the writer asks. */
export function SceneSuggestions({ ownerId, onNotice }: { ownerId: string; onNotice: (message: string) => void }) {
  const { createProperty, propertiesOf } = usePropertyStore();
  const [busy, setBusy] = useState(false);
  const taken = new Set(propertiesOf(ownerId).map((p) => p.name.toLowerCase()));
  const offered = SCENE_SUGGESTIONS.filter((s) => !taken.has(s.name.toLowerCase()));
  if (offered.length === 0) return null;
  return (
    <p className="r2-schema-suggest">
      <span>Start with</span>
      {offered.map((s) => (
        <button
          key={s.name}
          type="button"
          className="r2-chip r2-schema-suggestion"
          disabled={busy}
          title={`Add a ${PROPERTY_TYPE_LABEL[s.type]} property called ${s.name}`}
          onClick={async () => {
            setBusy(true);
            const error = await createProperty(ownerId, s.name, s.type, s.type === "status" ? STATUS_DEFAULTS : undefined);
            setBusy(false);
            if (error) onNotice("Couldn’t add the property.");
          }}
        >
          {s.name}
        </button>
      ))}
    </p>
  );
}

function SchemaRow({
  property,
  index,
  count,
  onNotice,
  scope,
  focus = false,
}: {
  property: PropertyDefinition;
  index: number;
  count: number;
  onNotice: (message: string) => void;
  scope?: "entry";
  /** Opened on this row: its name takes focus, ready to edit. */
  focus?: boolean;
}) {
  const { values, updateProperty, moveProperty, deleteProperty, updateRelationship } = usePropertyStore();
  const { index: objects } = useRune2Selection();
  const { available: viewable } = useViewStore();
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!focus) return;
    const el = nameRef.current;
    if (!el) return;
    el.focus();
    el.select();
    el.scrollIntoView({ block: "nearest" });
  }, [focus]);
  const [name, setName] = useState(property.name);
  const [editing, setEditing] = useState(false);
  const [seen, setSeen] = useState(property.name);
  if (property.name !== seen) {
    setSeen(property.name);
    if (!editing) setName(property.name);
  }
  const [confirming, setConfirming] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const nameId = useId();
  const confirmId = useId();
  const removeButton = useRef<HTMLButtonElement>(null);
  // Leaving the question puts the keyboard back on the control that asked it.
  const cancelRemove = () => {
    setConfirming(null);
    removeButton.current?.focus();
  };
  const types = convertibleTypes(property.type);

  const rename = async () => {
    const next = name.trim();
    if (!next) {
      setName(property.name);
      return;
    }
    if (next === property.name) return;
    const r = await updateProperty(property, { name: next });
    if (r.error !== null) {
      setName(property.name);
      onNotice(
        r.error === "A property with this name already exists"
          ? "There’s already a property with that name."
          : "The name couldn’t be saved."
      );
    }
  };

  const remove = async (expected: number) => {
    setBusy(true);
    const r = await deleteProperty(property, expected);
    setBusy(false);
    if (r.status === "confirm") {
      // Entries changed since the question was asked: ask again, with the new number.
      setConfirming(r.values);
    } else if (r.status === "error") {
      setConfirming(null);
      onNotice(`“${property.name}” couldn’t be removed.`);
    }
  };

  const valueCount = countValues(values, property.id);
  const scene = isSceneProperty(property);
  const [one, many] = scene ? ["scene", "scenes"] : ["entry", "entries"];
  // From an Entry: the question says plainly that the whole Collection is meant.
  const everywhere = scope === "entry" ? " It goes from every entry in the collection, not only this one." : "";

  return (
    <li className="r2-schema-row">
      <div className="r2-schema-line">
        <label htmlFor={nameId} className="sr-only">
          Property name
        </label>
        <input
          ref={nameRef}
          id={nameId}
          className="r2-schema-name"
          maxLength={100}
          value={name}
          onFocus={() => setEditing(true)}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            setEditing(false);
            void rename();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            else if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              setName(property.name);
              setEditing(false);
              const el = e.currentTarget;
              requestAnimationFrame(() => el.blur());
            }
          }}
        />
        {property.type === "relationship" ? (
          <>
            <span className="r2-field r2-schema-type" title="Relationship">
              → {targetPhrase(property, (id) => objects.get(id)?.title ?? "a collection in Trash")}
            </span>
            <MenuSelect
              className="r2-schema-type"
              label={`How many ${property.name} ${scene ? "a scene" : "an entry"} holds`}
              value={property.relation_many ? "many" : "one"}
              options={[
                { value: "one", label: "One" },
                { value: "many", label: "Several" },
              ]}
              onChange={(v) =>
                void updateRelationship(property, { many: v === "many" }).then((error) => {
                  if (error)
                    onNotice(
                      error === "Some entries hold more than one" || error === "Some scenes hold more than one"
                        ? `Some ${many} hold more than one — remove the extras first.`
                        : "That couldn’t be changed."
                    );
                })
              }
            />
          </>
        ) : types.length > 1 ? (
          <MenuSelect
            className="r2-schema-type"
            label={`Type of ${property.name}`}
            value={property.type}
            options={types.map((t) => ({ value: t, label: PROPERTY_TYPE_LABEL[t] }))}
            onChange={(type) => {
              void updateProperty(property, { type }).then((r) => {
                if (r.error !== null) onNotice("The type couldn’t be changed.");
              });
            }}
          />
        ) : (
          <span className="r2-field r2-schema-type" title="This type can’t be changed without losing values">
            {PROPERTY_TYPE_LABEL[property.type]}
          </span>
        )}
        <span className="r2-schema-actions">
          {!viewable && !scene && "shown_in_list" in property && (
          <button
            type="button"
            className="r2-icon-button"
            aria-pressed={property.shown_in_list}
            aria-label={`Show ${property.name} in the list`}
            title={property.shown_in_list ? "Shown in the list" : "Not shown in the list"}
            onClick={() => void updateProperty(property, { shown_in_list: !property.shown_in_list })}
          >
            {property.shown_in_list ? (
              <Eye {...ICON} aria-hidden />
            ) : (
              <EyeOff {...ICON} aria-hidden />
            )}
          </button>
          )}
          <button
            type="button"
            className="r2-icon-button"
            aria-label={`Move ${property.name} up`}
            title="Move up"
            disabled={index === 0}
            onClick={async () => {
              if (await moveProperty(property, index - 1)) onNotice("Couldn’t move the property.");
            }}
          >
            <ArrowUp {...ICON} aria-hidden />
          </button>
          <button
            type="button"
            className="r2-icon-button"
            aria-label={`Move ${property.name} down`}
            title="Move down"
            disabled={index === count - 1}
            onClick={async () => {
              if (await moveProperty(property, index + 1)) onNotice("Couldn’t move the property.");
            }}
          >
            <ArrowDown {...ICON} aria-hidden />
          </button>
          <button
            ref={removeButton}
            type="button"
            className="r2-icon-button"
            aria-label={`Remove ${property.name}`}
            title="Remove property"
            onClick={() => setConfirming(valueCount)}
          >
            <Trash2 {...ICON} aria-hidden />
          </button>
        </span>
      </div>

      {confirming !== null && (
        <div
          className="r2-schema-confirm"
          role="alertdialog"
          aria-label={`Remove ${property.name}?`}
          aria-describedby={confirmId}
          onKeyDown={(e) => {
            // Escape answers this question only — never the panel around it.
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              cancelRemove();
            }
          }}
        >
          <p id={confirmId}>
            {confirming === 0
              ? `Remove “${property.name}”? No ${one} has a value for it.${everywhere}`
              : property.type === "relationship"
                ? `Remove “${property.name}”? Its links in ${plural(confirming, one, many)} will be removed — the things they point to stay.${everywhere} This can’t be undone.`
                : `Remove “${property.name}”? Its value in ${plural(confirming, one, many)} will be deleted.${scene ? " Your prose is untouched." : ""}${everywhere} This can’t be undone.`}
          </p>
          <button
            type="button"
            className="r2-button r2-button--danger"
            disabled={busy}
            autoFocus
            onClick={() => void remove(confirming)}
          >
            Remove
          </button>
          <button type="button" className="r2-button" disabled={busy} onClick={cancelRemove}>
            Cancel
          </button>
        </div>
      )}

      {isChoiceType(property.type) && <OptionsEditor property={property} onNotice={onNotice} />}
    </li>
  );
}
