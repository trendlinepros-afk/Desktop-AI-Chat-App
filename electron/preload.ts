import { contextBridge, ipcRenderer } from 'electron';
import type { WickedAPI } from '../src/types';
import { RPC_CHANNELS } from './rpcMap';

// window.polyglot is generated from the shared method → channel map
// (rpcMap.ts). The LAN web portal builds its browser bridge from the same map,
// so the desktop and browser API surfaces stay identical by construction.
// Every method is a plain passthrough: method(...args) → invoke(channel, ...args).
const api = Object.fromEntries(
  Object.entries(RPC_CHANNELS).map(([method, channel]) => [
    method,
    (...args: unknown[]) => ipcRenderer.invoke(channel, ...args),
  ])
) as unknown as WickedAPI;

contextBridge.exposeInMainWorld('polyglot', api);
