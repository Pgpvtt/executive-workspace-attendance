import React from 'react';
import { 
  LayoutDashboard, 
  CalendarDays, 
  Users, 
  ShieldCheck, 
  Palmtree, 
  Settings,
  LogOut,
  Building2,
  BarChart3,
  FileSpreadsheet
} from 'lucide-react';
import { User } from '../types';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  user: User;
  onLogout: () => void;
}

export default function Sidebar({ activeTab, setActiveTab, user, onLogout }: SidebarProps) {
  const menuItems = [
    { id: 'dashboard', label: user.role === 'admin' ? 'Admin Dashboard' : 'My Dashboard', icon: LayoutDashboard },
    { id: 'ceo', label: 'CEO Dashboard', icon: BarChart3, adminOnly: true },
    { id: 'calendar', label: 'Attendance Calendar', icon: CalendarDays },
    { id: 'team', label: 'Team Directory', icon: Users, adminOnly: true },
    { id: 'reports', label: 'Business Reports', icon: FileSpreadsheet, adminOnly: true },
    { id: 'rules', label: 'Policy Rules', icon: ShieldCheck, adminOnly: true },
    { id: 'holidays', label: 'Holidays', icon: Palmtree },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const filteredItems = menuItems.filter(item => !item.adminOnly || user.role === 'admin');

  return (
    <aside className="h-screen w-72 fixed left-0 top-0 bg-surface-container flex flex-col p-6 z-40 border-r border-outline-variant/10">
      <div className="flex items-center gap-3 mb-10 px-2">
        <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-white shadow-lg shadow-primary/20">
          <Building2 size={24} />
        </div>
        <span className="text-lg font-black text-primary tracking-tight">Executive Workspace</span>
      </div>

      <nav className="flex-1 space-y-1">
        {filteredItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${
              activeTab === item.id
                ? 'bg-white text-primary shadow-sm font-bold'
                : 'text-on-surface-variant hover:bg-white/50 hover:translate-x-1'
            }`}
          >
            <item.icon size={20} className={activeTab === item.id ? 'text-primary' : 'text-on-surface-variant group-hover:text-primary'} />
            <span className="text-sm tracking-wide">{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="mt-auto pt-6 border-t border-outline-variant/10">
        <div className="flex items-center gap-3 p-2 mb-4">
          <img 
            src={user.avatar} 
            alt={user.name} 
            className="w-10 h-10 rounded-full object-cover border-2 border-white shadow-sm"
          />
          <div className="overflow-hidden">
            <p className="text-sm font-bold text-on-surface truncate">{user.name}</p>
            <p className="text-[10px] text-on-surface-variant uppercase font-black tracking-widest">{user.role} Level</p>
          </div>
        </div>
        <button 
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-4 py-3 text-error hover:bg-error/5 rounded-xl transition-all group"
        >
          <LogOut size={20} />
          <span className="text-sm font-bold">Sign Out</span>
        </button>
      </div>
    </aside>
  );
}
