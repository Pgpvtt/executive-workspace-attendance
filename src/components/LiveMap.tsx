import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Store, StoreVisit, User } from '../types';
import { dataService } from '../services/dataService';

// Fix for default marker icons in Leaflet + React
// @ts-ignore
import markerIcon from 'leaflet/dist/images/marker-icon.png';
// @ts-ignore
import markerIconRetina from 'leaflet/dist/images/marker-icon-2x.png';
// @ts-ignore
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

const DefaultIcon = L.icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIconRetina,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const EmployeeIcon = L.divIcon({
  className: 'custom-div-icon',
  html: `<div style="background-color: #3b82f6; width: 30px; height: 30px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3); display: flex; items-center; justify-content: center; color: white; font-weight: bold; font-size: 12px;">E</div>`,
  iconSize: [30, 30],
  iconAnchor: [15, 15]
});

const StoreIcon = L.divIcon({
  className: 'custom-div-icon',
  html: `<div style="background-color: #10b981; width: 24px; height: 24px; border-radius: 4px; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3); display: flex; items-center; justify-content: center; color: white; font-weight: bold; font-size: 10px;">S</div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12]
});

L.Marker.prototype.options.icon = DefaultIcon;

interface LiveMapProps {
  stores: Store[];
  activeVisits: StoreVisit[];
  users: User[];
}

function ChangeView({ center, zoom }: { center: [number, number], zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
  }, [center, zoom, map]);
  return null;
}

export default function LiveMap({ stores, activeVisits, users }: LiveMapProps) {
  const [filter, setFilter] = useState({
    employeeId: '',
    department: '',
    status: 'active' as 'active' | 'all'
  });

  const departments = Array.from(new Set(users.map(u => u.department)));
  
  const filteredVisits = activeVisits.filter(v => {
    const user = users.find(u => u.id === v.employeeId);
    if (!user) return false;
    
    if (filter.employeeId && v.employeeId !== filter.employeeId) return false;
    if (filter.department && user.department !== filter.department) return false;
    
    return true;
  });

  // Default center (e.g., first store or a general location)
  const defaultCenter: [number, number] = stores.length > 0 
    ? [stores[0].latitude, stores[0].longitude] 
    : [40.7128, -74.0060];

  return (
    <div className="bg-white rounded-3xl border border-outline-variant/10 shadow-sm overflow-hidden">
      <div className="p-6 border-b border-outline-variant/10 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-black text-on-surface tracking-tight">Live Field Tracking</h3>
          <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Real-time movement visualization</p>
        </div>
        
        <div className="flex flex-wrap gap-2">
          <select 
            value={filter.employeeId}
            onChange={(e) => setFilter({ ...filter, employeeId: e.target.value })}
            className="px-3 py-1.5 bg-surface-container text-[10px] font-black rounded-xl border-none focus:ring-2 focus:ring-primary/20 uppercase tracking-widest"
          >
            <option value="">All Employees</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          
          <select 
            value={filter.department}
            onChange={(e) => setFilter({ ...filter, department: e.target.value })}
            className="px-3 py-1.5 bg-surface-container text-[10px] font-black rounded-xl border-none focus:ring-2 focus:ring-primary/20 uppercase tracking-widest"
          >
            <option value="">All Departments</option>
            {departments.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
      </div>

      <div className="h-[500px] w-full relative z-0">
        <MapContainer center={defaultCenter} zoom={13} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          
          {/* Store Markers */}
          {stores.map(store => (
            <Marker 
              key={store.id} 
              position={[store.latitude, store.longitude]} 
              icon={StoreIcon}
            >
              <Popup>
                <div className="p-1">
                  <p className="font-black text-xs uppercase tracking-widest text-primary">{store.name}</p>
                  <p className="text-[10px] font-medium text-on-surface-variant">Radius: {store.allowedRadius}m</p>
                </div>
              </Popup>
            </Marker>
          ))}

          {/* Employee Markers and Paths */}
          {filteredVisits.map(visit => {
            const user = users.find(u => u.id === visit.employeeId);
            const pathPoints = visit.path ? visit.path.map(p => [p.lat, p.lng] as [number, number]) : [];
            
            return (
              <React.Fragment key={visit.id}>
                {pathPoints.length > 1 && (
                  <Polyline 
                    positions={pathPoints} 
                    color="#3b82f6" 
                    weight={3} 
                    opacity={0.6} 
                    dashArray="5, 10"
                  />
                )}
                
                <Marker 
                  position={[visit.latitude, visit.longitude]} 
                  icon={EmployeeIcon}
                >
                  <Popup>
                    <div className="p-2 min-w-[150px]">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-[10px] font-black text-white">
                          {user?.name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-black text-xs text-on-surface">{user?.name}</p>
                          <p className="text-[8px] font-black text-primary uppercase tracking-widest">{user?.department}</p>
                        </div>
                      </div>
                      
                      <div className="space-y-1 border-t border-outline-variant/10 pt-2">
                        <div className="flex justify-between">
                          <span className="text-[8px] font-black text-on-surface-variant uppercase tracking-widest">At Store</span>
                          <span className="text-[8px] font-bold text-on-surface">{visit.storeName}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[8px] font-black text-on-surface-variant uppercase tracking-widest">Distance</span>
                          <span className="text-[8px] font-bold text-on-surface">{Math.round(visit.distanceFromStore)}m</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[8px] font-black text-on-surface-variant uppercase tracking-widest">Started</span>
                          <span className="text-[8px] font-bold text-on-surface">{new Date(visit.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              </React.Fragment>
            );
          })}
        </MapContainer>
      </div>
    </div>
  );
}
