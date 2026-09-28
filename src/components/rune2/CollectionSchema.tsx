"use client";

import { useEffect, useId, useState } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, Trash2, X } from "lucide-react";
import {
  convertibleTypes,
  countOptionUses,
  countValues,
  isChoiceType,
  PROPERTY_TYPE_LABEL,
} from "@/lib/rune2/collectionProperties";
import { targetPhrase } from "@/lib/rune2/references";
import type { CollectionProperty, CollectionPropertyType } from "@/lib/types";
import { AddProperty } from "./PropertyFields";
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

function plural(n: number, one: string, many = `${one}s`) {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

export function CollectionSchema({ collectionId, collectionTitle }: { collectionId: string; collectionTitle: string }) {
  const { propertiesOf } = usePropertyStore();
  const properties = propertiesOf(collectionId);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  return (
    <section className="r2-schema" aria-label={`Properties of ${collectionTitle}`}>
      {properties.length === 0 ? (
        <p className="r2-schema-intro">
          Properties are the facts every entry can hold — a role, a status, a date. They’re optional; add them only if
          they help.
        </p>
      ) : (
        <ol className="r2-schema-list">
          {properties.map((p, i) => (
            <SchemaRow key={p.id} property={p} index={i} count={properties.length} onNotice={setNotice} />
          ))}
        </ol>
      )}
      <AddProperty collectionId={collectionId} />
      {notice && (
        <p role="status" className="r2-doc-note">
          {notice}
        </p>
      )}
    </section>
  );
}

function SchemaRow({
  property,
  index,
  count,
  onNotice,
}: {
  property: CollectionProperty;
  index: number;
  count: number;
  onNotice: (message: string) => void;
}) {
  const { values, updateProperty, moveProperty, deleteProperty, updateRelationship } = usePropertyStore();
  const { index: objects } = useRune2Selection();
  const { available: viewable } = useViewStore();
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

  return (
    <li className="r2-schema-row">
      <div className="r2-schema-line">
        <label htmlFor={nameId} className="sr-only">
          Property name
        </label>
        <input
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
            <span className="r2-schema-type" title="Relationship">
              → {targetPhrase(property, (id) => objects.get(id)?.title ?? "a collection")}
            </span>
            <select
              className="r2-schema-type"
              aria-label={`How many ${property.name} an entry holds`}
              value={property.relation_many ? "many" : "one"}
              onChange={(e) =>
                void updateRelationship(property, { many: e.target.value === "many" }).then((error) => {
                  if (error)
                    onNotice(
                      error === "Some entries hold more than one"
                        ? "Some entries hold more than one — remove the extras first."
                        : "That couldn’t be changed."
                    );
                })
              }
            >
              <option value="one">One</option>
              <option value="many">Several</option>
            </select>
          </>
        ) : types.length > 1 ? (
          <select
            className="r2-schema-type"
            aria-label={`Type of ${property.name}`}
            value={property.type}
            onChange={(e) => {
              void updateProperty(property, { type: e.target.value as CollectionPropertyType }).then((r) => {
                if (r.error !== null) onNotice("The type couldn’t be changed.");
              });
            }}
          >
            {types.map((t) => (
              <option key={t} value={t}>
                {PROPERTY_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        ) : (
          <span className="r2-schema-type" title="This type can’t be changed without losing values">
            {PROPERTY_TYPE_LABEL[property.type]}
          </span>
        )}
        <span className="r2-schema-actions">
          {!viewable && (
          <button
            type="button"
            className="r2-icon-button"
            aria-pressed={property.shown_in_list}
            aria-label={`Show ${property.name} in the list`}
            title={property.shown_in_list ? "Shown in the list" : "Not shown in the list"}
            onClick={() => void updateProperty(property, { shown_in_list: !property.shown_in_list })}
          >
            {property.shown_in_list ? (
              <Eye size={14} strokeWidth={1.75} aria-hidden />
            ) : (
              <EyeOff size={14} strokeWidth={1.75} aria-hidden />
            )}
          </button>
          )}
          <button
            type="button"
            className="r2-icon-button"
            aria-label={`Move ${property.name} up`}
            disabled={index === 0}
            onClick={() => void moveProperty(property, index - 1)}
          >
            <ArrowUp size={14} strokeWidth={1.75} aria-hidden />
          </button>
          <button
            type="button"
            className="r2-icon-button"
            aria-label={`Move ${property.name} down`}
            disabled={index === count - 1}
            onClick={() => void moveProperty(property, index + 1)}
          >
            <ArrowDown size={14} strokeWidth={1.75} aria-hidden />
          </button>
          <button
            type="button"
            className="r2-icon-button"
            aria-label={`Remove ${property.name}`}
            onClick={() => setConfirming(valueCount)}
          >
            <Trash2 size={14} strokeWidth={1.75} aria-hidden />
          </button>
        </span>
      </div>

      {confirming !== null && (
        <div className="r2-schema-confirm" role="alertdialog" aria-label={`Remove ${property.name}?`}>
          <p>
            {confirming === 0
              ? `Remove “${property.name}”? No entry has a value for it.`
              : property.type === "relationship"
                ? `Remove “${property.name}”? Its links in ${plural(confirming, "entry", "entries")} will be removed — the things they point to stay. This can’t be undone.`
                : `Remove “${property.name}”? Its value in ${plural(confirming, "entry", "entries")} will be deleted. This can’t be undone.`}
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
          <button type="button" className="r2-button" disabled={busy} onClick={() => setConfirming(null)}>
            Cancel
          </button>
        </div>
      )}

      {isChoiceType(property.type) && <OptionsEditor property={property} onNotice={onNotice} />}
    </li>
  );
}

/** A choice property's options: rename in place, remove (asking first when used), add. */
function OptionsEditor({ property, onNotice }: { property: CollectionProperty; onNotice: (message: string) => void }) {
  const { values, updateProperty } = usePropertyStore();
  const [adding, setAdding] = useState("");
  const [confirm, setConfirm] = useState<{ id: string; uses: number } | null>(null);

  const save = async (options: { id?: string; name: string }[], failure: string) => {
    const r = await updateProperty(property, { options });
    if (r.error !== null) onNotice(r.error === "Each option needs a different name" ? "Each option needs a different name." : failure);
    return r.error === null;
  };

  const removeOption = (id: string) =>
    save(
      property.options.filter((o) => o.id !== id),
      "The option couldn’t be removed."
    ).then(() => setConfirm(null));

  return (
    <div className="r2-schema-options" aria-label={`Options of ${property.name}`} role="group">
      {property.options.map((o) => (
        <OptionChip
          key={o.id}
          name={o.name}
          label={`Option ${o.name}`}
          onRename={(name) =>
            save(
              property.options.map((x) => (x.id === o.id ? { ...x, name } : x)),
              "The option couldn’t be renamed."
            )
          }
          onRemove={() => {
            const uses = countOptionUses(values, property.id, o.id);
            if (uses === 0) void removeOption(o.id);
            else setConfirm({ id: o.id, uses });
          }}
        />
      ))}
      <input
        className="r2-schema-option-add"
        placeholder="Add an option"
        aria-label={`Add an option to ${property.name}`}
        maxLength={100}
        value={adding}
        onChange={(e) => setAdding(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            const name = adding.trim();
            if (!name) return;
            void save([...property.options, { name }], "The option couldn’t be added.").then((ok) => ok && setAdding(""));
          }
        }}
      />
      {confirm && (
        <div className="r2-schema-confirm" role="alertdialog" aria-label="Remove option?">
          <p>
            Remove “{property.options.find((o) => o.id === confirm.id)?.name}”? It will be cleared from{" "}
            {plural(confirm.uses, "entry", "entries")}.
          </p>
          <button type="button" className="r2-button r2-button--danger" autoFocus onClick={() => void removeOption(confirm.id)}>
            Remove
          </button>
          <button type="button" className="r2-button" onClick={() => setConfirm(null)}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

function OptionChip({
  name,
  label,
  onRename,
  onRemove,
}: {
  name: string;
  label: string;
  onRename: (name: string) => Promise<boolean>;
  onRemove: () => void;
}) {
  const [draft, setDraft] = useState(name);
  const [seen, setSeen] = useState(name);
  if (name !== seen) {
    setSeen(name);
    setDraft(name);
  }
  return (
    <span className="r2-schema-option">
      <input
        aria-label={label}
        maxLength={100}
        size={Math.max(draft.length, 2)}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const next = draft.trim();
          if (!next || next === name) setDraft(name);
          else void onRename(next).then((ok) => !ok && setDraft(name));
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            setDraft(name);
          }
        }}
      />
      <button type="button" aria-label={`Remove ${label}`} onClick={onRemove}>
        <X size={11} strokeWidth={2} aria-hidden />
      </button>
    </span>
  );
}
