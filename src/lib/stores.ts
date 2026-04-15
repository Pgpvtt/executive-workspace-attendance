import type { Store } from '../types';

export const STORES: Store[] = [
  { id: 's1', name: 'Downtown Plaza',   latitude: 40.7128,  longitude: -74.0060,  allowedRadius: 100 },
  { id: 's2', name: 'Westside Mall',    latitude: 34.0522,  longitude: -118.2437, allowedRadius: 150 },
  { id: 's3', name: 'North Point Hub',  latitude: 41.8781,  longitude: -87.6298,  allowedRadius: 100 },
  { id: 's4', name: 'South Station',    latitude: 29.7604,  longitude: -95.3698,  allowedRadius: 200 },
  { id: 's5', name: 'East Gate Center', latitude: 33.7490,  longitude: -84.3880,  allowedRadius: 100 },
];
