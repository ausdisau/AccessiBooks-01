import type React from "react";
import { Book as BookIcon, Play, Home, MessageCircle, Clock, Star, ListMusic, Megaphone, Wallet, BarChart3, Settings2, Crown, Trophy, Gift, Upload, Radio, Users, Heart, Building2, Shield, Activity, LibraryBig, GraduationCap, HeartHandshake, Download as DownloadIcon } from "lucide-react";

export type SidebarMode = "full" | "rail" | "hidden";

export const sidebarNavGroups: { label: string; items: { path: string; label: string; icon: React.ReactNode }[] }[] = [
  {
    label: "Browse",
    items: [
      { path: "/", label: "Library", icon: <BookIcon className="h-5 w-5" /> },
      { path: "/player", label: "Player", icon: <Play className="h-5 w-5" /> },
      { path: "/loans", label: "Loans", icon: <LibraryBig className="h-5 w-5" /> },
      { path: "/downloads", label: "Downloads", icon: <DownloadIcon className="h-5 w-5" /> },
      { path: "/word-bank", label: "Word Bank", icon: <GraduationCap className="h-5 w-5" /> },
      { path: "/achievements", label: "Achievements", icon: <Trophy className="h-5 w-5" /> },
    ],
  },
  {
    label: "Discover",
    items: [
      { path: "/hub", label: "Hub", icon: <Home className="h-5 w-5" /> },
      { path: "/community", label: "Community", icon: <MessageCircle className="h-5 w-5" /> },
      { path: "/events", label: "Events", icon: <Clock className="h-5 w-5" /> },
      { path: "/feed", label: "Feed", icon: <Star className="h-5 w-5" /> },
      { path: "/accessible-picks", label: "Picks", icon: <HeartHandshake className="h-5 w-5" /> },
      { path: "/queue", label: "Queue", icon: <ListMusic className="h-5 w-5" /> },
      { path: "/party", label: "Party", icon: <Radio className="h-5 w-5" /> },
      { path: "/social", label: "Social", icon: <Users className="h-5 w-5" /> },
    ],
  },
  {
    label: "Create",
    items: [
      { path: "/publish", label: "Publish", icon: <Upload className="h-5 w-5" /> },
      { path: "/advertise", label: "Advertise", icon: <Megaphone className="h-5 w-5" /> },
    ],
  },
  {
    label: "Account",
    items: [
      { path: "/settings", label: "Settings", icon: <Settings2 className="h-5 w-5" /> },
      { path: "/pricing", label: "Plans", icon: <Crown className="h-5 w-5" /> },
      { path: "/stats", label: "Stats", icon: <Trophy className="h-5 w-5" /> },
      { path: "/usage", label: "Usage", icon: <BarChart3 className="h-5 w-5" /> },
      { path: "/billing", label: "Billing", icon: <Wallet className="h-5 w-5" /> },
      { path: "/referrals", label: "Referrals", icon: <Gift className="h-5 w-5" /> },
      { path: "/family", label: "Family", icon: <Heart className="h-5 w-5" /> },
      { path: "/enterprise", label: "Enterprise", icon: <Building2 className="h-5 w-5" /> },
    ],
  },
  {
    label: "Admin",
    items: [
      { path: "/moderation", label: "Moderation", icon: <Shield className="h-5 w-5" /> },
      { path: "/health", label: "Health", icon: <Activity className="h-5 w-5" /> },
      { path: "/analytics", label: "Analytics", icon: <BarChart3 className="h-5 w-5" /> },
      { path: "/admin/entitlements", label: "Entitlements", icon: <Shield className="h-5 w-5" /> },
    ],
  },
];
