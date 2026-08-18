"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BookTemplate,
  Check,
  ChevronRight,
  Copy,
  Edit3,
  Loader2,
  Plus,
  Search,
  Sparkles,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import toast from "react-hot-toast";
import { apiClient, getErrorMessage } from "@/lib/api-client";

// ─── Types ─────────────────────────────────────────────────────────────────────

type PromptTemplate = {
  id: string;
  name: string;
  description: string | null;
  content: string;
  variables: string[];
  is_public: boolean;
  default_model: string;
  default_temperature: number;
  knowledge_base_id: string | null;
  created_at: string;
  updated_at: string;
};

type CreateOrUpdatePayload = {
  name: string;
  description?: string;
  content: string;
  is_public: boolean;
  default_model: string;
  default_temperature: number;
  knowledge_base_id?: string | null;
};

// ─── Model Options ──────────────────────────────────────────────────────────────

const MODELS = [
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-4-turbo",
  "claude-3-5-sonnet-20241022",
  "claude-3-haiku-20240307",
  "gemini-1.5-pro",
  "gemini-1.5-flash",
];

// ─── Helpers ────────────────────────────────────────────────────────────────────

function extractVariables(content: string): string[] {
  const found = new Map<string, true>();
  const re = /\{\{(\w+)\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    found.set(m[1], true);
  }
  return Array.from(found.keys());
}

function VariablePill({ name }: { name: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        padding: "2px 9px",
        borderRadius: "var(--radius-full)",
        background: "var(--color-brand-100)",
        color: "var(--color-brand-700)",
        fontSize: "11px",
        fontWeight: 600,
        border: "1px solid var(--color-brand-300)",
      }}
    >
      <Tag size={10} />
      {name}
    </span>
  );
}

// ─── Template Card ──────────────────────────────────────────────────────────────

function TemplateCard({
  template,
  onEdit,
  onDelete,
  onCopyContent,
}: {
  template: PromptTemplate;
  onEdit: () => void;
  onDelete: () => void;
  onCopyContent: () => void;
}) {
  return (
    <div
      style={{
        background: "var(--color-surface-0)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-xl)",
        padding: "20px",
        transition: "box-shadow 0.18s ease, border-color 0.18s ease",
        cursor: "default",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.boxShadow = "var(--glass-shadow)";
        el.style.borderColor = "var(--color-brand-300)";
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.boxShadow = "none";
        el.style.borderColor = "var(--color-border)";
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
        <div
          style={{
            width: "36px",
            height: "36px",
            borderRadius: "var(--radius-lg)",
            background: "var(--color-brand-100)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <BookTemplate size={16} style={{ color: "var(--color-brand-700)" }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              flexWrap: "wrap",
            }}
          >
            <h3
              style={{
                margin: 0,
                fontSize: "14px",
                fontWeight: 700,
                color: "var(--color-text-primary)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: "220px",
              }}
            >
              {template.name}
            </h3>
            {template.is_public && (
              <span
                style={{
                  fontSize: "10px",
                  fontWeight: 600,
                  padding: "1px 7px",
                  borderRadius: "var(--radius-full)",
                  background: "#537a5a18",
                  color: "var(--color-success)",
                  border: "1px solid #537a5a40",
                }}
              >
                PUBLIC
              </span>
            )}
          </div>
          {template.description && (
            <p
              style={{
                margin: "3px 0 0",
                fontSize: "12px",
                color: "var(--color-text-muted)",
                lineHeight: 1.4,
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {template.description}
            </p>
          )}
        </div>
      </div>

      {/* Content preview */}
      <div
        style={{
          background: "var(--color-surface-50)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-md)",
          padding: "10px 12px",
          fontFamily: "var(--font-mono)",
          fontSize: "12px",
          color: "var(--color-text-secondary)",
          lineHeight: 1.6,
          display: "-webkit-box",
          WebkitLineClamp: 3,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {template.content}
      </div>

      {/* Variables */}
      {template.variables.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
          {template.variables.map((v) => (
            <VariablePill key={v} name={v} />
          ))}
        </div>
      )}

      {/* Footer */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingTop: "8px",
          borderTop: "1px solid var(--color-border)",
          gap: "8px",
        }}
      >
        <span
          style={{
            fontSize: "11px",
            color: "var(--color-text-muted)",
            background: "var(--color-surface-100)",
            padding: "2px 8px",
            borderRadius: "var(--radius-md)",
          }}
        >
          {template.default_model}
        </span>

        <div style={{ display: "flex", gap: "4px" }}>
          <button
            id={`template-copy-${template.id}`}
            onClick={onCopyContent}
            title="Copy prompt content"
            style={iconBtnStyle}
          >
            <Copy size={13} />
          </button>
          <button
            id={`template-edit-${template.id}`}
            onClick={onEdit}
            title="Edit template"
            style={iconBtnStyle}
          >
            <Edit3 size={13} />
          </button>
          <button
            id={`template-delete-${template.id}`}
            onClick={onDelete}
            title="Delete template"
            style={{ ...iconBtnStyle, color: "var(--color-error)" }}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

const iconBtnStyle: React.CSSProperties = {
  width: "28px",
  height: "28px",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--color-border)",
  background: "var(--color-surface-0)",
  color: "var(--color-text-secondary)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  transition: "all 0.15s ease",
};

// ─── Create / Edit Modal ────────────────────────────────────────────────────────

function TemplateModal({
  template,
  onClose,
  onSave,
}: {
  template: PromptTemplate | null; // null = create mode
  onClose: () => void;
  onSave: () => void;
}) {
  const isEdit = template !== null;
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(template?.name ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [content, setContent] = useState(template?.content ?? "");
  const [model, setModel] = useState(template?.default_model ?? "gpt-4o");
  const [temperature, setTemperature] = useState(
    template?.default_temperature ?? 0.1
  );
  const [isPublic, setIsPublic] = useState(template?.is_public ?? false);

  const detectedVars = extractVariables(content);

  const handleSave = async () => {
    if (!name.trim()) return toast.error("Template name is required");
    if (!content.trim()) return toast.error("Content cannot be empty");

    setSaving(true);
    const payload: CreateOrUpdatePayload = {
      name: name.trim(),
      description: description.trim() || undefined,
      content: content.trim(),
      is_public: isPublic,
      default_model: model,
      default_temperature: temperature,
    };

    try {
      if (isEdit) {
        await apiClient.put(`/prompts/${template.id}`, payload);
        toast.success("Template updated");
      } else {
        await apiClient.post("/prompts", payload);
        toast.success("Template created");
      }
      onSave();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: "var(--color-surface-0)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-xl)",
          width: "100%",
          maxWidth: "680px",
          maxHeight: "90vh",
          overflowY: "auto",
          padding: "28px",
          display: "flex",
          flexDirection: "column",
          gap: "18px",
        }}
      >
        {/* Modal header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, fontSize: "17px", fontWeight: 700, color: "var(--color-text-primary)" }}>
            {isEdit ? "Edit Template" : "New Prompt Template"}
          </h2>
          <button
            id="modal-close-btn"
            onClick={onClose}
            style={{ ...iconBtnStyle, border: "none", background: "none" }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Name */}
        <div>
          <label style={labelStyle}>Template Name</label>
          <input
            id="template-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Summarise Technical Document"
            style={inputStyle}
            onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-brand-400)")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-border)")}
          />
        </div>

        {/* Description */}
        <div>
          <label style={labelStyle}>Description <span style={{ color: "var(--color-text-muted)", fontWeight: 400 }}>(optional)</span></label>
          <input
            id="template-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief description of when to use this template"
            style={inputStyle}
            onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-brand-400)")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-border)")}
          />
        </div>

        {/* Content */}
        <div>
          <label style={labelStyle}>
            Prompt Content{" "}
            <span style={{ color: "var(--color-text-muted)", fontWeight: 400 }}>
              — use {"{{variable}}"} for placeholders
            </span>
          </label>
          <textarea
            id="template-content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={8}
            placeholder={"Summarise the following document in {{tone}} tone:\n\n{{document_content}}"}
            style={{
              ...inputStyle,
              fontFamily: "var(--font-mono)",
              fontSize: "13px",
              resize: "vertical",
              minHeight: "140px",
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-brand-400)")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-border)")}
          />
          {detectedVars.length > 0 && (
            <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginTop: "6px" }}>
              <span style={{ fontSize: "11px", color: "var(--color-text-muted)", lineHeight: "20px" }}>
                Detected variables:
              </span>
              {detectedVars.map((v) => (
                <VariablePill key={v} name={v} />
              ))}
            </div>
          )}
        </div>

        {/* Model + Temperature row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <div>
            <label style={labelStyle}>Default Model</label>
            <select
              id="template-model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              style={inputStyle}
            >
              {MODELS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Temperature ({temperature.toFixed(1)})</label>
            <input
              id="template-temperature"
              type="range"
              min={0}
              max={2}
              step={0.1}
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
              style={{ width: "100%", marginTop: "8px", accentColor: "var(--color-brand-600)" }}
            />
          </div>
        </div>

        {/* Public toggle */}
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            cursor: "pointer",
            userSelect: "none",
          }}
        >
          <input
            id="template-public"
            type="checkbox"
            checked={isPublic}
            onChange={(e) => setIsPublic(e.target.checked)}
            style={{ accentColor: "var(--color-brand-600)", width: "14px", height: "14px" }}
          />
          <span style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>
            Make this template visible to all workspace members
          </span>
        </label>

        {/* Actions */}
        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", paddingTop: "8px" }}>
          <button
            id="modal-cancel-btn"
            onClick={onClose}
            style={{
              padding: "9px 18px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--color-border)",
              background: "var(--color-surface-0)",
              color: "var(--color-text-secondary)",
              fontSize: "13px",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            id="modal-save-btn"
            onClick={handleSave}
            disabled={saving}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "9px 20px",
              borderRadius: "var(--radius-md)",
              border: "none",
              background: saving ? "var(--color-surface-300)" : "var(--color-brand-600)",
              color: saving ? "var(--color-text-muted)" : "#fff",
              fontSize: "13px",
              fontWeight: 600,
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            {saving ? (
              <><Loader2 size={14} className="animate-spin" /> Saving...</>
            ) : (
              <><Check size={14} /> {isEdit ? "Save Changes" : "Create Template"}</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "12px",
  fontWeight: 600,
  color: "var(--color-text-secondary)",
  marginBottom: "6px",
  letterSpacing: "0.02em",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 13px",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--color-border)",
  background: "var(--color-surface-0)",
  color: "var(--color-text-primary)",
  fontSize: "13px",
  outline: "none",
  transition: "border-color 0.15s ease",
  boxSizing: "border-box",
};

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function PromptsPage() {
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<PromptTemplate | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const filtered = templates.filter(
    (t) =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      (t.description ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<{ items: PromptTemplate[]; total: number }>(
        "/prompts?include_public=true&page_size=100"
      );
      setTemplates(res.data.items);
      setTotal(res.data.total);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadTemplates();
  }, [loadTemplates]);

  const openCreate = () => {
    setEditTarget(null);
    setModalOpen(true);
  };

  const openEdit = (t: PromptTemplate) => {
    setEditTarget(t);
    setModalOpen(true);
  };

  const handleModalSave = () => {
    setModalOpen(false);
    loadTemplates();
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      await apiClient.delete(`/prompts/${id}`);
      toast.success("Template deleted");
      loadTemplates();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setDeleting(null);
    }
  };

  const copyContent = (content: string) => {
    navigator.clipboard.writeText(content).then(() => toast.success("Copied to clipboard"));
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--color-surface-0)",
        padding: "32px 28px",
        maxWidth: "1100px",
        margin: "0 auto",
      }}
    >
      {/* ── Header ────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "28px",
          flexWrap: "wrap",
          gap: "12px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "var(--radius-lg)",
              background: "var(--color-brand-100)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Sparkles size={18} style={{ color: "var(--color-brand-700)" }} />
          </div>
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: "20px",
                fontWeight: 700,
                color: "var(--color-text-primary)",
                letterSpacing: "-0.02em",
              }}
            >
              Prompt Templates
            </h1>
            <p style={{ margin: 0, fontSize: "13px", color: "var(--color-text-muted)" }}>
              {total} template{total !== 1 ? "s" : ""} • Reusable prompts with live variable extraction
            </p>
          </div>
        </div>

        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          {/* Search */}
          <div style={{ position: "relative" }}>
            <Search
              size={13}
              style={{
                position: "absolute",
                left: "10px",
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--color-text-muted)",
                pointerEvents: "none",
              }}
            />
            <input
              id="template-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search templates..."
              style={{
                padding: "8px 12px 8px 30px",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--color-border)",
                background: "var(--color-surface-50)",
                color: "var(--color-text-primary)",
                fontSize: "13px",
                outline: "none",
                width: "200px",
              }}
            />
          </div>

          <button
            id="create-template-btn"
            onClick={openCreate}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "9px 16px",
              borderRadius: "var(--radius-md)",
              border: "none",
              background: "var(--color-brand-600)",
              color: "#fff",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "opacity 0.15s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.88")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
          >
            <Plus size={14} />
            New Template
          </button>
        </div>
      </div>

      {/* ── Content ───────────────────────────────────────────────── */}
      {loading ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "200px",
            color: "var(--color-text-muted)",
            gap: "10px",
          }}
        >
          <Loader2 size={18} className="animate-spin" />
          Loading templates...
        </div>
      ) : filtered.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "64px 20px",
            color: "var(--color-text-muted)",
          }}
        >
          <BookTemplate
            size={40}
            style={{ margin: "0 auto 16px", opacity: 0.3 }}
          />
          <p style={{ fontSize: "15px", fontWeight: 600, color: "var(--color-text-secondary)" }}>
            {search ? "No templates match your search" : "No prompt templates yet"}
          </p>
          {!search && (
            <p style={{ fontSize: "13px", marginTop: "6px" }}>
              Create your first template to start building your prompt library.
            </p>
          )}
          {!search && (
            <button
              id="empty-create-btn"
              onClick={openCreate}
              style={{
                marginTop: "18px",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "10px 20px",
                borderRadius: "var(--radius-md)",
                border: "none",
                background: "var(--color-brand-600)",
                color: "#fff",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <Plus size={14} /> Create Template
            </button>
          )}
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
            gap: "16px",
          }}
        >
          {filtered.map((t) => (
            <TemplateCard
              key={t.id}
              template={t}
              onEdit={() => openEdit(t)}
              onDelete={() => handleDelete(t.id)}
              onCopyContent={() => copyContent(t.content)}
            />
          ))}
        </div>
      )}

      {/* ── Modal ─────────────────────────────────────────────────── */}
      {modalOpen && (
        <TemplateModal
          template={editTarget}
          onClose={() => setModalOpen(false)}
          onSave={handleModalSave}
        />
      )}
    </div>
  );
}
