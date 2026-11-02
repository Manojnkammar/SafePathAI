import { PermissionsAndroid, Platform } from 'react-native';
import {
  SafePathBle,
  addBleListener,
  type BlePeerConnection,
  type BleReceivedMessage,
  type NearbyBlePeer,
} from '../../modules/safepath-ble';

export type { BlePeerConnection, BleReceivedMessage, NearbyBlePeer };

export async function requestNearbyBluetoothPermissions(): Promise<void> {
  if (Platform.OS !== 'android') {
    throw new Error('Bluetooth peer communication is available in the Android app build only.');
  }

  const permissions = Number(Platform.Version) >= 31
    ? [
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
      ]
    : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
  const results = await PermissionsAndroid.requestMultiple(permissions);
  const denied = permissions.filter((permission) => results[permission] !== PermissionsAndroid.RESULTS.GRANTED);
  if (denied.length > 0) {
    throw new Error('Allow Nearby devices and Bluetooth permissions to find and connect to SafePath peers.');
  }
}

export const nearbyBluetooth = SafePathBle;
export const addNearbyBluetoothListener = addBleListener;
