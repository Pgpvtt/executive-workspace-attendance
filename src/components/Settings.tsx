import React, { useState, useEffect } from 'react';
import { Shield, Save, Camera, Building, Globe, Edit3, Loader2, MapPin, Timer } from 'lucide-react';
import { STORES } from '../lib/stores';
import { User, SystemRules } from '../types';
import { dataService } from '../services/dataService';

interface SettingsProps {
  user: User;
}

export default function Settings({ user }: SettingsProps) {
  const [rules, setRules]         = useState<SystemRules | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving]   = useState(false);

  const isAdmin = user.role === 'admin';

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const fetchedRules = await dataService.getRules();
        setRules(fetchedRules);
      } catch (err) {
        console.error('Settings load error:', err);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rules) return;
    setIsSaving(true);
    try {
      await dataService.saveRules(rules);
    } catch (err) {
      console.error('Save settings error:', err);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading || !rules) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <div className="flex justify-between items-end mb-8">
        <div>
          <h2 className="text-4xl font-black text-on-surface tracking-tight mb-2">General Settings</h2>
          <p className="text-on-surface-variant font-medium">Configure global application behavior and branding.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-10">
        <div className="md:col-span-7 space-y-8">
          <div className="bg-white rounded-[2rem] p-8 shadow-sm border border-outline-variant/10">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                <Building size={24} />
              </div>
              <div>
                <h3 className="font-black text-lg">Organization Profile</h3>
                <p className="text-xs text-on-surface-variant font-medium">Company branding and identity</p>
              </div>
            </div>

            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant ml-1">Company Name</label>
                <input
                  type="text"
                  value={rules.settings.companyName}
                  onChange={(e) => setRules({ ...rules, settings: { ...rules.settings, companyName: e.target.value } })}
                  disabled={!isAdmin}
                  className="w-full px-4 py-4 bg-surface-container-low border-none rounded-2xl focus:ring-2 focus:ring-primary/20 text-on-surface font-medium"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant ml-1">Timezone</label>
                <div className="relative">
                  <Globe className="absolute left-4 top-1/2 -translate-y-1/2 text-outline-variant" size={18} />
                  <select
                    value={rules.settings.timezone}
                    onChange={(e) => setRules({ ...rules, settings: { ...rules.settings, timezone: e.target.value } })}
                    disabled={!isAdmin}
                    className="w-full pl-12 pr-4 py-4 bg-surface-container-low border-none rounded-2xl focus:ring-2 focus:ring-primary/20 text-on-surface font-medium appearance-none"
                  >
                    <option value="UTC+5:30">UTC+5:30 (IST)</option>
                    <option value="UTC+0:00">UTC+0:00 (GMT)</option>
                    <option value="UTC-5:00">UTC-5:00 (EST)</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-[2rem] p-8 shadow-sm border border-outline-variant/10">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 rounded-2xl bg-secondary/10 flex items-center justify-center text-secondary">
                <Edit3 size={24} />
              </div>
              <div>
                <h3 className="font-black text-lg">App Permissions</h3>
                <p className="text-xs text-on-surface-variant font-medium">Control data modification rights</p>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 bg-surface-container-low rounded-2xl">
              <div className="flex flex-col">
                <span className="text-xs font-black uppercase tracking-widest text-on-surface">Allow Manual Edits</span>
                <span className="text-[10px] text-on-surface-variant font-medium">Enable admins to override attendance records</span>
              </div>
              <button
                onClick={() => isAdmin && setRules({ ...rules, settings: { ...rules.settings, allowManualEdits: !rules.settings.allowManualEdits } })}
                className={`w-10 h-5 rounded-full transition-all relative ${rules.settings.allowManualEdits ? 'bg-primary' : 'bg-outline-variant'}`}
              >
                <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${rules.settings.allowManualEdits ? 'left-6' : 'left-1'}`}></div>
              </button>
            </div>
          </div>

          <div className="bg-white rounded-[2rem] p-8 shadow-sm border border-outline-variant/10">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                <MapPin size={24} />
              </div>
              <div>
                <h3 className="font-black text-lg">Store Radius Configuration</h3>
                <p className="text-xs text-on-surface-variant font-medium">Override allowed check-in radius per store (metres)</p>
              </div>
            </div>

            <div className="space-y-3">
              {STORES.map(store => {
                const override = rules.settings.storeRadiusOverrides?.[store.id];
                const value = override !== undefined ? override : store.allowedRadius;
                return (
                  <div key={store.id} className="flex items-center gap-4 p-3 bg-surface-container-low rounded-2xl">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-black text-on-surface truncate">{store.name}</p>
                      <p className="text-[10px] text-on-surface-variant font-medium">Default: {store.allowedRadius}m</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={10}
                        max={5000}
                        step={10}
                        value={value}
                        disabled={!isAdmin}
                        onChange={e => {
                          const newRadius = parseInt(e.target.value, 10);
                          if (!isNaN(newRadius) && newRadius >= 10) {
                            setRules({
                              ...rules,
                              settings: {
                                ...rules.settings,
                                storeRadiusOverrides: {
                                  ...(rules.settings.storeRadiusOverrides ?? {}),
                                  [store.id]: newRadius,
                                },
                              },
                            });
                          }
                        }}
                        className="w-20 px-3 py-2 bg-white border border-outline-variant/20 rounded-xl text-xs font-black text-on-surface text-center focus:ring-2 focus:ring-primary/20 focus:outline-none"
                      />
                      <span className="text-[10px] font-medium text-on-surface-variant">m</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="md:col-span-5 space-y-8">
          <div className="bg-surface-container-high rounded-[2rem] p-8 border border-outline-variant/5 relative overflow-hidden">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center text-primary shadow-sm">
                <Shield size={24} />
              </div>
              <div>
                <h3 className="font-black text-lg">Identity Proof</h3>
                <p className="text-xs text-on-surface-variant font-medium">Enhanced security check</p>
              </div>
            </div>
            <p className="text-sm font-medium text-on-surface/80 leading-relaxed mb-8">
              Enforce mandatory biometric or photo verification at the point of entry and exit.
            </p>

            <div className="flex items-center justify-between p-4 bg-white/50 rounded-2xl mb-4">
              <div className="flex items-center gap-3">
                <Camera size={18} className="text-primary" />
                <span className="text-xs font-black uppercase tracking-widest text-on-surface">Photo Proof</span>
              </div>
              <button
                onClick={() => isAdmin && setRules({ ...rules, settings: { ...rules.settings, photoProofRequired: !rules.settings.photoProofRequired } })}
                className={`w-10 h-5 rounded-full transition-all relative ${rules.settings.photoProofRequired ? 'bg-primary' : 'bg-outline-variant'}`}
              >
                <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${rules.settings.photoProofRequired ? 'left-6' : 'left-1'}`}></div>
              </button>
            </div>

            <div className="p-4 bg-white/50 rounded-2xl mb-8">
              <div className="flex items-center gap-3 mb-3">
                <Timer size={18} className="text-primary" />
                <span className="text-xs font-black uppercase tracking-widest text-on-surface">Auto Check-out</span>
              </div>
              <p className="text-[10px] text-on-surface-variant font-medium mb-3">
                Automatically close store visits open longer than this. Set to 0 to disable.
              </p>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={24}
                  step={1}
                  value={rules.settings.autoCheckoutHours ?? 8}
                  disabled={!isAdmin}
                  onChange={e => setRules({ ...rules, settings: { ...rules.settings, autoCheckoutHours: parseInt(e.target.value, 10) } })}
                  className="flex-1 accent-primary"
                />
                <span className="text-xs font-black text-on-surface w-16 text-right">
                  {(rules.settings.autoCheckoutHours ?? 8) === 0 ? 'Off' : `${rules.settings.autoCheckoutHours ?? 8}h`}
                </span>
              </div>
            </div>

            {isAdmin && (
              <button
                onClick={handleSaveSettings}
                disabled={isSaving}
                className="w-full bg-primary text-white py-4 rounded-2xl font-black shadow-xl shadow-primary/20 flex items-center justify-center gap-2 uppercase tracking-widest text-xs disabled:opacity-70"
              >
                {isSaving ? <><Loader2 size={18} className="animate-spin" /> Saving...</> : <><Save size={18} /> Save Settings</>}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
