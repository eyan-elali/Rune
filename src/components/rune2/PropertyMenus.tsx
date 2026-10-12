"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  CircleDashed,
  CircleDot,
  Hash,
  Link2,
  ListChecks,
  Plus,
  SquareCheck,
  Trash2,
  Type,
  X,
  type LucideIcon,
} from "lucide-react";
import { ICON, ICON_SM_BOLD } from "./icons";
import {
  convertibleTypes,
  countOptionUses,
  countValues,
  isChoiceType,
  isSceneProperty,
  PROPERTY_TYPE_LABEL,
  PROPERTY_TYPES,
} from "@/lib/rune2/collectionProperties";
import { targetPhrase } from "@/lib/rune2/references";
import type { CollectionPropertyType, PropertyDefinition, ReferenceObjectType } from "@/lib/types";
import { NavigatorMenu } from "./NavigatorMenu";
import { usePropertyStore } from "./PropertyStore";
import { useRune2Selection } from "./Rune2Selection";
import { useFloating } from "./useFloating";

// Properties, configured where they are: two small popovers and one select,
// so a Collection (or the Manuscript's Scene properties) is never managed
// from a form above its Entries.
//
//   AddPropertyPopover — hung from "+ Add property" at the end of a Table's
//                        header (or the faint "Add a property" under an
//                        item's facts): a name, then the type as a list;
//                        choosing a type makes the column. A Relationship
//                        asks one more thing — what it points to.
//   PropertyMenu       — hung from a column header or a row's pencil: the
//                        property's name (edited in place), its type (where
//                        a change keeps every value), a choice property's
//                        options, its place among the columns, and its end.
//   MenuSelect         — a value chosen from a short list, as a Rune menu
//                        rather than the browser's own select.
//
// Nothing here touches a value's prose, and removing a property always asks
// first and says how many values go with it (PropertyStore.deleteProperty).

export const PROPERTY_TYPE_ICON: Record<CollectionPropertyType, LucideIcon> = {
  text: Type,
  number: Hash,
  select: CircleDot,
  multi_select: ListChecks,
  status: CircleDashed,
  date: CalendarDays,
  checkbox: SquareCheck,
  relationship: Link2,
};

/**
 * A new Status starts with three stages in a writer's words — the usual
 * shape of a Scene, a chapter or a character sketch — so the first click on
 * a cell has something to choose. They are the property's own options:
 * renamed or removed from its menu like any other.
 */
export const STATUS_DEFAULTS = ["Planned", "Drafting", "Done"];

function plural(n: number, one: string, many = `${one}s`) {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

// ── Popover frame ───────────────────────────────────────────────────────────

/**
 * A small surface hung from its control (useFloating): Escape and a press
 * outside close it, and focus returns to the control unless the writer put
 * it somewhere else. The first field takes focus when it opens.
 */
function Pop({
  anchor,
  label,
  className,
  onClose,
  children,
  onKeyDown,
  align = "start",
}: {
  anchor: () => Element | null | undefined;
  label: string;
  className?: string;
  onClose: () => void;
  children: ReactNode;
  onKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void;
  align?: "start" | "end";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useFloating(ref, { anchor, align, gap: 4, onAway: () => close.current() });

  // The control that opened it is noted before the first field takes focus,
  // and the keyboard goes back to it when the surface closes — unless the
  // writer put it somewhere else on purpose.
  useLayoutEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const el = ref.current;
    el?.querySelector<HTMLElement>("input, [data-menu-item], button")?.focus({ preventScroll: true });
    return () => {
      const now = document.activeElement;
      if (!now || now === document.body || el?.contains(now)) opener?.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const a = anchor();
      const t = e.target as Node;
      if (ref.current?.contains(t) || a?.contains(t)) return;
      close.current();
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [anchor]);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={label}
      className={`r2-popover r2-prop-menu${className ? ` ${className}` : ""}`}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          onClose();
          return;
        }
        onKeyDown?.(e);
      }}
    >
      {children}
    </div>
  );
}

/** ↑/↓ between a popover's list items, and from its field into the list. */
function moveInList(e: KeyboardEvent<HTMLElement>) {
  if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
  const root = e.currentTarget.closest(".r2-prop-menu");
  const items = [...(root?.querySelectorAll<HTMLElement>("[data-menu-item]") ?? [])];
  if (items.length === 0) return;
  e.preventDefault();
  const at = items.indexOf(document.activeElement as HTMLElement);
  const next = at < 0 ? (e.key === "ArrowDown" ? 0 : items.length - 1) : (at + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
  items[next]?.focus();
}

// ── Add a property ──────────────────────────────────────────────────────────

/**
 * "+ Add property" and its popover. `quiet`: the faint form under an item's
 * facts. `compact`: the header's own control — a plus and a word.
 */
export function AddPropertyButton({
  ownerId,
  quiet = false,
  compact = false,
  label = "Add a property",
  onCreated,
  className,
}: {
  ownerId: string;
  quiet?: boolean;
  compact?: boolean;
  label?: string;
  onCreated?: () => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={button}
        type="button"
        className={className ?? (compact ? "r2-table-add-prop" : "r2-prop-add")}
        data-quiet={quiet || undefined}
        data-add-property=""
        aria-haspopup="dialog"
        aria-expanded={open}
        title={compact ? "Add a property" : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <Plus {...ICON} aria-hidden />
        <span>{label}</span>
      </button>
      {open && (
        <AddPropertyPopover
          ownerId={ownerId}
          anchor={() => button.current}
          onClose={() => setOpen(false)}
          onCreated={() => {
            setOpen(false);
            onCreated?.();
          }}
        />
      )}
    </>
  );
}

export function AddPropertyPopover({
  ownerId,
  anchor,
  onClose,
  onCreated,
}: {
  ownerId: string;
  anchor: () => Element | null | undefined;
  onClose: () => void;
  onCreated?: () => void;
}) {
  const { createProperty, createRelationship, relatable, manuscriptId, propertiesOf } = usePropertyStore();
  const { workspace, index } = useRune2Selection();
  const forScenes = ownerId === manuscriptId;
  const [name, setName] = useState("");
  const [step, setStep] = useState<"type" | "relationship">("type");
  const [many, setMany] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameId = useId();
  const types = PROPERTY_TYPES.filter((t) => t !== "relationship" || relatable);
  const taken = new Set(propertiesOf(ownerId).map((p) => p.name.toLowerCase()));

  /** The typed name, or the type's own word — made distinct if that is taken ("Status 2"). */
  const nameFor = (type: CollectionPropertyType) => {
    const typed = name.trim();
    if (typed) return typed;
    const base = PROPERTY_TYPE_LABEL[type];
    if (!taken.has(base.toLowerCase())) return base;
    for (let n = 2; n < 50; n++) if (!taken.has(`${base} ${n}`.toLowerCase())) return `${base} ${n}`;
    return base;
  };

  const fail = (e: string | null) =>
    setError(e === "A property with this name already exists" ? "There’s already a property with that name." : "Couldn’t add the property.");

  const create = async (type: CollectionPropertyType) => {
    if (busy) return;
    if (type === "relationship") {
      setStep("relationship");
      return;
    }
    setBusy(true);
    setError(null);
    const e = await createProperty(ownerId, nameFor(type), type, type === "status" ? STATUS_DEFAULTS : undefined);
    setBusy(false);
    if (e) return fail(e);
    onCreated?.();
  };

  const createRelation = async (target: ReferenceObjectType, collectionId: string | null) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const e = await createRelationship(ownerId, nameFor("relationship"), target, collectionId, many);
    setBusy(false);
    if (e) return fail(e);
    onCreated?.();
  };

  const collectionTitle = (id: string) => index.get(id)?.title ?? "Untitled collection";

  return (
    <Pop anchor={anchor} label="Add a property" onClose={onClose} align="end">
      <label htmlFor={nameId} className="sr-only">
        Property name
      </label>
      <input
        id={nameId}
        className="r2-prop-menu-name"
        placeholder="Property name"
        maxLength={100}
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setError(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void create("text");
          } else moveInList(e);
        }}
      />
      {step === "type" ? (
        <>
          <p className="r2-menu-section" aria-hidden>
            Type
          </p>
          <div role="group" aria-label="Property type" className="r2-prop-menu-list">
            {types.map((t) => {
              const Icon = PROPERTY_TYPE_ICON[t];
              return (
                <button
                  key={t}
                  type="button"
                  data-menu-item
                  className="r2-menu-item"
                  disabled={busy}
                  onClick={() => void create(t)}
                  onKeyDown={moveInList}
                >
                  <span className="r2-menu-icon" aria-hidden>
                    <Icon {...ICON} />
                  </span>
                  <span className="r2-menu-label">{PROPERTY_TYPE_LABEL[t]}</span>
                  {t === "relationship" && <ArrowRight {...ICON} aria-hidden className="r2-menu-more" />}
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <>
          <div className="r2-prop-menu-row">
            <button type="button" className="r2-prop-menu-back" onClick={() => setStep("type")} aria-label="Back to the types">
              <ArrowLeft {...ICON} aria-hidden />
            </button>
            <p className="r2-menu-section" aria-hidden>
              Points to
            </p>
            <span className="r2-tool-seg r2-prop-menu-seg" role="group" aria-label="How many">
              <button type="button" aria-pressed={!many} onClick={() => setMany(false)}>
                One
              </button>
              <button type="button" aria-pressed={many} onClick={() => setMany(true)}>
                Several
              </button>
            </span>
          </div>
          <div role="group" aria-label="What this property points to" className="r2-prop-menu-list">
            {workspace.collections.map((c) => (
              <button
                key={c.id}
                type="button"
                data-menu-item
                className="r2-menu-item"
                disabled={busy}
                onClick={() => void createRelation("entry", c.id)}
                onKeyDown={moveInList}
              >
                <span className="r2-menu-icon" aria-hidden />
                <span className="r2-menu-label">
                  {collectionTitle(c.id)}
                  {c.id === ownerId && !forScenes && <span className="r2-menu-hint-text"> · this collection</span>}
                </span>
              </button>
            ))}
            <button type="button" data-menu-item className="r2-menu-item" disabled={busy} onClick={() => void createRelation("page", null)} onKeyDown={moveInList}>
              <span className="r2-menu-icon" aria-hidden />
              <span className="r2-menu-label">Pages</span>
            </button>
            <button type="button" data-menu-item className="r2-menu-item" disabled={busy} onClick={() => void createRelation("scene", null)} onKeyDown={moveInList}>
              <span className="r2-menu-icon" aria-hidden />
              <span className="r2-menu-label">Scenes</span>
            </button>
          </div>
        </>
      )}
      {error && (
        <p role="status" className="r2-prop-menu-error">
          {error}
        </p>
      )}
    </Pop>
  );
}

// ── One property's menu ─────────────────────────────────────────────────────

export function PropertyMenu({
  property,
  anchor,
  onClose,
  move,
  onNotice,
}: {
  property: PropertyDefinition;
  anchor: () => Element | null | undefined;
  onClose: () => void;
  /** Its place among the columns of the Table it was opened from. */
  move?: { left?: () => void; right?: () => void };
  onNotice?: (message: string) => void;
}) {
  const { values, updateProperty, deleteProperty, updateRelationship } = usePropertyStore();
  const { index: objects } = useRune2Selection();
  const [name, setName] = useState(property.name);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameId = useId();
  const confirmId = useId();
  const types = convertibleTypes(property.type);
  const scene = isSceneProperty(property);
  const [one, many] = scene ? ["scene", "scenes"] : ["entry", "entries"];
  const notice = (m: string) => {
    setError(m);
    onNotice?.(m);
  };

  const rename = async () => {
    const next = name.trim();
    if (!next || next === property.name) {
      setName(property.name);
      return;
    }
    const r = await updateProperty(property, { name: next });
    if (r.error !== null) {
      setName(property.name);
      notice(r.error === "A property with this name already exists" ? "There’s already a property with that name." : "The name couldn’t be saved.");
    }
  };

  const retype = async (type: CollectionPropertyType) => {
    if (type === property.type) return;
    const r = await updateProperty(property, { type });
    if (r.error !== null) notice("The type couldn’t be changed.");
  };

  const remove = async (expected: number) => {
    setBusy(true);
    const r = await deleteProperty(property, expected);
    setBusy(false);
    if (r.status === "confirm") setConfirming(r.values);
    else if (r.status === "error") {
      setConfirming(null);
      notice(`“${property.name}” couldn’t be removed.`);
    } else onClose();
  };

  if (confirming !== null) {
    return (
      <Pop anchor={anchor} label={`Remove ${property.name}?`} onClose={() => setConfirming(null)}>
        <div className="r2-menu-confirm" role="alertdialog" aria-describedby={confirmId}>
          <p id={confirmId}>
            {confirming === 0
              ? `Remove “${property.name}”? No ${one} has a value for it.`
              : property.type === "relationship"
                ? `Remove “${property.name}”? Its links in ${plural(confirming, one, many)} will be removed — the things they point to stay. This can’t be undone.`
                : `Remove “${property.name}”? Its value in ${plural(confirming, one, many)} will be deleted.${scene ? " Your prose is untouched." : ""} This can’t be undone.`}
          </p>
          <div className="r2-menu-confirm-actions">
            <button type="button" data-menu-item className="r2-button r2-button--quiet r2-button--sm" disabled={busy} onClick={() => setConfirming(null)}>
              Cancel
            </button>
            <button type="button" data-menu-item className="r2-button r2-button--danger r2-button--sm" disabled={busy} onClick={() => void remove(confirming)}>
              Remove
            </button>
          </div>
        </div>
      </Pop>
    );
  }

  const TypeIcon = PROPERTY_TYPE_ICON[property.type];
  return (
    <Pop anchor={anchor} label={`${property.name} property`} onClose={onClose}>
      <label htmlFor={nameId} className="sr-only">
        Property name
      </label>
      <input
        id={nameId}
        className="r2-prop-menu-name"
        maxLength={100}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => void rename()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          } else moveInList(e);
        }}
      />
      {types.length > 1 ? (
        <>
          <p className="r2-menu-section" aria-hidden>
            Type
          </p>
          <div role="group" aria-label="Type" className="r2-prop-menu-list">
            {types.map((t) => {
              const Icon = PROPERTY_TYPE_ICON[t];
              return (
                <button
                  key={t}
                  type="button"
                  role="menuitemradio"
                  aria-checked={t === property.type}
                  data-menu-item
                  className="r2-menu-item"
                  onClick={() => void retype(t)}
                  onKeyDown={moveInList}
                >
                  <span className="r2-menu-icon" aria-hidden>
                    <Icon {...ICON} />
                  </span>
                  <span className="r2-menu-label">{PROPERTY_TYPE_LABEL[t]}</span>
                  <span className="r2-menu-check" aria-hidden>
                    {t === property.type && <Check {...ICON_SM_BOLD} />}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <p className="r2-prop-menu-type">
          <TypeIcon {...ICON} aria-hidden />
          {property.type === "relationship" ? (
            <>
              Points to {targetPhrase(property, (id) => objects.get(id)?.title ?? "a collection in Trash")}
            </>
          ) : (
            PROPERTY_TYPE_LABEL[property.type]
          )}
        </p>
      )}
      {property.type === "relationship" && (
        <div className="r2-prop-menu-row">
          <span className="r2-menu-section" aria-hidden>
            Holds
          </span>
          <span className="r2-tool-seg r2-prop-menu-seg" role="group" aria-label={`How many ${property.name} ${scene ? "a scene" : "an entry"} holds`}>
            <button
              type="button"
              aria-pressed={!property.relation_many}
              onClick={() =>
                void updateRelationship(property, { many: false }).then((e) => {
                  if (e)
                    notice(
                      e === "Some entries hold more than one" || e === "Some scenes hold more than one"
                        ? `Some ${many} hold more than one — remove the extras first.`
                        : "That couldn’t be changed."
                    );
                })
              }
            >
              One
            </button>
            <button
              type="button"
              aria-pressed={!!property.relation_many}
              onClick={() => void updateRelationship(property, { many: true }).then((e) => e && notice("That couldn’t be changed."))}
            >
              Several
            </button>
          </span>
        </div>
      )}
      {isChoiceType(property.type) && (
        <>
          <p className="r2-menu-section" aria-hidden>
            Options
          </p>
          <OptionsEditor property={property} onNotice={notice} />
        </>
      )}
      {(move?.left || move?.right || true) && <div className="r2-menu-separator" aria-hidden />}
      {move && (
        <>
          <button type="button" data-menu-item className="r2-menu-item" disabled={!move.left} onClick={move.left} onKeyDown={moveInList}>
            <span className="r2-menu-icon" aria-hidden>
              <ArrowLeft {...ICON} />
            </span>
            <span className="r2-menu-label">Move left</span>
          </button>
          <button type="button" data-menu-item className="r2-menu-item" disabled={!move.right} onClick={move.right} onKeyDown={moveInList}>
            <span className="r2-menu-icon" aria-hidden>
              <ArrowRight {...ICON} />
            </span>
            <span className="r2-menu-label">Move right</span>
          </button>
        </>
      )}
      <button
        type="button"
        data-menu-item
        className="r2-menu-item"
        data-tone="danger"
        onClick={() => setConfirming(countValues(values, property.id))}
        onKeyDown={moveInList}
      >
        <span className="r2-menu-icon" aria-hidden>
          <Trash2 {...ICON} />
        </span>
        <span className="r2-menu-label">
          Delete property<span aria-hidden>…</span>
        </span>
      </button>
      {error && (
        <p role="status" className="r2-prop-menu-error">
          {error}
        </p>
      )}
    </Pop>
  );
}

// ── A choice property's options ─────────────────────────────────────────────

/** Rename in place, remove (asking first when used), add. */
export function OptionsEditor({ property, onNotice }: { property: PropertyDefinition; onNotice: (message: string) => void }) {
  const { values, updateProperty } = usePropertyStore();
  const [adding, setAdding] = useState("");
  const [confirm, setConfirm] = useState<{ id: string; uses: number } | null>(null);
  const confirmId = useId();
  const addInput = useRef<HTMLInputElement>(null);
  const cancelRemove = () => {
    setConfirm(null);
    addInput.current?.focus();
  };

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
        ref={addInput}
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
        <div
          className="r2-schema-confirm"
          role="alertdialog"
          aria-label="Remove option?"
          aria-describedby={confirmId}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              cancelRemove();
            }
          }}
        >
          <p id={confirmId}>
            Remove “{property.options.find((o) => o.id === confirm.id)?.name}”? It will be cleared from{" "}
            {isSceneProperty(property) ? plural(confirm.uses, "scene") : plural(confirm.uses, "entry", "entries")}.
          </p>
          <button type="button" className="r2-button r2-button--danger r2-button--sm" autoFocus onClick={() => void removeOption(confirm.id)}>
            Remove
          </button>
          <button type="button" className="r2-button r2-button--quiet r2-button--sm" onClick={cancelRemove}>
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
        <X {...ICON_SM_BOLD} aria-hidden />
      </button>
    </span>
  );
}

// ── A select, as a menu ─────────────────────────────────────────────────────

/**
 * One value chosen from a short list: a field-shaped button that opens a
 * Rune menu (NavigatorMenu) with the current choice marked. Arrows move,
 * Enter chooses, Escape closes; the keyboard returns to the button.
 */
export function MenuSelect<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
  id,
  disabled,
}: {
  value: T;
  options: { value: T; label: string; disabled?: boolean }[];
  onChange: (value: T) => void;
  /** Accessible name. */
  label: string;
  className?: string;
  id?: string;
  disabled?: boolean;
}) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const current = options.find((o) => o.value === value);
  return (
    <>
      <button
        ref={button}
        id={id}
        type="button"
        className={`r2-select${className ? ` ${className}` : ""}`}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={at !== null}
        disabled={disabled}
        onClick={() => {
          const r = button.current?.getBoundingClientRect();
          setAt(at ? null : r ? { x: r.left, y: r.bottom + 2 } : null);
        }}
      >
        <span className="r2-select-value">{current?.label ?? value}</span>
        <ChevronDown {...ICON} aria-hidden />
      </button>
      {at && (
        <NavigatorMenu
          label={label}
          at={at}
          items={options.map((o) => ({
            key: o.value,
            label: o.label,
            checked: o.value === value,
            onSelect: () => onChange(o.value),
          }))}
          onClose={() => setAt(null)}
        />
      )}
    </>
  );
}
