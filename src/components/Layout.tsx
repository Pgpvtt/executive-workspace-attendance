import React from 'react';
import Sidebar from './Sidebar';
import Header from './Header';
import { User } from '../types';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  user: User;
  title: string;
  onLogout: () => void;
}

export default function Layout({ children, activeTab, setActiveTab, user, title, onLogout }: LayoutProps) {
  return (
    <div className="min-h-screen bg-surface">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} user={user} onLogout={onLogout} />
      <main className="ml-72 min-h-screen flex flex-col">
        <Header user={user} title={title} />
        <div className="flex-1 p-8 max-w-7xl mx-auto w-full">
          {children}
        </div>
      </main>
    </div>
  );
}
