import { requireNativeModule } from 'expo-modules-core';
import type { EventEmitter } from 'expo-modules-core';

export type NearbyBlePeer = {
  id: string;
  name: string;
  rssi: number;
};

export type BlePeerConnection = {
  id: string;
  connected: boolean;
};

export type BleReceivedMessage = {
  id: string;
  text: string;
};

type SafePathBleEvents = {
  onPeerFound: (event: NearbyBlePeer) => void;
  onPeerConnection: (event: BlePeerConnection & { error?: string; name?: string }) => void;
  onMessageReceived: (event: BleReceivedMessage) => void;
  onBluetoothStatus: (event: { ready: boolean; error?: string }) => void;
};

type SafePathBleNativeModule = EventEmitter<SafePathBleEvents> & {
  start(deviceName: string): Promise<void>;
  startScan(durationMs: number): Promise<void>;
  stopScan(): Promise<void>;
  connect(deviceId: string): Promise<void>;
  disconnect(deviceId: string): Promise<void>;
  sendMessage(deviceId: string, text: string): Promise<boolean>;
  stop(): Promise<void>;
};

function getNativeModule() {
  return requireNativeModule<SafePathBleNativeModule>('SafePathBle');
}

export const SafePathBle = {
  start: (deviceName: string) => getNativeModule().start(deviceName),
  startScan: (durationMs: number) => getNativeModule().startScan(durationMs),
  stopScan: () => getNativeModule().stopScan(),
  connect: (deviceId: string) => getNativeModule().connect(deviceId),
  disconnect: (deviceId: string) => getNativeModule().disconnect(deviceId),
  sendMessage: (deviceId: string, text: string) => getNativeModule().sendMessage(deviceId, text),
  stop: () => getNativeModule().stop(),
};

export function addBleListener(
  eventName: 'onPeerFound',
  listener: (event: NearbyBlePeer) => void,
): ReturnType<SafePathBleNativeModule['addListener']>;
export function addBleListener(
  eventName: 'onPeerConnection',
  listener: (event: BlePeerConnection & { error?: string; name?: string }) => void,
): ReturnType<SafePathBleNativeModule['addListener']>;
export function addBleListener(
  eventName: 'onMessageReceived',
  listener: (event: BleReceivedMessage) => void,
): ReturnType<SafePathBleNativeModule['addListener']>;
export function addBleListener(
  eventName: 'onBluetoothStatus',
  listener: (event: { ready: boolean; error?: string }) => void,
): ReturnType<SafePathBleNativeModule['addListener']>;
export function addBleListener(
  eventName: 'onPeerFound' | 'onPeerConnection' | 'onMessageReceived' | 'onBluetoothStatus',
  listener: ((event: NearbyBlePeer) => void)
    | ((event: BlePeerConnection & { error?: string; name?: string }) => void)
    | ((event: BleReceivedMessage) => void)
    | ((event: { ready: boolean; error?: string }) => void),
) {
  const nativeModule = getNativeModule();
  if (eventName === 'onPeerFound') {
    return nativeModule.addListener(eventName, listener as (event: NearbyBlePeer) => void);
  }
  if (eventName === 'onPeerConnection') {
    return nativeModule.addListener(
      eventName,
      listener as (event: BlePeerConnection & { error?: string; name?: string }) => void,
    );
  }
  if (eventName === 'onMessageReceived') {
    return nativeModule.addListener(eventName, listener as (event: BleReceivedMessage) => void);
  }
  return nativeModule.addListener(eventName, listener as (event: { ready: boolean; error?: string }) => void);
}
