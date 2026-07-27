"use client";

import { Check, LoaderCircle, Plus, Search, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";

type Row = Record<string, unknown> & { id: string };

export type WorkspaceColumn = {
  key: string;
  label: string;
  kind?: "text" | "date" | "money" | "status";
};

export type WorkspaceField = {
  name: string;
  label: string;
  type?: "text" | "email" | "number" | "datetime-local" | "textarea" | "select" | "file";
  required?: boolean;
  defaultValue?: string;
  options?: Array<{ label: string; value: string }>;
};

type Props = {
  title: string;
  description: string;
  endpoint: string;
  createLabel: string;
  columns: WorkspaceColumn[];
  fields: WorkspaceField[];
  demo: boolean;
  demoRows?: Row[];
  detailHref?: string;
  allowDelete?: boolean;
  quickComplete?: boolean;
  readOnly?: boolean;
};

function valueLabel(value: unknown, kind: WorkspaceColumn["kind"]): string {
  if (value === null || value === undefined || value === "") return "—";
  if (kind === "date") {
    return new Intl.DateTimeFormat("es-AR", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(String(value)));
  }
  if (kind === "money") {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
    }).format(Number(value));
  }
  return String(value).replaceAll("_", " ");
}

async function fileAsBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index] ?? 0);
  }
  return btoa(binary);
}

export function ResourceWorkspace({
  title,
  description,
  endpoint,
  createLabel,
  columns,
  fields,
  demo,
  demoRows = [],
  detailHref,
  allowDelete = true,
  quickComplete = false,
  readOnly = false,
}: Props) {
  const [rows, setRows] = useState<Row[]>(demoRows);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(!demo);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (demo) return;
    const controller = new AbortController();
    setLoading(true);
    fetch(`${endpoint}?limit=50`, { signal: controller.signal })
      .then(async (result) => {
        const payload = (await result.json()) as {
          data?: Row[];
          error?: { message?: string };
        };
        if (!result.ok) throw new Error(payload.error?.message ?? "No se pudo cargar.");
        setRows(payload.data ?? []);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setMessage(error instanceof Error ? error.message : "No se pudo cargar.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [demo, endpoint]);

  const visibleRows = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("es");
    if (!normalized) return rows;
    return rows.filter((row) =>
      Object.values(row).some((value) =>
        String(value ?? "")
          .toLocaleLowerCase("es")
          .includes(normalized),
      ),
    );
  }, [query, rows]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload: Record<string, unknown> = {};
    for (const field of fields) {
      if (field.type === "file") {
        const file = formData.get(field.name);
        if (file instanceof File && file.size > 0) {
          payload[field.name] = await fileAsBase64(file);
          payload.mimeType = file.type || "application/octet-stream";
          if (!payload.name) payload.name = file.name;
        }
        continue;
      }
      const raw = String(formData.get(field.name) ?? "").trim();
      if (!raw) continue;
      if (field.type === "number") payload[field.name] = Number(raw);
      else if (field.type === "datetime-local") payload[field.name] = new Date(raw).toISOString();
      else payload[field.name] = raw;
    }

    try {
      if (demo) {
        const newRow = { id: crypto.randomUUID(), ...payload } as Row;
        setRows((current) => [newRow, ...current]);
      } else {
        const result = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const body = (await result.json()) as {
          data?: Row;
          error?: { message?: string };
        };
        if (!result.ok || !body.data) {
          throw new Error(body.error?.message ?? "No se pudo guardar.");
        }
        setRows((current) => [body.data as Row, ...current]);
      }
      form.reset();
      setShowForm(false);
      setMessage(demo ? "Guardado en el modo demo." : "Guardado correctamente.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: Row) {
    if (!window.confirm("¿Querés eliminar este registro?")) return;
    if (!demo) {
      const result = await fetch(`${endpoint}/${row.id}`, { method: "DELETE" });
      if (!result.ok) {
        const body = (await result.json()) as { error?: { message?: string } };
        setMessage(body.error?.message ?? "No se pudo eliminar.");
        return;
      }
    }
    setRows((current) => current.filter((item) => item.id !== row.id));
  }

  async function complete(row: Row) {
    if (!demo) {
      const result = await fetch(`${endpoint}/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "DONE" }),
      });
      if (!result.ok) {
        const body = (await result.json()) as { error?: { message?: string } };
        setMessage(body.error?.message ?? "No se pudo completar.");
        return;
      }
    }
    setRows((current) =>
      current.map((item) => (item.id === row.id ? { ...item, status: "DONE" } : item)),
    );
  }

  return (
    <div className="resource-page">
      <header className="resource-heading">
        <div>
          <p className="eyebrow">Monitor Legal</p>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        {!readOnly ? (
          <button
            className="button button-primary"
            type="button"
            onClick={() => setShowForm((current) => !current)}
          >
            {showForm ? <X size={17} /> : <Plus size={17} />}
            {showForm ? "Cerrar" : createLabel}
          </button>
        ) : null}
      </header>

      {showForm && !readOnly ? (
        <form className="resource-form panel" onSubmit={submit}>
          {fields.map((field) => (
            <label
              className={field.type === "textarea" ? "field-wide" : undefined}
              key={field.name}
            >
              <span>{field.label}</span>
              {field.type === "select" ? (
                <select
                  name={field.name}
                  required={field.required}
                  defaultValue={field.defaultValue ?? ""}
                >
                  <option value="">Seleccionar…</option>
                  {field.options?.map((option) => (
                    <option value={option.value} key={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : field.type === "textarea" ? (
                <textarea name={field.name} required={field.required} rows={3} />
              ) : (
                <input
                  name={field.name}
                  type={field.type ?? "text"}
                  required={field.required}
                  defaultValue={field.defaultValue}
                  accept={field.type === "file" ? ".pdf,.doc,.docx,.jpg,.jpeg,.png" : undefined}
                />
              )}
            </label>
          ))}
          <div className="field-wide form-actions">
            <button className="button button-primary" disabled={saving} type="submit">
              {saving ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />}
              Guardar
            </button>
            <small>Los cambios quedan registrados en auditoría.</small>
          </div>
        </form>
      ) : null}

      <section className="resource-table-panel panel">
        <div className="resource-toolbar">
          <label className="resource-search">
            <Search size={17} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Buscar en ${title.toLocaleLowerCase("es")}…`}
            />
          </label>
          <span>{visibleRows.length} registros</span>
        </div>

        {message ? <p className="inline-message">{message}</p> : null}
        {loading ? (
          <div className="resource-empty">
            <LoaderCircle className="spin" size={22} />
            Cargando…
          </div>
        ) : visibleRows.length === 0 ? (
          <div className="resource-empty">
            <strong>No hay registros todavía.</strong>
            <span>Usá “{createLabel}” para cargar el primero.</span>
          </div>
        ) : (
          <div className="resource-table-scroll">
            <table className="resource-table">
              <thead>
                <tr>
                  {columns.map((column) => (
                    <th key={column.key}>{column.label}</th>
                  ))}
                  <th aria-label="Acciones" />
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row.id}>
                    {columns.map((column, index) => {
                      const content = valueLabel(row[column.key], column.kind);
                      return (
                        <td key={column.key}>
                          {index === 0 && detailHref ? (
                            <Link href={`${detailHref}/${row.id}`}>{content}</Link>
                          ) : column.kind === "status" ? (
                            <span className="stage-chip">{content}</span>
                          ) : (
                            content
                          )}
                        </td>
                      );
                    })}
                    <td className="resource-actions">
                      {quickComplete && row.status !== "DONE" ? (
                        <button type="button" onClick={() => complete(row)} title="Completar">
                          <Check size={16} />
                        </button>
                      ) : null}
                      {allowDelete ? (
                        <button type="button" onClick={() => remove(row)} title="Eliminar">
                          <Trash2 size={16} />
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
