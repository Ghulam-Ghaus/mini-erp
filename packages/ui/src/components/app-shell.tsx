import {
  ArrowLeft,
  ArrowRight,
  Bell,
  ChevronDown,
  ChevronRight,
  KeyRound,
  Languages,
  Lock,
  LogOut,
  MoreHorizontal,
  PanelLeft,
  Search,
  User as UserIcon,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useHotkeys } from '../hooks/use-hotkeys.js';
import { Button } from './button.js';

export interface NavSubItem {
  readonly id: string;
  readonly label: string;
}

export interface NavItem {
  readonly id: string;
  readonly label: string;
  readonly icon: ReactNode;
  readonly badgeCount?: number;
  readonly children?: readonly NavSubItem[];
}

export type UserMenuAction = 'profile' | 'change-pin' | 'lock' | 'logout';

export interface AppShellUser {
  readonly name: string;
  readonly role: string;
  readonly initials: string;
}

export interface AppShellLabels {
  readonly appName: string;
  readonly developedBy?: string;
  readonly toggleSidebar: string;
  readonly quickSearch: string;
  readonly notifications: string;
  readonly languageToggle: string;
  readonly userMenu: {
    readonly profile: string;
    readonly changePin: string;
    readonly lock: string;
    readonly logout: string;
  };
}

export interface AppShellProps {
  readonly navItems: readonly NavItem[];
  readonly activeNavId: string;
  readonly onSelectNav: (navId: string) => void;
  readonly canGoBack?: boolean;
  readonly canGoForward?: boolean;
  readonly onBack?: () => void;
  readonly onForward?: () => void;
  readonly user: AppShellUser;
  readonly onUserMenuAction: (action: UserMenuAction) => void;
  readonly onOpenSearch: () => void;
  readonly onToggleLanguage: () => void;
  readonly notificationCount?: number;
  readonly statusBanner?: ReactNode;
  readonly labels: AppShellLabels;
  readonly children: ReactNode;
}

/**
 * Standard AppShell (Section 5.2 & Section 10):
 * - Collapsible sidebar (toggle button + Ctrl+B), collapses to icons.
 * - Full Section 5.2 menu tree with expandable sub-items.
 * - Bottom user avatar + 3-dot menu (Profile, Change PIN, Lock, Logout).
 * - Topbar with breadcrumbs, quick search (Ctrl+K), language toggle (EN/UR), and notification bell.
 */
export function AppShell({
  navItems,
  activeNavId,
  onSelectNav,
  canGoBack = false,
  canGoForward = false,
  onBack,
  onForward,
  user,
  onUserMenuAction,
  onOpenSearch,
  onToggleLanguage,
  notificationCount = 0,
  statusBanner,
  labels,
  children,
}: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    sales: true,
    purchases: true,
    clients: false,
    recovery: false,
    suppliers: false,
  });
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useHotkeys([
    {
      key: 'b',
      ctrlOrMeta: true,
      handler: () => setCollapsed((c) => !c),
    },
    {
      key: 'k',
      ctrlOrMeta: true,
      handler: () => onOpenSearch(),
    },
    {
      key: 'ArrowLeft',
      alt: true,
      handler: () => {
        if (canGoBack) onBack?.();
      },
    },
    {
      key: 'ArrowRight',
      alt: true,
      handler: () => {
        if (canGoForward) onForward?.();
      },
    },
  ]);

  useEffect(() => {
    if (!userMenuOpen) return;
    const onOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [userMenuOpen]);

  const toggleGroup = (groupId: string) => {
    if (collapsed) {
      setCollapsed(false);
      setExpandedGroups((prev) => ({ ...prev, [groupId]: true }));
      return;
    }
    setExpandedGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#f7f6f2] text-[#1f1e1b]">
      {/* Collapsible Sidebar */}
      <aside
        aria-label="Sidebar"
        className={`flex h-full shrink-0 flex-col border-e border-[#e4e2da] bg-[#f1efe9] transition-[width] duration-150 ${
          collapsed ? 'w-14' : 'w-60'
        }`}
      >
        {/* Top brand + collapse button */}
        <div className="flex h-11 items-center justify-between border-b border-[#e4e2da] px-3">
          {!collapsed && (
            <span className="truncate text-sm font-semibold tracking-tight text-[#1f1e1b]">
              {labels.appName}
            </span>
          )}
          <button
            type="button"
            title={`${labels.toggleSidebar} (Ctrl+B)`}
            aria-label={labels.toggleSidebar}
            onClick={() => setCollapsed((c) => !c)}
            className="inline-flex h-7 w-7 items-center justify-center rounded text-[#5c5a53] hover:bg-[#e2dfd6] hover:text-[#1f1e1b] cursor-pointer"
          >
            <PanelLeft className="h-4 w-4" />
          </button>
        </div>

        {/* Navigation tree */}
        <nav className="flex-1 overflow-y-auto px-2 py-2 text-xs">
          <ul className="flex flex-col gap-0.5">
            {navItems.map((item) => {
              const hasChildren = Boolean(item.children && item.children.length > 0);
              const isChildActive =
                item.children?.some((child) => child.id === activeNavId) ?? false;
              const isActive = item.id === activeNavId || isChildActive;
              const isExpanded = Boolean(expandedGroups[item.id]);

              return (
                <li key={item.id}>
                  <button
                    type="button"
                    title={collapsed ? item.label : undefined}
                    onClick={() => {
                      if (hasChildren) {
                        toggleGroup(item.id);
                        if (item.children?.[0] && !isChildActive) {
                          onSelectNav(item.children[0].id);
                        }
                      } else {
                        onSelectNav(item.id);
                      }
                    }}
                    className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-start transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-[#e2dfd6] font-semibold text-[#1f1e1b]'
                        : 'text-[#5c5a53] hover:bg-[#eae8e1] hover:text-[#1f1e1b]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 overflow-hidden">
                      <span className="shrink-0">{item.icon}</span>
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </div>
                    {!collapsed && (
                      <div className="flex items-center gap-1">
                        {item.badgeCount !== undefined && item.badgeCount > 0 && (
                          <span className="erp-num rounded bg-[#2c2b28] px-1.5 py-0.5 text-[10px] font-medium text-white">
                            {item.badgeCount}
                          </span>
                        )}
                        {hasChildren &&
                          (isExpanded ? (
                            <ChevronDown className="h-3.5 w-3.5 text-[#8c8980]" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5 text-[#8c8980] rtl:rotate-180" />
                          ))}
                      </div>
                    )}
                  </button>

                  {!collapsed && hasChildren && isExpanded && (
                    <ul className="mt-0.5 ms-5 flex flex-col gap-0.5 border-s border-[#d6d3c9] ps-2">
                      {item.children?.map((sub) => {
                        const subActive = sub.id === activeNavId;
                        return (
                          <li key={sub.id}>
                            <button
                              type="button"
                              onClick={() => onSelectNav(sub.id)}
                              className={`flex w-full items-center rounded px-2 py-1 text-start cursor-pointer ${
                                subActive
                                  ? 'bg-[#e2dfd6] font-medium text-[#1f1e1b]'
                                  : 'text-[#5c5a53] hover:bg-[#eae8e1] hover:text-[#1f1e1b]'
                              }`}
                            >
                              <span className="truncate">{sub.label}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Bottom user avatar + 3-dot menu (Section 5.2) */}
        <div ref={userMenuRef} className="relative border-t border-[#e4e2da] bg-[#ebe8e0] p-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 overflow-hidden">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#2c2b28] text-xs font-semibold text-white">
                {user.initials}
              </div>
              {!collapsed && (
                <div className="overflow-hidden text-xs">
                  <p className="truncate font-medium text-[#1f1e1b]">{user.name}</p>
                  <p className="truncate text-[11px] text-[#5c5a53]">{user.role}</p>
                </div>
              )}
            </div>
            <button
              type="button"
              aria-label="User menu"
              onClick={() => setUserMenuOpen((o) => !o)}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-[#5c5a53] hover:bg-[#dedbd1] hover:text-[#1f1e1b] cursor-pointer"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </div>

          {userMenuOpen && (
            <div className="absolute bottom-12 start-2 z-40 w-48 rounded border border-[#d6d3c9] bg-white py-1 text-xs shadow-sm">
              <button
                type="button"
                onClick={() => {
                  setUserMenuOpen(false);
                  onUserMenuAction('profile');
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-start text-[#1f1e1b] hover:bg-[#f1efe9] cursor-pointer"
              >
                <UserIcon className="h-3.5 w-3.5 text-[#5c5a53]" />
                <span>{labels.userMenu.profile}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setUserMenuOpen(false);
                  onUserMenuAction('change-pin');
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-start text-[#1f1e1b] hover:bg-[#f1efe9] cursor-pointer"
              >
                <KeyRound className="h-3.5 w-3.5 text-[#5c5a53]" />
                <span>{labels.userMenu.changePin}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setUserMenuOpen(false);
                  onUserMenuAction('lock');
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-start text-[#1f1e1b] hover:bg-[#f1efe9] cursor-pointer"
              >
                <Lock className="h-3.5 w-3.5 text-[#5c5a53]" />
                <span>{labels.userMenu.lock}</span>
              </button>
              <div className="my-1 border-t border-[#e4e2da]" />
              <button
                type="button"
                onClick={() => {
                  setUserMenuOpen(false);
                  onUserMenuAction('logout');
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-start text-[#9e3b33] hover:bg-[#fbf2f1] cursor-pointer"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>{labels.userMenu.logout}</span>
              </button>
            </div>
          )}

          {!collapsed && labels.developedBy && (
            <div className="mt-1.5 truncate border-t border-[#e0ddd4] pt-1.5 text-center text-[10px] text-[#7a7870]">
              {labels.developedBy}
            </div>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Topbar */}
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-[#e4e2da] bg-white px-5">
          <div className="flex items-center gap-2">
            {(onBack || onForward) && (
              <div className="flex items-center gap-0.5 pe-1">
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Back"
                  title="Back (Alt+Left)"
                  disabled={!canGoBack}
                  onClick={onBack}
                  icon={<ArrowLeft className="h-3.5 w-3.5" />}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Forward"
                  title="Forward (Alt+Right)"
                  disabled={!canGoForward}
                  onClick={onForward}
                  icon={<ArrowRight className="h-3.5 w-3.5" />}
                />
              </div>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={onOpenSearch}
              icon={<Search className="h-3.5 w-3.5 text-[#8c8980]" />}
              shortcutHint="Ctrl+K"
            >
              {labels.quickSearch}
            </Button>
            {statusBanner}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={onToggleLanguage}
              icon={<Languages className="h-3.5 w-3.5" />}
            >
              {labels.languageToggle}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label={labels.notifications}
              onClick={() => onSelectNav('notifications')}
              icon={
                <span className="relative inline-flex">
                  <Bell className="h-4 w-4" />
                  {notificationCount > 0 && (
                    <span className="erp-num absolute -end-1.5 -top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[#9e3b33] px-1 text-[9px] font-bold text-white">
                      {notificationCount}
                    </span>
                  )}
                </span>
              }
            />
          </div>
        </div>

        {/* Page body */}
        <main className="flex flex-1 flex-col overflow-hidden">{children}</main>
      </div>
    </div>
  );
}
