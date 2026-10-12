"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Check, ChevronDown, ChevronRight, Pencil, Plus } from "lucide-react";
import { ICON, ICON_SM, ICON_CHECK, ICON_SM_BOLD } from "./icons";
import {
  chosenOptions,
  formatDateValue,
  formatValue,
  isSceneProperty,
  parseNumberInput,
  PROPERTY_TYPE_LABEL,
  valueKey,
} from "@/lib/rune2/collectionProperties";
import {
  isCollapsed,
  readCollapsedCollections,
  withCollapsed,
  writeCollapsedCollections,
  type CollapsedCollections,
} from "@/lib/rune2/entryPropertyPrefs";
import { describeObject, targetSpecOf } from "@/lib/rune2/references";
import type { PropertyDefinition, PropertyValue } from "@/lib/types";
import { useProfileStore } from "@/store/profileStore";
import { AddPropertyButton, PROPERTY_TYPE_ICON, PropertyMenu } from "./PropertyMenus";
import { ObjectPicker } from "./ObjectPicker";
import { useFloating } from "./useFloating";
import { usePropertyStore } from "./PropertyStore";
import { useRune2Selection } from "./Rune2Selection";
import { useOpenObject } from "./useOpenObject";

// An Entry's properties (migration 026): a quiet block between its title and
// its body — label, value; label, value — like the facts at the head of a
// character sheet, never a form. Every value is edited in place and saved
// when the writer commits it (Enter, leaving the field, choosing an option).
// Empty values read as a faint "Empty". A Collection with no properties shows
// only a faint "Add a property", so a writer who never wants structure never
// has to look at it.
//
// A Relationship (028) shows its targets by their current titles, each one a
// quiet link that opens it, and chooses them with a search over the objects
// the writer already has — never a copy, never a foreign-key form.
//
// No properties inside the body, and nothing here counts words.
//
// A Scene's properties (032) use the same rows and editors, in the Inspector
// — never inside the prose. Their values are saved on their own
// (scene_property_values, object_references), never with the Scene's
// content: changing "Status" never touches the words being written beside it.
//
// On an Entry (Milestone 21E.2) the block has a quiet heading of its own,
// "Properties · 5", which folds it: collapsed, the rows are hidden and the
// title and body have the room, the count stays and says how many are
// filled — never their values. The choice is remembered on this device per
// writer and per Collection (entryPropertyPrefs), so a Collection whose facts
// matter stays open and one whose facts are secondary stays folded. Nothing
// is ever hidden for good: a click brings the rows back.
//
// The Collection's properties can also be edited from here — renamed,
// retyped, their options changed, removed — through a row's own pencil, which
// opens that property's menu (PropertyMenu) beside its label. It is the
// Collection's schema that changes, for every Entry; nothing is ever an
// Entry's own property.

export function EntryProperties({ entryId, collectionId }: { entryId: string; collectionId: string }) {
  const { available, propertiesOf, values } = usePropertyStore();
  const { index } = useRune2Selection();
  const userId = useProfileStore((s) => s.profile?.id);
  const [collapsed, setCollapsed] = useCollapsedProperties(userId, collectionId);
  const titleOf = (id: string) => describeObject(index, id)?.title;
  if (!available) return null;

  const properties = propertiesOf(collectionId);
  // No properties: only the faint "Add a property", as before — no heading to fold.
  if (properties.length === 0) return <ItemProperties itemId={entryId} ownerId={collectionId} />;

  const filled = properties.filter((p) => formatValue(p, values.get(valueKey(entryId, p.id)), titleOf) !== null).length;
  const open = !collapsed;
  return (
    <section className="r2-props r2-props--entry" aria-label="Properties" data-collapsed={collapsed || undefined}>
      <div className="r2-props-head">
        <button
          type="button"
          className="r2-props-toggle"
          aria-expanded={open}
          onClick={() => setCollapsed(open)}
          title={open ? "Hide properties" : "Show properties"}
        >
          {open ? <ChevronDown {...ICON_SM} aria-hidden /> : <ChevronRight {...ICON_SM} aria-hidden />}
          <span>Properties</span>
          <span className="r2-props-count">· {properties.length}</span>
          {collapsed && filled > 0 && (
            <span className="r2-props-hint">
              {filled} filled
            </span>
          )}
        </button>
      </div>
      {open && <PropertyRows itemId={entryId} ownerId={collectionId} />}
    </section>
  );
}

// The remembered folds, one tiny store (as revisionNotePrefs): every open
// Entry agrees, and the device's copy is read once the writer is known.
let folds: CollapsedCollections = {};
let foldsReadFor: string | undefined;
const foldListeners = new Set<() => void>();
function setFolds(next: CollapsedCollections) {
  folds = next;
  for (const fn of foldListeners) fn();
}
const subscribeFolds = (fn: () => void) => {
  foldListeners.add(fn);
  return () => {
    foldListeners.delete(fn);
  };
};
const getFolds = () => folds;

/** The writer's remembered fold for one Collection's properties, and the way to change it. */
function useCollapsedProperties(userId: string | undefined, collectionId: string): [boolean, (collapsed: boolean) => void] {
  useEffect(() => {
    if (!userId || userId === foldsReadFor) return;
    foldsReadFor = userId;
    setFolds(readCollapsedCollections(userId));
  }, [userId]);
  const map = useSyncExternalStore(subscribeFolds, getFolds, getFolds);
  const set = (collapsed: boolean) => {
    const next = withCollapsed(map, collectionId, collapsed);
    setFolds(next);
    writeCollapsedCollections(foldsReadFor, next);
  };
  return [isCollapsed(map, collectionId), set];
}

/** Up to this many properties, every one shows; past it, empty ones fold behind "Show all". */
const UNFOLDED_PROPERTIES = 4;

/**
 * One item's properties — an Entry's (its Collection's properties) or a
 * Scene's (its Manuscript's) — label, value; each edited in place.
 * `empty`: shown instead of the faint "Add a property" when there are none.
 *
 * Filled properties lead. A Collection with many properties shows an item's
 * filled ones and folds the empty ones behind "Show all" (never when nothing
 * is filled — there would be nothing to lead with), so the facts that are
 * there are read first and metadata never becomes the page. Unfolding is
 * for this item while it is open; a property just added here is shown.
 */
export function ItemProperties({ itemId, ownerId, empty }: { itemId: string; ownerId: string; empty?: ReactNode }) {
  const { propertiesOf } = usePropertyStore();
  const count = propertiesOf(ownerId).length;
  return (
    <section className="r2-props" aria-label="Properties" data-empty={count === 0 || undefined}>
      <PropertyRows itemId={itemId} ownerId={ownerId} empty={empty} />
    </section>
  );
}

/**
 * The rows of one item's properties (label, value; each edited in place),
 * the fold of its empty ones, and "Add a property" — what ItemProperties
 * and an Entry's foldable block both show. Each row offers its own pencil,
 * which opens that property's menu (name, type, options, removal).
 */
function PropertyRows({ itemId, ownerId, empty }: { itemId: string; ownerId: string; empty?: ReactNode }) {
  const { propertiesOf, values } = usePropertyStore();
  const [notice, setNotice] = useState<string | null>(null);
  const [unfolded, setUnfolded] = useState(false);
  const { index } = useRune2Selection();
  // A Relationship is filled when it points at something that still exists.
  const titleOf = (id: string) => describeObject(index, id)?.title;

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  const properties = propertiesOf(ownerId);
  const filled = properties.filter((p) => formatValue(p, values.get(valueKey(itemId, p.id)), titleOf) !== null);
  const folds = !unfolded && properties.length > UNFOLDED_PROPERTIES && filled.length > 0 && filled.length < properties.length;
  const shown = folds ? filled : properties;
  const hidden = properties.length - shown.length;

  return (
    <>
      {shown.length > 0 && (
        <dl className="r2-props-list">
          {shown.map((p) => (
            <PropertyRow
              key={p.id}
              property={p}
              itemId={itemId}
              value={values.get(valueKey(itemId, p.id))}
              onError={setNotice}
            />
          ))}
        </dl>
      )}
      {properties.length === 0 && empty ? (
        empty
      ) : (
        <div className="r2-props-foot">
          {hidden > 0 && (
            <button type="button" className="r2-prop-add" data-quiet="" onClick={() => setUnfolded(true)}>
              <ChevronDown {...ICON} aria-hidden />
              Show all {properties.length}
            </button>
          )}
          <AddProperty ownerId={ownerId} quiet onCreated={() => setUnfolded(true)} />
        </div>
      )}
      {notice && (
        <p role="status" className="r2-doc-note">
          {notice}
        </p>
      )}
    </>
  );
}

function PropertyRow({
  property,
  itemId,
  value,
  onError,
}: {
  property: PropertyDefinition;
  itemId: string;
  value: PropertyValue | undefined;
  onError: (message: string) => void;
}) {
  const { setValue } = usePropertyStore();
  const labelId = useId();
  const [menu, setMenu] = useState(false);
  const pencil = useRef<HTMLButtonElement>(null);
  const save = async (next: PropertyValue | null) => {
    const error = await setValue(itemId, property.id, next);
    if (error) onError(`“${property.name}” couldn’t be saved.`);
  };
  const Icon = PROPERTY_TYPE_ICON[property.type];
  return (
    <div className="r2-prop" data-menu-open={menu || undefined}>
      <dt className="r2-prop-label" title={PROPERTY_TYPE_LABEL[property.type]}>
        <Icon {...ICON_SM} aria-hidden className="r2-prop-label-icon" />
        <span id={labelId} className="r2-prop-label-text">
          {property.name}
        </span>
        <button
          ref={pencil}
          type="button"
          className="r2-prop-edit"
          aria-label={`Edit the property ${property.name}`}
          aria-haspopup="dialog"
          aria-expanded={menu}
          title={`Edit “${property.name}” — for every ${isSceneProperty(property) ? "scene" : "entry"}`}
          onClick={() => setMenu((m) => !m)}
        >
          <Pencil {...ICON_SM} aria-hidden />
        </button>
        {menu && <PropertyMenu property={property} anchor={() => pencil.current} onClose={() => setMenu(false)} />}
      </dt>
      <dd className="r2-prop-value">
        <PropertyValueEditor property={property} value={value} labelId={labelId} onSave={save} ownerId={itemId} />
      </dd>
    </div>
  );
}

/**
 * One value, edited in place — the same editor wherever a value appears (an
 * Entry's properties, a Table cell), writing the one canonical value.
 * `labelId`: the id(s) naming it. Its pickers float over the page
 * (useFloating), so they open the same in a Table cell as in the Inspector.
 */
export function PropertyValueEditor({
  property,
  value,
  labelId,
  onSave,
  ownerId,
}: {
  property: PropertyDefinition;
  value: PropertyValue | undefined;
  labelId: string;
  onSave: (value: PropertyValue | null) => Promise<void>;
  /** The Entry or Scene the value belongs to (never offered as its own Relationship target). */
  ownerId?: string;
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
          <span className="r2-checkbox r2-prop-checkbox" aria-hidden>
            {value === true && <Check {...ICON_CHECK} />}
          </span>
        </button>
      );
    case "select":
    case "status":
    case "multi_select":
      return <ChoiceValue property={property} value={value} labelId={labelId} onSave={onSave} />;
    case "relationship":
      return (
        <RelationshipValue
          property={property}
          value={value}
          labelId={labelId}
          onSave={onSave}
          ownerId={ownerId}
        />
      );
  }
}

/**
 * A Relationship value: its targets by their current titles, each opening
 * its object (⌘/Ctrl-click: a tab of its own), and a search to choose them.
 * A target no longer present is simply not shown.
 */
function RelationshipValue({
  property,
  value,
  labelId,
  onSave,
  ownerId,
}: {
  property: PropertyDefinition;
  value: PropertyValue | undefined;
  labelId: string;
  onSave: (value: PropertyValue | null) => Promise<void>;
  ownerId?: string;
}) {
  const { index } = useRune2Selection();
  const openObject = useOpenObject();
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const spec = targetSpecOf(property);
  const ids = Array.isArray(value) ? value : [];
  const shown = ids.flatMap((id) => {
    const d = describeObject(index, id);
    return d ? [{ id, ...d }] : [];
  });
  const many = property.relation_many;

  if (!spec) return <span className="r2-prop-empty">—</span>;
  return (
    <div className="r2-prop-choice r2-prop-relation">
      {shown.length > 0 && (
        <span className="r2-prop-links">
          {shown.map((t) => (
            <button key={t.id} type="button" className="r2-prop-link" title={`Open ${t.title} · ${t.hint}`} {...openObject(t.id)}>
              {t.title}
            </button>
          ))}
        </span>
      )}
      <button
        ref={button}
        type="button"
        className={shown.length ? "r2-prop-relation-edit" : "r2-prop-button"}
        aria-labelledby={shown.length ? undefined : labelId}
        aria-label={shown.length ? `Change ${property.name}` : undefined}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={shown.length ? `Change ${property.name}` : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        {shown.length ? <Plus {...ICON_SM} aria-hidden /> : <span className="r2-prop-empty">Empty</span>}
      </button>
      {open && (
        <ObjectPicker
          spec={spec}
          chosen={ids}
          multi={many}
          label={property.name}
          exclude={ownerId ? new Set([ownerId]) : undefined}
          onChoose={(c) => {
            if (!many) void onSave(ids[0] === c.id ? null : [c.id]);
            else void onSave(ids.includes(c.id) ? ids.filter((x) => x !== c.id) : [...ids, c.id]);
          }}
          onClear={() => void onSave(null)}
          onClose={(refocus) => {
            setOpen(false);
            if (refocus) button.current?.focus();
          }}
        />
      )}
    </div>
  );
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
  property: PropertyDefinition;
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
export function OptionNames({ property, names }: { property: PropertyDefinition; names: string[] }): ReactNode {
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
  property: PropertyDefinition;
  value: PropertyValue | undefined;
  onSave: (value: PropertyValue | null) => Promise<void>;
  onClose: (refocus: boolean) => void;
}) {
  const { updateProperty } = usePropertyStore();
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  // Over the page, under its value, whole inside the window; it lines its
  // text up with the value's and opens inward near the window's edge. It never
  // widens or scrolls the column it was opened in.
  useFloating(ref, { inset: 6, onAway: () => close.current(false) });
  useLayoutEffect(() => {
    ref.current?.querySelector("input")?.focus({ preventScroll: true });
  }, []);
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

  // The keyboard's row stays in sight as the arrows move past the list's edge.
  useEffect(() => {
    document.getElementById(`${listId}-${Math.min(active, count - 1)}`)?.scrollIntoView({ block: "nearest" });
  }, [listId, active, count]);

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
        className="r2-field r2-prop-picker-input"
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
              {chosenIds.includes(o.id) && <Check {...ICON_SM_BOLD} />}
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
              <Plus {...ICON_SM_BOLD} />
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
 * "Add a property": opens the small popover (PropertyMenus) that makes one —
 * a name, then the type — at the end of the owner's properties: a
 * Collection's, or (given the Manuscript's id) its Scene properties.
 * `quiet`: the faint form in an Entry or the Inspector.
 */
export function AddProperty({
  ownerId,
  quiet = false,
  onCreated,
}: {
  ownerId: string;
  quiet?: boolean;
  /** After a property is added (ItemProperties unfolds, so the new one shows). */
  onCreated?: () => void;
}) {
  return <AddPropertyButton ownerId={ownerId} quiet={quiet} onCreated={onCreated} />;
}
