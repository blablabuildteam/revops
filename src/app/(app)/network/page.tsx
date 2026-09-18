"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import {
  Plus,
  ExternalLink,
  Contact,
  Settings2,
  Mail,
  Phone,
  Building2,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { createNetworkContact, updateNetworkContact, deleteNetworkContact } from "@/lib/api";
import { useUndoToast } from "@/components/mutation-provider";
import { useNetworkContacts } from "@/hooks/use-api-data";
import {
  NetworkContact,
  NetworkContactStatus,
  NETWORK_STATUS_LABELS,
} from "@/lib/types";
import { cn } from "@/lib/utils";

const STATUS_COLORS: Record<NetworkContactStatus, string> = {
  active: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  dormant: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  archived: "bg-neutral-500/20 text-neutral-500 border-neutral-500/30",
};

const SUGGESTED_TAGS = [
  "Investor",
  "Partner",
  "Consultant",
  "Developer",
  "Designer",
  "Client",
  "Lead",
  "Vendor",
  "Mentor",
  "Referral",
];

type FormState = {
  name: string;
  email: string;
  phone: string;
  company: string;
  role: string;
  linkedin_url: string;
  notes: string;
  tags: string[];
  last_contacted: string;
  status: NetworkContactStatus;
};

function ContactForm({
  open,
  onClose,
  onSave,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (c: NetworkContact) => void;
  initial?: NetworkContact | null;
}) {
  const blank: FormState = {
    name: "",
    email: "",
    phone: "",
    company: "",
    role: "",
    linkedin_url: "",
    notes: "",
    tags: [],
    last_contacted: "",
    status: "active",
  };
  const [form, setForm] = useState<FormState>(blank);
  const [loading, setLoading] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const withUndo = useUndoToast();

  useEffect(() => {
    if (open) {
      setForm(
        initial
          ? {
              name: initial.name,
              email: initial.email ?? "",
              phone: initial.phone ?? "",
              company: initial.company ?? "",
              role: initial.role ?? "",
              linkedin_url: initial.linkedin_url ?? "",
              notes: initial.notes ?? "",
              tags: initial.tags ?? [],
              last_contacted: initial.last_contacted ?? "",
              status: initial.status,
            }
          : blank
      );
      setTagInput("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const s = (k: keyof FormState, v: string | string[]) =>
    setForm((f) => ({ ...f, [k]: v }));

  function addTag(tag: string) {
    const normalized = tag.trim();
    if (normalized && !form.tags.includes(normalized)) {
      s("tags", [...form.tags, normalized]);
    }
    setTagInput("");
  }

  function removeTag(tag: string) {
    s(
      "tags",
      form.tags.filter((t) => t !== tag)
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        name: form.name,
        email: form.email || null,
        phone: form.phone || null,
        company: form.company || null,
        role: form.role || null,
        linkedin_url: form.linkedin_url || null,
        notes: form.notes || null,
        tags: form.tags,
        last_contacted: form.last_contacted || null,
        status: form.status,
      };

      if (initial) {
        const snapshot = { ...initial };
        await withUndo({
          label: "Updated",
          run: async () => {
            const updated = await updateNetworkContact(initial.id, payload);
            onSave(updated);
            onClose();
          },
          undo: async () => {
            const restored = await updateNetworkContact(initial.id, {
              name: snapshot.name,
              email: snapshot.email ?? null,
              phone: snapshot.phone ?? null,
              company: snapshot.company ?? null,
              role: snapshot.role ?? null,
              linkedin_url: snapshot.linkedin_url ?? null,
              notes: snapshot.notes ?? null,
              tags: snapshot.tags ?? [],
              last_contacted: snapshot.last_contacted ?? null,
              status: snapshot.status,
            });
            onSave(restored);
          },
        });
        return;
      }
      const created = await createNetworkContact(payload);
      onSave(created);
      onClose();
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!initial) return;
    const snapshot = { ...initial };
    await withUndo({
      label: "Deleted",
      run: async () => {
        await deleteNetworkContact(initial.id);
        onClose();
      },
      undo: async () => {
        const restored = await createNetworkContact({
          name: snapshot.name,
          email: snapshot.email ?? null,
          phone: snapshot.phone ?? null,
          company: snapshot.company ?? null,
          role: snapshot.role ?? null,
          linkedin_url: snapshot.linkedin_url ?? null,
          notes: snapshot.notes ?? null,
          tags: snapshot.tags ?? [],
          last_contacted: snapshot.last_contacted ?? null,
          status: snapshot.status,
        });
        onSave(restored);
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-neutral-900 border-neutral-700 text-neutral-100 max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-neutral-100">
            {initial ? `Edit ${initial.name}` : "New contact"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-neutral-400 text-xs">Name *</Label>
            <Input
              required
              value={form.name}
              onChange={(e) => s("name", e.target.value)}
              className="bg-neutral-800 border-neutral-700 text-neutral-100"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-neutral-400 text-xs">Email</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => s("email", e.target.value)}
                placeholder="email@example.com"
                className="bg-neutral-800 border-neutral-700 text-neutral-100 placeholder:text-neutral-600"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-neutral-400 text-xs">Phone</Label>
              <Input
                value={form.phone}
                onChange={(e) => s("phone", e.target.value)}
                placeholder="+31 6 1234 5678"
                className="bg-neutral-800 border-neutral-700 text-neutral-100 placeholder:text-neutral-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-neutral-400 text-xs">Company</Label>
              <Input
                value={form.company}
                onChange={(e) => s("company", e.target.value)}
                placeholder="Acme Inc."
                className="bg-neutral-800 border-neutral-700 text-neutral-100 placeholder:text-neutral-600"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-neutral-400 text-xs">Role</Label>
              <Input
                value={form.role}
                onChange={(e) => s("role", e.target.value)}
                placeholder="CEO, Developer, etc."
                className="bg-neutral-800 border-neutral-700 text-neutral-100 placeholder:text-neutral-600"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-neutral-400 text-xs">LinkedIn URL</Label>
            <Input
              value={form.linkedin_url}
              onChange={(e) => s("linkedin_url", e.target.value)}
              placeholder="https://linkedin.com/in/username"
              className="bg-neutral-800 border-neutral-700 text-neutral-100 placeholder:text-neutral-600 font-mono text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-neutral-400 text-xs">Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) => s("status", v as NetworkContactStatus)}
              >
                <SelectTrigger className="bg-neutral-800 border-neutral-700 text-neutral-100">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-neutral-800 border-neutral-700">
                  {(Object.keys(NETWORK_STATUS_LABELS) as NetworkContactStatus[]).map(
                    (status) => (
                      <SelectItem key={status} value={status} className="text-neutral-100">
                        {NETWORK_STATUS_LABELS[status]}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-neutral-400 text-xs">Last contacted</Label>
              <Input
                type="date"
                value={form.last_contacted}
                onChange={(e) => s("last_contacted", e.target.value)}
                className="bg-neutral-800 border-neutral-700 text-neutral-100"
              />
            </div>
          </div>

          {/* Tags */}
          <div className="space-y-1.5">
            <Label className="text-neutral-400 text-xs">Tags</Label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {form.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#d4e052]/20 text-[#d4e052] rounded text-xs"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => removeTag(tag)}
                    className="hover:text-[#d4e052]/70"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag(tagInput);
                  }
                }}
                placeholder="Add tag..."
                className="bg-neutral-800 border-neutral-700 text-neutral-100 placeholder:text-neutral-600 flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addTag(tagInput)}
                className="border-neutral-700 text-neutral-400 hover:text-neutral-200"
              >
                Add
              </Button>
            </div>
            <div className="flex flex-wrap gap-1 mt-2">
              {SUGGESTED_TAGS.filter((t) => !form.tags.includes(t)).map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => addTag(tag)}
                  className="px-2 py-0.5 text-[10px] bg-neutral-800 hover:bg-neutral-700 text-neutral-500 hover:text-neutral-300 rounded transition-colors"
                >
                  + {tag}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-neutral-400 text-xs">Notes</Label>
            <textarea
              value={form.notes}
              onChange={(e) => s("notes", e.target.value)}
              placeholder="How did you meet? What's the context?"
              rows={3}
              className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-md text-neutral-100 placeholder:text-neutral-600 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#d4e052]/50"
            />
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            {initial && (
              <Button
                type="button"
                variant="ghost"
                onClick={handleDelete}
                className="text-red-400 hover:text-red-300 hover:bg-red-500/10 mr-auto"
              >
                Delete
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              className="text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="bg-[#d4e052] hover:bg-[#c2ce45] text-neutral-950 font-medium"
            >
              {loading ? "Saving..." : initial ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function StatusBadge({ status }: { status: NetworkContactStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border",
        STATUS_COLORS[status]
      )}
    >
      {NETWORK_STATUS_LABELS[status]}
    </span>
  );
}

export default function NetworkPage() {
  const {
    data: contacts = [],
    isLoading,
    mutate,
  } = useNetworkContacts();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<NetworkContact | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<NetworkContactStatus | "all">("all");
  const [filterTag, setFilterTag] = useState<string | "all">("all");

  // Collect all unique tags
  const allTags = [...new Set(contacts.flatMap((c) => c.tags ?? []))].sort();

  // Filter contacts
  const filtered = contacts.filter((contact) => {
    const matchesSearch =
      !search ||
      contact.name.toLowerCase().includes(search.toLowerCase()) ||
      contact.email?.toLowerCase().includes(search.toLowerCase()) ||
      contact.company?.toLowerCase().includes(search.toLowerCase()) ||
      contact.role?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = filterStatus === "all" || contact.status === filterStatus;
    const matchesTag = filterTag === "all" || contact.tags?.includes(filterTag);
    return matchesSearch && matchesStatus && matchesTag;
  });

  function handleSave(_updated: NetworkContact) {
    void mutate();
    setEditing(null);
    setFormOpen(false);
  }

  const activeCount = contacts.filter((c) => c.status === "active").length;

  return (
    <div className="page-shell space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg sm:text-xl font-semibold text-neutral-100">Network</h1>
          <p className="text-sm text-neutral-500 mt-0.5">
            {contacts.length} contacts · {activeCount} active
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
          className="w-full sm:w-auto bg-[#d4e052] hover:bg-[#c2ce45] text-neutral-950 font-medium gap-2"
        >
          <Plus className="w-4 h-4" /> New contact
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-600" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search contacts..."
            className="pl-9 bg-neutral-800 border-neutral-700 text-neutral-100 placeholder:text-neutral-600"
          />
        </div>
        <Select
          value={filterStatus}
          onValueChange={(v) => setFilterStatus(v as NetworkContactStatus | "all")}
        >
          <SelectTrigger className="w-full sm:w-36 bg-neutral-800 border-neutral-700 text-neutral-100">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent className="bg-neutral-800 border-neutral-700">
            <SelectItem value="all" className="text-neutral-400">
              All statuses
            </SelectItem>
            {(Object.keys(NETWORK_STATUS_LABELS) as NetworkContactStatus[]).map(
              (status) => (
                <SelectItem key={status} value={status} className="text-neutral-100">
                  {NETWORK_STATUS_LABELS[status]}
                </SelectItem>
              )
            )}
          </SelectContent>
        </Select>
        {allTags.length > 0 && (
          <Select value={filterTag} onValueChange={(v) => { if (v) setFilterTag(v); }}>
            <SelectTrigger className="w-full sm:w-36 bg-neutral-800 border-neutral-700 text-neutral-100">
              <SelectValue placeholder="Tag" />
            </SelectTrigger>
            <SelectContent className="bg-neutral-800 border-neutral-700">
              <SelectItem value="all" className="text-neutral-400">
                All tags
              </SelectItem>
              {allTags.map((tag) => (
                <SelectItem key={tag} value={tag} className="text-neutral-100">
                  {tag}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {isLoading && contacts.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="border border-neutral-800 rounded-lg h-40 animate-pulse"
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((contact) => (
            <div
              key={contact.id}
              className="border border-neutral-800 rounded-lg p-5 hover:border-neutral-700 transition-colors bg-neutral-900/20"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center shrink-0">
                    <Contact className="w-5 h-5 text-neutral-500" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-medium text-neutral-200 truncate">
                      {contact.name}
                    </h3>
                    {(contact.role || contact.company) && (
                      <p className="text-xs text-neutral-500 truncate">
                        {contact.role}
                        {contact.role && contact.company && " · "}
                        {contact.company}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => {
                    setEditing(contact);
                    setFormOpen(true);
                  }}
                  className="p-1.5 text-neutral-700 hover:text-neutral-400 hover:bg-neutral-800 rounded transition-colors shrink-0"
                >
                  <Settings2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="space-y-1.5 mb-3">
                {contact.email && (
                  <a
                    href={`mailto:${contact.email}`}
                    className="flex items-center gap-2 text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
                  >
                    <Mail className="w-3 h-3 shrink-0" />
                    <span className="truncate">{contact.email}</span>
                  </a>
                )}
                {contact.phone && (
                  <a
                    href={`tel:${contact.phone}`}
                    className="flex items-center gap-2 text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
                  >
                    <Phone className="w-3 h-3 shrink-0" />
                    <span>{contact.phone}</span>
                  </a>
                )}
                {contact.company && (
                  <div className="flex items-center gap-2 text-xs text-neutral-500">
                    <Building2 className="w-3 h-3 shrink-0" />
                    <span className="truncate">{contact.company}</span>
                  </div>
                )}
                {contact.linkedin_url && (
                  <a
                    href={contact.linkedin_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
                  >
                    <ExternalLink className="w-3 h-3 shrink-0" />
                    <span>LinkedIn</span>
                  </a>
                )}
              </div>

              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-wrap gap-1">
                  {contact.tags?.slice(0, 3).map((tag) => (
                    <span
                      key={tag}
                      className="px-1.5 py-0.5 bg-neutral-800 text-neutral-500 rounded text-[10px]"
                    >
                      {tag}
                    </span>
                  ))}
                  {(contact.tags?.length ?? 0) > 3 && (
                    <span className="px-1.5 py-0.5 text-neutral-600 text-[10px]">
                      +{contact.tags!.length - 3}
                    </span>
                  )}
                </div>
                <StatusBadge status={contact.status} />
              </div>

              {contact.last_contacted && (
                <p className="text-[10px] text-neutral-600 mt-2">
                  Last contact:{" "}
                  {new Date(contact.last_contacted).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
              )}
            </div>
          ))}

          {filtered.length === 0 && contacts.length > 0 && (
            <div className="md:col-span-2 lg:col-span-3 py-20 text-center border border-neutral-800 rounded-lg">
              <Search className="w-8 h-8 text-neutral-700 mx-auto mb-3" />
              <p className="text-neutral-600 text-sm">No contacts match your filters</p>
            </div>
          )}

          {contacts.length === 0 && (
            <div className="md:col-span-2 lg:col-span-3 py-20 text-center border border-neutral-800 rounded-lg">
              <Contact className="w-8 h-8 text-neutral-700 mx-auto mb-3" />
              <p className="text-neutral-600 text-sm">No contacts yet</p>
              <p className="text-neutral-700 text-xs mt-1">
                Add people to your network for business inquiries
              </p>
            </div>
          )}
        </div>
      )}

      <ContactForm
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSave={handleSave}
        initial={editing}
      />
    </div>
  );
}
