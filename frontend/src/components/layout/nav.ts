import type { CommonKey, CommonTranslator } from "@/i18n/messages";
import {
  AlertCircle,
  Clock,
  FileText,
  FolderTree,
  Heart,
  Image,
  LayoutDashboard,
  MessageCircle,
  Search,
  Settings,
  Share2,
  TestTube,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  path: string;
  labelKey: CommonKey;
  icon: LucideIcon;
}

/** Primary navigation, shared by the desktop SideNav and the mobile
 *  NavDrawer so the two can never drift. */
export const NAV_ITEMS: NavItem[] = [
  { path: "/", labelKey: "nav.dashboard", icon: LayoutDashboard },
  { path: "/patients", labelKey: "nav.patients", icon: Users },
  { path: "/documents", labelKey: "nav.documents", icon: FileText },
  { path: "/timeline", labelKey: "nav.timeline", icon: Clock },
  { path: "/events", labelKey: "nav.events", icon: Heart },
  { path: "/unclassified", labelKey: "nav.unclassified", icon: AlertCircle },
  { path: "/lab-results", labelKey: "nav.labResults", icon: TestTube },
  { path: "/imaging", labelKey: "nav.imaging", icon: Image },
  { path: "/chat", labelKey: "nav.chat", icon: MessageCircle },
  { path: "/search", labelKey: "nav.search", icon: Search },
  { path: "/shares", labelKey: "nav.shares", icon: Share2 },
];

/** Secondary destinations that live outside the main list. */
export const SECONDARY_NAV_ITEMS: NavItem[] = [
  { path: "/settings", labelKey: "nav.settings", icon: Settings },
  { path: "/files", labelKey: "nav.files", icon: FolderTree },
];

// Titles for every top-level route, including the ones that were moved
// out of the main nav but still exist as pages (Settings, Files).
const PAGE_TITLES: Record<string, CommonKey> = {
  "/": "nav.dashboard",
  "/patients": "nav.patients",
  "/documents": "nav.documents",
  "/timeline": "nav.timeline",
  "/events": "nav.events",
  "/unclassified": "nav.unclassified",
  "/lab-results": "nav.labResults",
  "/imaging": "nav.imaging",
  "/chat": "nav.chat",
  "/search": "nav.search",
  "/shares": "nav.shares",
  "/settings": "nav.settings",
  "/files": "nav.files",
};

export function pageTitleFor(pathname: string, t: CommonTranslator): string {
  if (pathname === "/") return t(PAGE_TITLES["/"]);
  // Longest-prefix match so /settings/analysis/providers still reads
  // "Settings" rather than falling through.
  const sorted = Object.keys(PAGE_TITLES)
    .filter((p) => p !== "/")
    .sort((a, b) => b.length - a.length);
  const match = sorted.find(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
  return match ? t(PAGE_TITLES[match]) : "";
}

export function isNavItemActive(path: string, pathname: string): boolean {
  return path === "/" ? pathname === "/" : pathname.startsWith(path);
}
