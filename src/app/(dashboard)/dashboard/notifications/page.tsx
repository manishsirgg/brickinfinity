"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type NotificationCategory = "lead" | "property" | "payment" | "featured" | "system" | string;

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: string | null;
  category: NotificationCategory;
  priority: string;
  is_read: boolean;
  link_url: string | null;
  action_label: string | null;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

type FilterKey = "all" | "unread" | "lead" | "property" | "payment" | "featured" | "system";

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "lead", label: "Leads" },
  { key: "property", label: "Properties" },
  { key: "payment", label: "Payments" },
  { key: "featured", label: "Featured" },
  { key: "system", label: "System" },
];

export default function NotificationsPage() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");
  const [markAllLoading, setMarkAllLoading] = useState(false);
  const [busyById, setBusyById] = useState<Record<string, boolean>>({});

  const unreadCount = useMemo(() => items.filter((item) => !item.is_read).length, [items]);

  const filtered = useMemo(() => {
    if (activeFilter === "all") return items;
    if (activeFilter === "unread") return items.filter((item) => !item.is_read);
    return items.filter((item) => item.category === activeFilter);
  }, [activeFilter, items]);

  const fetchNotifications = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/notifications?limit=50", { cache: "no-store" });
      const payload = await response.json() as {
        success?: boolean;
        notifications?: NotificationItem[];
        error?: string;
      };

      if (!response.ok || !payload.success) {
        throw new Error(payload.error ?? "Failed to load notifications");
      }

      setItems(payload.notifications ?? []);
    } catch {
      setError("Unable to load notifications right now.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchNotifications();
  }, []);

  const setBusy = (id: string, value: boolean) => {
    setBusyById((prev) => ({ ...prev, [id]: value }));
  };

  const markAsRead = async (id: string) => {
    setBusy(id, true);
    try {
      const response = await fetch(`/api/notifications/${id}/read`, { method: "POST" });
      const payload = await response.json() as { success?: boolean };
      if (!response.ok || !payload.success) throw new Error("Failed");
      setItems((prev) => prev.map((item) => (item.id === id ? { ...item, is_read: true } : item)));
    } catch {
      setError("Unable to update notification right now.");
    } finally {
      setBusy(id, false);
    }
  };

  const dismiss = async (id: string) => {
    setBusy(id, true);
    try {
      const response = await fetch(`/api/notifications/${id}/dismiss`, { method: "POST" });
      const payload = await response.json() as { success?: boolean };
      if (!response.ok || !payload.success) throw new Error("Failed");
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch {
      setError("Unable to dismiss notification right now.");
    } finally {
      setBusy(id, false);
    }
  };

  const markAllRead = async () => {
    setMarkAllLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/notifications/mark-all-read", { method: "POST" });
      const payload = await response.json() as { success?: boolean };
      if (!response.ok || !payload.success) throw new Error("Failed");
      setItems((prev) => prev.map((item) => ({ ...item, is_read: true })));
    } catch {
      setError("Unable to mark all notifications as read.");
    } finally {
      setMarkAllLoading(false);
    }
  };

  const createdLabel = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Just now";

    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-8 md:py-12 space-y-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Notifications</h1>
          <p className="text-sm md:text-base text-gray-500 mt-1">Stay updated on your leads, listings, payments, and account activity.</p>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-sm text-gray-600">
            <span className="font-semibold text-gray-900">{unreadCount}</span> unread
          </p>
          <button
            onClick={markAllRead}
            disabled={markAllLoading || unreadCount === 0}
            className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {markAllLoading ? "Marking..." : "Mark all as read"}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((filter) => {
          const active = activeFilter === filter.key;
          return (
            <button
              key={filter.key}
              onClick={() => setActiveFilter(filter.key)}
              className={`px-3 py-1.5 rounded-full text-sm border transition ${
                active ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-700 border-gray-200 hover:border-gray-300"
              }`}
            >
              {filter.label}
            </button>
          );
        })}
      </div>

      {loading && <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-gray-500">Loading notifications...</div>}
      {!loading && error && <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">{error}</div>}

      {!loading && !error && filtered.length === 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center">
          <h2 className="font-semibold text-gray-900">No notifications found</h2>
          <p className="text-sm text-gray-500 mt-2">Try a different filter or check back later.</p>
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className="space-y-4">
          {filtered.map((item) => {
            const isHighPriority = ["high", "critical"].includes((item.priority || "").toLowerCase());
            const busy = Boolean(busyById[item.id]);
            return (
              <article key={item.id} className={`rounded-2xl border p-5 bg-white ${item.is_read ? "border-gray-200" : "border-red-200"}`}>
                <div className="flex flex-col gap-4 md:flex-row md:justify-between md:items-start">
                  <div className="flex-1">
                    <div className="flex items-start gap-3">
                      <span className={`mt-1.5 h-2.5 w-2.5 rounded-full ${item.is_read ? "bg-gray-300" : "bg-red-500"}`} />
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className={`text-base ${item.is_read ? "font-semibold text-gray-800" : "font-bold text-gray-900"}`}>{item.title}</h2>
                          <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-700 capitalize">{item.category}</span>
                          {isHighPriority && (
                            <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700 uppercase">{item.priority}</span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600">{item.message}</p>
                        <p className="text-xs text-gray-400">{createdLabel(item.created_at)}</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link
                      href={item.link_url || "/dashboard/notifications"}
                      onClick={() => {
                        if (!item.is_read && !busy) {
                          void markAsRead(item.id);
                        }
                      }}
                      className="px-3 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-black"
                    >
                      {item.action_label || "Open"}
                    </Link>
                    {!item.is_read && (
                      <button
                        onClick={() => void markAsRead(item.id)}
                        disabled={busy}
                        className="px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                      >
                        Mark read
                      </button>
                    )}
                    <button
                      onClick={() => void dismiss(item.id)}
                      disabled={busy}
                      className="px-3 py-2 rounded-lg border border-red-200 text-red-700 text-sm font-medium hover:bg-red-50 disabled:opacity-60"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
