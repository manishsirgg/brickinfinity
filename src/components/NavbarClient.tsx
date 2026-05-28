"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useRef, useEffect, useCallback } from "react";
import { Bell, Menu, X, Heart } from "lucide-react";
import { NAV_ITEMS } from "@/config/navigation";
import { USER_ROLES, UserRole } from "@/types/roles";
import LogoutButton from "./LogoutButton";
import NavbarSearch from "@/components/NavbarSearch";

interface NavbarClientProps {
  user: {
    id: string;
    email: string;
    role: UserRole;
    kycStatus: string;
    sellerStatus: string;
    fullName: string;
    avatarUrl: string | null;
  } | null;
}

interface NavbarNotification {
  id: string;
  title: string;
  message: string;
  type: string | null;
  category: string;
  priority: string;
  is_read: boolean;
  link_url: string | null;
  action_label: string | null;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export default function NavbarClient({ user }: NavbarClientProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notifications, setNotifications] = useState<NavbarNotification[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [markAllLoading, setMarkAllLoading] = useState(false);

  const accountRef = useRef<HTMLDivElement>(null);
  const notificationRef = useRef<HTMLDivElement>(null);

  const role = user?.role ?? null;

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    setNotificationsLoading(true);
    setNotificationsError(null);

    try {
      const response = await fetch("/api/notifications", { cache: "no-store" });
      const payload = await response.json() as {
        success?: boolean;
        notifications?: NavbarNotification[];
        unreadCount?: number;
        error?: string;
      };

      if (!response.ok || !payload.success) {
        throw new Error(payload.error ?? "Failed to fetch notifications");
      }

      setNotifications(payload.notifications ?? []);
      setUnreadCount(payload.unreadCount ?? 0);
    } catch {
      setNotificationsError("Unable to load notifications right now.");
    } finally {
      setNotificationsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    void fetchNotifications();
  }, [fetchNotifications, user]);

  /* ================= OUTSIDE CLICK ================= */

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (accountRef.current && !accountRef.current.contains(event.target as Node)) {
        setAccountOpen(false);
      }

      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setNotificationOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);

    return () =>
      document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  /* ================= BODY SCROLL LOCK ================= */

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
  }, [mobileOpen]);

  /* ================= ROLE FILTER ================= */

  const effectiveRole = role ?? USER_ROLES.BUYER;
  const filteredNav = NAV_ITEMS.filter((item) =>
    item.roles.includes(effectiveRole)
  );

  const formatNotificationTime = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Just now";

    const diffMs = Date.now() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  };

  const handleMarkAllRead = async () => {
    setMarkAllLoading(true);

    try {
      const response = await fetch("/api/notifications/mark-all-read", {
        method: "POST",
      });
      const payload = await response.json() as { success?: boolean };
      if (!response.ok || !payload.success) {
        throw new Error("Failed to mark all as read");
      }

      setUnreadCount(0);
      setNotifications((prev) => prev.map((item) => ({ ...item, is_read: true })));
    } catch {
      setNotificationsError("Unable to update notifications right now.");
    } finally {
      setMarkAllLoading(false);
    }
  };

  return (
    <nav className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* LEFT */}
        <div className="flex items-center gap-8">
          <Link href="/" className="flex h-14 shrink-0 items-center overflow-hidden">
            <Image
              src="/logo.png"
              alt="BrickInfinity"
              width={140}
              height={48}
              priority
              className="h-9 w-auto max-h-9 object-contain sm:h-10 sm:max-h-10"
            />
          </Link>

          {/* DESKTOP NAV */}
          <div className="hidden md:flex items-center gap-8 text-sm font-semibold text-gray-700">
            {filteredNav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="hover:text-red-600 transition-colors duration-200"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>

        {/* CENTER SEARCH */}
        <div className="hidden md:flex flex-1 justify-center px-8">
          <NavbarSearch />
        </div>

        {/* RIGHT */}
        <div className="hidden md:flex items-center gap-6 text-sm font-medium">
          {!user ? (
            <>
              <Link
                href="/login"
                className="hover:text-red-600 transition"
              >
                Login
              </Link>

              <Link
                href="/register"
                className="bg-red-600 hover:bg-red-700 text-white px-5 py-2 rounded-full shadow-sm transition"
              >
                Register
              </Link>
            </>
          ) : (
            <>
              {/* SAVED PROPERTIES */}
              {user && role !== USER_ROLES.ADMIN && (
                <Link
                  href="/property/dashboard/saved-properties"
                  className="relative text-gray-600 hover:text-red-600 transition transform hover:scale-110"
                  title="Saved Properties"
                >
                  <Heart size={20} />
                </Link>
              )}

              {/* NOTIFICATION */}
              <div className="relative" ref={notificationRef}>
                <button
                  onClick={() => setNotificationOpen((prev) => !prev)}
                  className="relative text-gray-600 hover:text-red-600 transition"
                  aria-label="Notifications"
                >
                  <Bell size={20} />
                  {unreadCount > 0 && (
                    <span className="absolute -top-2 -right-2 min-w-5 h-5 rounded-full bg-red-600 text-white text-[10px] leading-5 text-center px-1">
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  )}
                </button>

                {notificationOpen && (
                  <div className="absolute right-0 mt-3 w-80 bg-white rounded-xl shadow-xl border border-gray-100 z-50">
                    <div className="px-4 py-3 border-b font-semibold text-sm flex items-center justify-between">
                      <span>Notifications</span>
                      {unreadCount > 0 && (
                        <button
                          onClick={handleMarkAllRead}
                          disabled={markAllLoading}
                          className="text-xs text-red-600 hover:text-red-700 disabled:opacity-60"
                        >
                          {markAllLoading ? "Marking..." : "Mark all as read"}
                        </button>
                      )}
                    </div>

                    <div className="max-h-80 overflow-y-auto">
                      {notificationsLoading && (
                        <div className="px-4 py-6 text-sm text-gray-500 text-center">Loading notifications...</div>
                      )}

                      {!notificationsLoading && notificationsError && (
                        <div className="px-4 py-6 text-sm text-red-600 text-center">{notificationsError}</div>
                      )}

                      {!notificationsLoading && !notificationsError && notifications.length === 0 && (
                        <div className="px-4 py-6 text-sm text-gray-500 text-center">No notifications yet</div>
                      )}

                      {!notificationsLoading && !notificationsError && notifications.map((item) => (
                        <Link
                          key={item.id}
                          href={item.link_url || "/dashboard/notifications"}
                          onClick={() => setNotificationOpen(false)}
                          className={`block px-4 py-3 border-b border-gray-50 hover:bg-gray-50 ${item.is_read ? "bg-white" : "bg-red-50/40"}`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className={`text-sm ${item.is_read ? "text-gray-800" : "text-gray-900 font-semibold"}`}>{item.title}</p>
                            <span className="text-[10px] uppercase tracking-wide text-gray-500">{item.priority || item.category}</span>
                          </div>
                          <p className="text-xs text-gray-600 mt-1 line-clamp-2">{item.message}</p>
                          <p className="text-[11px] text-gray-400 mt-2">{formatNotificationTime(item.created_at)}</p>
                        </Link>
                      ))}
                    </div>

                    <div className="border-t text-center py-2 text-sm">
                      <Link
                        href="/dashboard/notifications"
                        onClick={() => setNotificationOpen(false)}
                      >
                        View All
                      </Link>
                    </div>
                  </div>
                )}
              </div>

              {/* ACCOUNT */}
              <div className="relative" ref={accountRef}>
                <button
                  onClick={() => setAccountOpen((prev) => !prev)}
                  className="flex items-center gap-2"
                >
                  {user.avatarUrl ? (
                    <Image
                      src={user.avatarUrl}
                      alt="Avatar"
                      width={32}
                      height={32}
                      className="rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-red-600 text-white flex items-center justify-center text-sm font-semibold">
                      {user.fullName
                        ? user.fullName.charAt(0).toUpperCase()
                        : user.email.charAt(0).toUpperCase()}
                    </div>
                  )}
                </button>

                {accountOpen && (
                  <div className="absolute right-0 mt-3 w-56 bg-white rounded-xl shadow-xl border border-gray-100 z-50">
                    <Link
                      href="/profile"
                      className="block px-4 py-3 hover:bg-gray-50"
                      onClick={() => setAccountOpen(false)}
                    >
                      Profile
                    </Link>

                    {role === USER_ROLES.SELLER && (
                      <Link
                        href="/dashboard/my-listings"
                        className="block px-4 py-3 hover:bg-gray-50"
                        onClick={() => setAccountOpen(false)}
                      >
                        My Listings
                      </Link>
                    )}

                    {role === USER_ROLES.ADMIN && (
                      <Link
                        href="/admin"
                        className="block px-4 py-3 hover:bg-gray-50"
                        onClick={() => setAccountOpen(false)}
                      >
                        Admin Panel
                      </Link>
                    )}

                    <div className="border-t border-gray-100" />

                    <div className="px-4 py-3">
                      <LogoutButton />
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* MOBILE TOGGLE */}
        <button
          className="md:hidden text-gray-700 z-50"
          onClick={() => setMobileOpen((prev) => !prev)}
        >
          {mobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* MOBILE OVERLAY */}
      <div
        className={`fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300 md:hidden ${
          mobileOpen ? "opacity-100 visible" : "opacity-0 invisible"
        }`}
        onClick={() => setMobileOpen(false)}
      />

      {/* MOBILE DRAWER */}
      <div
        className={`fixed top-0 right-0 h-full w-72 bg-white shadow-2xl transform transition-transform duration-300 md:hidden z-50 ${
          mobileOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="p-6 space-y-6 text-sm font-medium">
          {user && role !== USER_ROLES.ADMIN && (
            <Link
              href="/property/dashboard/saved-properties"
              onClick={() => setMobileOpen(false)}
              className="block"
            >
              Saved Properties
            </Link>
          )}

          {user && (
            <Link
              href="/dashboard/notifications"
              onClick={() => setMobileOpen(false)}
              className="block"
            >
              Notifications {unreadCount > 0 ? `(${unreadCount > 99 ? "99+" : unreadCount})` : ""}
            </Link>
          )}

          {filteredNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className="block text-gray-700 hover:text-red-600 transition"
            >
              {item.label}
            </Link>
          ))}

          <div className="border-t pt-6 space-y-4">
            {!user ? (
              <>
                <Link
                  href="/login"
                  onClick={() => setMobileOpen(false)}
                  className="block"
                >
                  Login
                </Link>

                <Link
                  href="/register"
                  onClick={() => setMobileOpen(false)}
                  className="block bg-red-600 text-white text-center py-2 rounded-full"
                >
                  Register
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/profile"
                  onClick={() => setMobileOpen(false)}
                  className="block"
                >
                  Profile
                </Link>

                {role === USER_ROLES.SELLER && (
                  <Link
                    href="/dashboard/my-listings"
                    onClick={() => setMobileOpen(false)}
                    className="block"
                  >
                    My Listings
                  </Link>
                )}

                {role === USER_ROLES.ADMIN && (
                  <Link
                    href="/admin"
                    onClick={() => setMobileOpen(false)}
                    className="block"
                  >
                    Admin Panel
                  </Link>
                )}

                <div className="pt-4">
                  <LogoutButton />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
