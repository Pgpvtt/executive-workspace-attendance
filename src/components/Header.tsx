import React from 'react';
import { Bell, Search } from 'lucide-react';
import { User } from '../types';

interface HeaderProps {
  user: User;
  title: string;
}

export default function Header({ user, title }: HeaderProps) {
  return (
    <header className="h-20 sticky top-0 z-30 bg-surface/80 backdrop-blur-xl flex justify-between items-center px-8 border-b border-outline-variant/10">
      <div className="flex flex-col">
        <h1 className="text-xl font-bold text-on-surface tracking-tight">{title}</h1>
        <p className="text-[10px] text-on-surface-variant font-bold uppercase tracking-widest">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
        </p>
      </div>

      <div className="flex items-center gap-6">
        <div className="hidden md:flex items-center bg-surface-container-low px-4 py-2 rounded-xl border border-outline-variant/5">
          <Search size={18} className="text-outline-variant mr-2" />
          <input 
            type="text" 
            placeholder="Search anything..." 
            className="bg-transparent border-none focus:ring-0 text-sm text-on-surface w-48"
          />
        </div>

        <div className="flex items-center gap-4">
          <button className="relative p-2 text-on-surface-variant hover:bg-surface-container rounded-full transition-colors">
            <Bell size={20} />
            <span className="absolute top-2 right-2 w-2 h-2 bg-error rounded-full border-2 border-surface"></span>
          </button>
          
          <div className="h-8 w-px bg-outline-variant/20 mx-2"></div>
          
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-xs font-bold text-on-surface">{user.name}</p>
              <p className="text-[10px] text-on-surface-variant font-black tracking-tighter">{user.code}</p>
            </div>
            <img 
              src={user.avatar} 
              alt={user.name} 
              className="w-10 h-10 rounded-full object-cover border-2 border-white shadow-sm"
            />
          </div>
        </div>
      </div>
    </header>
  );
}
