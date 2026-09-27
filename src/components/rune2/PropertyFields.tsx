"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Check, Plus } from "lucide-react";
import {
  chosenOptions,
  formatDateValue,
  isChoiceType,
  parseNumberInput,
  PROPERTY_TYPE_LABEL,
  PROPERTY_TYPES,
  valueKey,
} from "@/lib/rune2/collectionProperties";
import type { CollectionProperty, CollectionPropertyType, PropertyValue } from "@/lib/types";
import { usePropertyStore } from "./PropertyStore";

// An Entry's properties (migration 026): a quiet block between its title and
// its body — label, value; label, value — like the facts at the head of a
// character sheet, never a form. Every value is edited in place and saved
// when the writer commits it (Enter, leaving the field, choosing an option).
// Empty values read as a faint "Empty". A Collection with no properties shows
// only a faint "Add a property", so a writer who never wants structure never
// has to look at it.
//
// No properties inside the body, and nothing here counts words.

export function EntryProperties({ entryId, collectionId }: { entryId: string; collectionId: string }) {
  const { available, propertiesOf, values } = usePropertyStore();
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  if (!available) return null;
  const properties = propertiesOf(collectionId);

  return (
    <section className="r2-props" aria-label="Properties" data-empty={properties.length === 0 || undefined}>
      {properties.length > 0 && (
        <dl className="r2-props-list">
          {properties.map((p) => (
            <PropertyRow key={p.id} property={p} entryId={entryId} value={values.get(valueKey(entryId, p.id))} onError={setNotice} />
          ))}
        </dl>
      )}
      <AddProperty collectionId={collectionId} quiet />
      {notice && (
        <p role="status" className="r2-doc-note">
          {notice}
        </p>
      )}
    </section>
  );
}

function PropertyRow({
  property,
  entryId,
  value,
  onError,
}: {
  property: CollectionProperty;
  entryId: string;
  value: PropertyValue | undefined;
  onError: (message: string) => void;
}) {
  const { setValue } = usePropertyStore();
  const labelId = useId();
  const save = async (next: PropertyValue | null) => {
    const error = await setValue(entryId, property.id, next);
    if (error) onError(`“${property.name}” couldn’t be saved.`);
  };
  return (
    <div className="r2-prop">
      <dt id={labelId} className="r2-prop-label" title={PROPERTY_TYPE_LABEL[property.type]}>
        {property.name}
      </dt>
      <dd className="r2-prop-value">
        <PropertyValueEditor property={property} value={value} labelId={labelId} onSave={save} />
      </dd>
    </div>
  );
}

function PropertyValueEditor({
  property,
  value,
  labelId,
  onSave,
}: {
  property: CollectionProperty;
  value: PropertyValue | undefined;
  labelId: string;
  onSave: (value: PropertyValue | null) => Promise<void>;
}) {
  switch (property.type) {
    case "text":
      return <TextValue value={typeof value === "string" ? value : ""} labelId={labelId} onSave={onSave} />;
    case "number":
      return <NumberValue value={typeof value === "number" ? value : null} labelId={labelId} onSave={onSave} />;
    case "date":
      return <DateValue value={typeof value === "string" ? value : ""} labelId={labelId} onSave={onSave} />;
    case "checkbox":
      return (
        <button
          type="button"
          role="checkbox"
          aria-checked={value === true}
          aria-labelledby={labelId}
          className="r2-prop-check"
          onClick={() => void onSave(value === true ? null : true)}
        >
          <span className="r2-prop-checkbox" aria-hidden>
            {value === true && <Check size={11} strokeWidth={2.5} />}
          </span>
        </button>
      );
    case "select":
    case "status":
    case "multi_select":
      return <ChoiceValue property={property} value={value} labelId={labelId} onSave={onSave} />;
  }
}

/** A text value: grows with its text, Enter commits, Escape restores. */
function TextValue({
  value,
  labelId,
  onSave,
}: {
  value: string;
  labelId: string;
  onSave: (value: PropertyValue | null) => Promise<void>;
}) {
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    if (!editing) setDraft(value);
  }
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);

  const commit = () => {
    const next = draft.trim();
    if (next !== value) void onSave(next || null);
  };
  return (
    <textarea
      ref={ref}
      className="r2-prop-input"
      aria-labelledby={labelId}
      placeholder="Empty"
      rows={1}
      maxLength={2000}
      value={draft}
      onFocus={() => setEditing(true)}
      onChange={(e) => setDraft(e.target.value.replace(/\n/g, " "))}
      onBlur={() => {
        setEditing(false);
        commit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          setDraft(value);
          setEditing(false);
          requestAnimationFrame(() => ref.current?.blur());
        }
      }}
    />
  );
}

function NumberValue({
  value,
  labelId,
  onSave,
}: {
  value: number | null;
  labelId: string;
  onSave: (value: PropertyValue | null) => Promise<void>;
}) {
  const shown = value === null ? "" : String(value);
  const [draft, setDraft] = useState(shown);
  const [editing, setEditing] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [seen, setSeen] = useState(shown);
  if (shown !== seen) {
    setSeen(shown);
    if (!editing) setDraft(shown);
  }

  const commit = () => {
    if (!draft.trim()) {
      setInvalid(false);
      if (value !== null) void onSave(null);
      return;
    }
    const n = parseNumberInput(draft);
    if (n === null) {
      setInvalid(true);
      setDraft(shown);
      return;
    }
    setInvalid(false);
    setDraft(String(n));
    if (n !== value) void onSave(n);
  };
  return (
    <>
      <input
        className="r2-prop-input"
        aria-labelledby={labelId}
        aria-invalid={invalid || undefined}
        inputMode="decimal"
        placeholder="Empty"
        value={editing ? draft : value === null ? "" : value.toLocaleString()}
        onFocus={() => {
          setEditing(true);
          setDraft(shown);
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false);
          commit();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            setDraft(shown);
            setInvalid(false);
            e.currentTarget.blur();
          }
        }}
      />
      {invalid && <span className="r2-prop-hint">Not a number</span>}
    </>
  );
}

function DateValue({
  value,
  labelId,
  onSave,
}: {
  value: string;
  labelId: string;
  onSave: (value: PropertyValue | null) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  if (!editing) {
    return (
      <button type="button" className="r2-prop-button" aria-labelledby={labelId} onClick={() => setEditing(true)}>
        {value ? formatDateValue(value) : <span className="r2-prop-empty">Empty</span>}
      </button>
    );
  }
  return (
    <input
      ref={ref}
      type="date"
      className="r2-prop-input r2-prop-date"
      aria-labelledby={labelId}
      defaultValue={value}
      onBlur={(e) => {
        setEditing(false);
        const next = e.currentTarget.value;
        if (next !== value && (next === "" || /^\d{4}-\d{2}-\d{2}$/.test(next))) void onSave(next || null);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        else if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          e.currentTarget.value = value;
          e.currentTarget.blur();
        }
      }}
    />
  );
}

/** A select, status or multi-select value: its chosen options, and a picker to change them. */
function ChoiceValue({
  property,
  value,
  labelId,
  onSave,
}: {
  property: CollectionProperty;
  value: PropertyValue | undefined;
  labelId: string;
  onSave: (value: PropertyValue | null) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const chosen = chosenOptions(property, value);
  return (
    <div className="r2-prop-choice">
      <button
        ref={button}
        type="button"
        className="r2-prop-button"
        aria-labelledby={labelId}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {chosen.length === 0 ? (
          <span className="r2-prop-empty">Empty</span>
        ) : (
          <OptionNames property={property} names={chosen.map((o) => o.name)} />
        )}
      </button>
      {open && (
        <OptionPicker
          property={property}
          value={value}
          onSave={onSave}
          onClose={(refocus) => {
            setOpen(false);
            if (refocus) button.current?.focus();
          }}
        />
      )}
    </div>
  );
}

/** Chosen options as text: a status carries a small mark; several read as a list. */
export function OptionNames({ property, names }: { property: CollectionProperty; names: string[] }): ReactNode {
  return (
    <span className="r2-prop-options" data-type={property.type}>
      {names.map((n, i) => (
        <span key={`${n}-${i}`} className="r2-prop-option">
          {n}
        </span>
      ))}
    </span>
  );
}

/**
 * Choose among a property's options, or type a new one to create it. A
 * single choice closes on choosing; a multi-select stays open. Arrows move,
 * Enter chooses, Escape closes.
 */
function OptionPicker({
  property,
  value,
  onSave,
  onClose,
}: {
  property: CollectionProperty;
  value: PropertyValue | undefined;
  onSave: (value: PropertyValue | null) => Promise<void>;
  onClose: (refocus: boolean) => void;
}) {
  const { updateProperty } = usePropertyStore();
  const ref = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const multi = property.type === "multi_select";
  const chosenIds = value === undefined ? [] : Array.isArray(value) ? value : [String(value)];

  const q = query.trim();
  const matches = property.options.filter((o) => o.name.toLowerCase().includes(q.toLowerCase()));
  const exact = property.options.some((o) => o.name.toLowerCase() === q.toLowerCase());
  const canCreate = q !== "" && !exact;
  const count = matches.length + (canCreate ? 1 : 0);

  // Close on a pointer press outside the value (its own button toggles it).
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const cell = ref.current?.parentElement;
      if (cell && !cell.contains(e.target as Node)) onClose(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [onClose]);

  const choose = (id: string) => {
    if (multi) {
      const next = chosenIds.includes(id) ? chosenIds.filter((x) => x !== id) : [...chosenIds, id];
      void onSave(next.length ? next : null);
    } else {
      void onSave(chosenIds[0] === id ? null : id);
      onClose(true);
    }
  };

  const create = async () => {
    if (!canCreate || busy) return;
    setBusy(true);
    setError(null);
    const r = await updateProperty(property, { options: [...property.options, { name: q }] });
    setBusy(false);
    if (r.error !== null) {
      setError("Couldn’t add that option.");
      return;
    }
    const made = r.property.options.find((o) => o.name.toLowerCase() === q.toLowerCase());
    setQuery("");
    setActive(0);
    if (made) choose(made.id);
  };

  const pick = (i: number) => {
    if (i < matches.length) choose(matches[i].id);
    else void create();
  };

  return (
    <div ref={ref} className="r2-prop-picker">
      <input
        autoFocus
        className="r2-prop-picker-input"
        placeholder={property.options.length ? "Find or add an option…" : "Add an option…"}
        aria-label={`Options for ${property.name}`}
        aria-controls={listId}
        aria-activedescendant={count ? `${listId}-${Math.min(active, count - 1)}` : undefined}
        maxLength={100}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, Math.max(count - 1, 0)));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (count) pick(Math.min(active, count - 1));
          } else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            onClose(true);
          } else if (e.key === "Tab") {
            onClose(false);
          }
        }}
      />
      <ul id={listId} role="listbox" aria-multiselectable={multi || undefined} className="r2-prop-picker-list">
        {matches.map((o, i) => (
          <li
            key={o.id}
            id={`${listId}-${i}`}
            role="option"
            aria-selected={chosenIds.includes(o.id)}
            data-active={i === active || undefined}
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => choose(o.id)}
            onPointerEnter={() => setActive(i)}
          >
            <span className="r2-prop-picker-mark" aria-hidden>
              {chosenIds.includes(o.id) && <Check size={12} strokeWidth={2} />}
            </span>
            <OptionNames property={property} names={[o.name]} />
          </li>
        ))}
        {canCreate && (
          <li
            id={`${listId}-${matches.length}`}
            role="option"
            aria-selected={false}
            data-active={active === matches.length || undefined}
            aria-disabled={busy || undefined}
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => void create()}
            onPointerEnter={() => setActive(matches.length)}
          >
            <span className="r2-prop-picker-mark" aria-hidden>
              <Plus size={12} strokeWidth={2} />
            </span>
            Add “{q}”
          </li>
        )}
      </ul>
      {count === 0 && <p className="r2-prop-picker-empty">No options yet. Type one to add it.</p>}
      {chosenIds.length > 0 && (
        <button
          type="button"
          className="r2-prop-picker-clear"
          onClick={() => {
            void onSave(null);
            onClose(true);
          }}
        >
          Clear
        </button>
      )}
      {error && (
        <p role="status" className="r2-doc-note">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * "Add a property": a name and a type, added at the end of the Collection's
 * properties. `quiet`: the faint form in an Entry; otherwise the Collection's
 * property settings.
 */
export function AddProperty({ collectionId, quiet = false }: { collectionId: string; quiet?: boolean }) {
  const { createProperty } = usePropertyStore();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<CollectionPropertyType>("text");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameId = useId();

  if (!open) {
    return (
      <button type="button" className="r2-prop-add" data-quiet={quiet || undefined} onClick={() => setOpen(true)}>
        <Plus size={13} strokeWidth={1.75} aria-hidden />
        Add a property
      </button>
    );
  }

  const submit = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    const e = await createProperty(collectionId, name.trim(), type);
    setBusy(false);
    if (e) {
      setError(e === "A property with this name already exists" ? "There’s already a property with that name." : "Couldn’t add the property.");
      return;
    }
    setName("");
    setType("text");
    setOpen(false);
  };

  return (
    <form
      className="r2-prop-new"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          setOpen(false);
        }
      }}
    >
      <label htmlFor={nameId} className="sr-only">
        Property name
      </label>
      <input
        id={nameId}
        autoFocus
        className="r2-prop-new-name"
        placeholder="Property name"
        maxLength={100}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <select
        className="r2-prop-new-type"
        aria-label="Property type"
        value={type}
        onChange={(e) => setType(e.target.value as CollectionPropertyType)}
      >
        {PROPERTY_TYPES.map((t) => (
          <option key={t} value={t}>
            {PROPERTY_TYPE_LABEL[t]}
          </option>
        ))}
      </select>
      <button type="submit" className="r2-button r2-button--primary" disabled={busy || !name.trim()}>
        Add
      </button>
      <button type="button" className="r2-button" onClick={() => setOpen(false)}>
        Cancel
      </button>
      {error && (
        <p role="status" className="r2-doc-note r2-prop-new-error">
          {error}
        </p>
      )}
      {isChoiceType(type) && <p className="r2-prop-new-hint">Options are added as you use it.</p>}
    </form>
  );
}
