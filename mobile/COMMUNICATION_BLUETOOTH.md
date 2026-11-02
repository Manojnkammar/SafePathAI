# Bluetooth communication

The Communication screen uses Android Bluetooth Low Energy (BLE) to discover
other SafePath AI app instances, establish direct connections, and deliver a
typed help message to connected peers. It displays real devices reported by
the Bluetooth scan; it does not create sample peers. Up to five devices can be
saved. Signal strength is shown as a qualitative estimate, not a distance.

Both devices must be Android devices with Bluetooth enabled, the required
Nearby devices permissions granted, and the SafePath AI Communication screen
open. The local BLE service advertises while that screen is open and stops
when the user leaves it. Messages are sent only to connected peers; normal
phone SMS, internet delivery, and background delivery are not included.

BLE messages in this implementation are not end-to-end encrypted and peers
are not cryptographically authenticated. Do not send sensitive personal
information. A successful send means the connected peer's Bluetooth service
accepted the message; it does not mean someone read it or can respond.

This is a local Expo native module, so Expo Go and web cannot use Bluetooth
communication. Build and install the Android app with a native development
build, for example `npx expo run:android`, after configuring the Android SDK.
The first build runs Expo prebuild and autolinks the module under
`modules/safepath-ble`. Test with two physical Android devices; emulators do
not reliably support BLE advertising and peer-to-peer connections.
