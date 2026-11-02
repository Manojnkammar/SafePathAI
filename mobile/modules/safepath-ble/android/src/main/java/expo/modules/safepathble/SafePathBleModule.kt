package expo.modules.safepathble

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattServer
import android.bluetooth.BluetoothGattServerCallback
import android.bluetooth.BluetoothGattService
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.ParcelUuid
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.nio.ByteBuffer
import java.nio.charset.StandardCharsets
import java.util.ArrayDeque
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import kotlin.math.min

private val PEER_SERVICE_UUID: UUID = UUID.fromString("57f891ce-2a52-4a6c-9c2a-636c64700001")
private val MESSAGE_CHARACTERISTIC_UUID: UUID = UUID.fromString("57f891ce-2a52-4a6c-9c2a-636c64700002")
private val IDENTITY_CHARACTERISTIC_UUID: UUID = UUID.fromString("57f891ce-2a52-4a6c-9c2a-636c64700003")
private const val MESSAGE_LIMIT_BYTES = 4096

class SafePathBleModule : Module() {
  private data class MessageAssembly(val totalChunks: Int, val chunks: Array<ByteArray?>)
  private data class PendingTransfer(val chunks: List<ByteArray>, val promise: Promise, var nextChunk: Int = 0)
  private data class RemoteConnection(
    val gatt: BluetoothGatt,
    var messageCharacteristic: BluetoothGattCharacteristic? = null,
    var mtu: Int = 23,
    val transfers: ArrayDeque<PendingTransfer> = ArrayDeque()
  )

  private val handler = Handler(Looper.getMainLooper())
  private val remoteConnections = ConcurrentHashMap<String, RemoteConnection>()
  private val assemblies = ConcurrentHashMap<String, MessageAssembly>()
  private var gattServer: BluetoothGattServer? = null
  private var gattServiceReady = false
  private var advertiseAfterServiceAdded = false
  private var advertiserCallback: AdvertiseCallback? = null
  private var scanCallback: ScanCallback? = null
  private var scanStopRunnable: Runnable? = null
  private var localDeviceName = "SafePath device"

  override fun definition() = ModuleDefinition {
    Name("SafePathBle")
    Events("onPeerFound", "onPeerConnection", "onMessageReceived", "onBluetoothStatus")

    AsyncFunction("start") { deviceName: String ->
      startBle(deviceName)
    }

    AsyncFunction("startScan") { durationMs: Double ->
      startBleScan(durationMs.toLong())
    }

    AsyncFunction("stopScan") {
      stopBleScan()
    }

    AsyncFunction("connect") { deviceId: String ->
      connectToPeer(deviceId)
    }

    AsyncFunction("disconnect") { deviceId: String ->
      remoteConnections.remove(deviceId)?.gatt?.disconnect()
      emitConnection(deviceId, false)
    }

    AsyncFunction("sendMessage") { deviceId: String, text: String, promise: Promise ->
      enqueueMessage(deviceId, text, promise)
    }

    AsyncFunction("stop") {
      stopBle()
    }

    OnDestroy {
      stopBle()
    }
  }

  private val context: Context
    get() = appContext.reactContext?.applicationContext
      ?: throw IllegalStateException("SafePath Bluetooth is unavailable because the React context was destroyed.")

  private val adapter: BluetoothAdapter
    get() = (context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter
      ?: throw IllegalStateException("This device does not support Bluetooth.")

  @SuppressLint("MissingPermission")
  private fun startBle(deviceName: String) {
    val bluetoothAdapter = adapter
    if (!bluetoothAdapter.isEnabled) throw IllegalStateException("Turn on Bluetooth to connect to nearby SafePath devices.")
    if (!bluetoothAdapter.isMultipleAdvertisementSupported || bluetoothAdapter.bluetoothLeAdvertiser == null) {
      throw IllegalStateException("This device cannot advertise a SafePath Bluetooth connection.")
    }

    localDeviceName = deviceName.trim().take(24).ifBlank { "SafePath device" }
    if (gattServer == null) {
      gattServer = (context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager)
        .openGattServer(context, gattServerCallback)
        ?: throw IllegalStateException("Could not start the Bluetooth message service.")
      val service = BluetoothGattService(PEER_SERVICE_UUID, BluetoothGattService.SERVICE_TYPE_PRIMARY)
      service.addCharacteristic(
        BluetoothGattCharacteristic(
          MESSAGE_CHARACTERISTIC_UUID,
          BluetoothGattCharacteristic.PROPERTY_WRITE or BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE,
          BluetoothGattCharacteristic.PERMISSION_WRITE
        )
      )
      service.addCharacteristic(
        BluetoothGattCharacteristic(
          IDENTITY_CHARACTERISTIC_UUID,
          BluetoothGattCharacteristic.PROPERTY_READ,
          BluetoothGattCharacteristic.PERMISSION_READ
        )
      )
      gattServiceReady = false
      advertiseAfterServiceAdded = true
      if (!gattServer!!.addService(service)) {
        advertiseAfterServiceAdded = false
        gattServer?.close()
        gattServer = null
        throw IllegalStateException("Could not register the SafePath Bluetooth service.")
      }
      return
    }

    startAdvertising(bluetoothAdapter)
  }

  @SuppressLint("MissingPermission")
  private fun startAdvertising(bluetoothAdapter: BluetoothAdapter) {
    if (advertiserCallback != null || !gattServiceReady) return
    val callback = object : AdvertiseCallback() {
      override fun onStartSuccess(settingsInEffect: AdvertiseSettings) {
        sendEvent("onBluetoothStatus", mapOf("ready" to true))
      }

      override fun onStartFailure(errorCode: Int) {
        advertiserCallback = null
        sendEvent("onBluetoothStatus", mapOf("ready" to false, "error" to "advertising:$errorCode"))
      }
    }
    advertiserCallback = callback
    bluetoothAdapter.bluetoothLeAdvertiser.startAdvertising(
      AdvertiseSettings.Builder()
        .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
        .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_MEDIUM)
        .setConnectable(true)
        .build(),
      AdvertiseData.Builder()
        .addServiceUuid(ParcelUuid(PEER_SERVICE_UUID))
        .setIncludeDeviceName(true)
        .build(),
      callback
    )
  }

  @SuppressLint("MissingPermission")
  private fun startBleScan(durationMs: Long) {
    if (scanCallback != null) return
    val scanner = adapter.bluetoothLeScanner
      ?: throw IllegalStateException("Bluetooth scanning is unavailable on this device.")
    val callback = object : ScanCallback() {
      override fun onScanResult(callbackType: Int, result: ScanResult) = publishPeer(result)
      override fun onBatchScanResults(results: MutableList<ScanResult>) = results.forEach(::publishPeer)
      override fun onScanFailed(errorCode: Int) {
        scanCallback = null
        sendEvent("onPeerConnection", mapOf("id" to "", "connected" to false, "error" to "scan:$errorCode"))
      }
    }
    scanCallback = callback
    scanner.startScan(
      listOf(ScanFilter.Builder().setServiceUuid(ParcelUuid(PEER_SERVICE_UUID)).build()),
      ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build(),
      callback
    )
    scanStopRunnable?.let(handler::removeCallbacks)
    val stopRunnable = Runnable { stopBleScan() }
    scanStopRunnable = stopRunnable
    handler.postDelayed(stopRunnable, durationMs.coerceIn(1_000L, 30_000L))
  }

  @SuppressLint("MissingPermission")
  private fun publishPeer(result: ScanResult) {
    val device = result.device ?: return
    if (device.address == adapter.address) return
    val name = result.scanRecord?.deviceName ?: device.name ?: "SafePath device"
    sendEvent(
      "onPeerFound",
      mapOf("id" to device.address, "name" to name.take(40), "rssi" to result.rssi)
    )
  }

  @SuppressLint("MissingPermission")
  private fun stopBleScan() {
    val callback = scanCallback ?: return
    scanCallback = null
    scanStopRunnable?.let(handler::removeCallbacks)
    scanStopRunnable = null
    adapter.bluetoothLeScanner?.stopScan(callback)
  }

  @SuppressLint("MissingPermission")
  private fun connectToPeer(deviceId: String) {
    if (remoteConnections.containsKey(deviceId)) return
    val device = adapter.getRemoteDevice(deviceId)
    val gatt = device.connectGatt(context, false, remoteGattCallback, BluetoothDevice.TRANSPORT_LE)
      ?: throw IllegalStateException("Could not connect to this Bluetooth device.")
    remoteConnections[deviceId] = RemoteConnection(gatt)
  }

  private val remoteGattCallback = object : BluetoothGattCallback() {
    @SuppressLint("MissingPermission")
    override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
      val id = gatt.device.address
      if (newState == BluetoothProfile.STATE_CONNECTED && status == BluetoothGatt.GATT_SUCCESS) {
        remoteConnections[id]?.gatt?.requestMtu(247)
        gatt.discoverServices()
      } else {
        remoteConnections.remove(id)
        emitConnection(id, false)
        gatt.close()
      }
    }

    override fun onMtuChanged(gatt: BluetoothGatt, mtu: Int, status: Int) {
      if (status == BluetoothGatt.GATT_SUCCESS) remoteConnections[gatt.device.address]?.mtu = mtu
    }

    override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
      val connection = remoteConnections[gatt.device.address] ?: return
      val characteristic = gatt.getService(PEER_SERVICE_UUID)
        ?.getCharacteristic(MESSAGE_CHARACTERISTIC_UUID)
      if (status != BluetoothGatt.GATT_SUCCESS || characteristic == null) {
        remoteConnections.remove(gatt.device.address)
        emitConnection(gatt.device.address, false)
        gatt.disconnect()
        return
      }
      connection.messageCharacteristic = characteristic
      emitConnection(gatt.device.address, true)
      gatt.getService(PEER_SERVICE_UUID)?.getCharacteristic(IDENTITY_CHARACTERISTIC_UUID)?.let {
        gatt.readCharacteristic(it)
      }
    }

    override fun onCharacteristicRead(
      gatt: BluetoothGatt,
      characteristic: BluetoothGattCharacteristic,
      status: Int
    ) {
      if (status == BluetoothGatt.GATT_SUCCESS && characteristic.uuid == IDENTITY_CHARACTERISTIC_UUID) {
        val name = characteristic.value?.toString(StandardCharsets.UTF_8) ?: return
        sendEvent("onPeerConnection", mapOf("id" to gatt.device.address, "connected" to true, "name" to name))
      }
    }

    override fun onCharacteristicWrite(
      gatt: BluetoothGatt,
      characteristic: BluetoothGattCharacteristic,
      status: Int
    ) {
      val connection = remoteConnections[gatt.device.address] ?: return
      val transfer = connection.transfers.firstOrNull() ?: return
      if (status != BluetoothGatt.GATT_SUCCESS) {
        connection.transfers.removeFirst()
        transfer.promise.reject("BLE_WRITE_FAILED", "Bluetooth did not confirm delivery to ${gatt.device.name ?: "the peer"}.", null)
      } else {
        transfer.nextChunk += 1
        if (transfer.nextChunk >= transfer.chunks.size) {
          connection.transfers.removeFirst()
          transfer.promise.resolve(true)
        }
      }
      writeNextChunk(gatt.device.address, connection)
    }
  }

  private val gattServerCallback = object : BluetoothGattServerCallback() {
    override fun onServiceAdded(status: Int, service: BluetoothGattService) {
      if (service.uuid != PEER_SERVICE_UUID) return
      gattServiceReady = status == BluetoothGatt.GATT_SUCCESS
      if (advertiseAfterServiceAdded) {
        advertiseAfterServiceAdded = false
        if (gattServiceReady) {
          try {
            startAdvertising(adapter)
          } catch (error: Exception) {
            sendEvent(
              "onBluetoothStatus",
              mapOf("ready" to false, "error" to (error.message ?: "advertising_failed"))
            )
          }
        } else {
          sendEvent("onBluetoothStatus", mapOf("ready" to false, "error" to "service_registration_failed"))
        }
      }
    }

    @SuppressLint("MissingPermission")
    override fun onConnectionStateChange(device: BluetoothDevice, status: Int, newState: Int) {
      emitConnection(device.address, newState == BluetoothProfile.STATE_CONNECTED && status == BluetoothGatt.GATT_SUCCESS)
    }

    override fun onMtuChanged(device: BluetoothDevice, mtu: Int) {
      remoteConnections[device.address]?.mtu = mtu
    }

    override fun onCharacteristicReadRequest(
      device: BluetoothDevice,
      requestId: Int,
      offset: Int,
      characteristic: BluetoothGattCharacteristic
    ) {
      if (characteristic.uuid != IDENTITY_CHARACTERISTIC_UUID) {
        gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_REQUEST_NOT_SUPPORTED, offset, null)
        return
      }
      val value = localDeviceName.toByteArray(StandardCharsets.UTF_8)
      if (offset > value.size) {
        gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_INVALID_OFFSET, offset, null)
      } else {
        gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, value.copyOfRange(offset, value.size))
      }
    }

    override fun onCharacteristicWriteRequest(
      device: BluetoothDevice,
      requestId: Int,
      characteristic: BluetoothGattCharacteristic,
      preparedWrite: Boolean,
      responseNeeded: Boolean,
      offset: Int,
      value: ByteArray
    ) {
      if (characteristic.uuid != MESSAGE_CHARACTERISTIC_UUID || offset != 0 || value.size < 4) {
        if (responseNeeded) {
          gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_REQUEST_NOT_SUPPORTED, offset, null)
        }
        return
      }
      processIncomingChunk(device.address, value)
      if (responseNeeded) gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, 0, null)
    }
  }

  private fun processIncomingChunk(deviceId: String, value: ByteArray) {
    val messageId = ((value[0].toInt() and 0xff) shl 8) or (value[1].toInt() and 0xff)
    val sequence = value[2].toInt() and 0xff
    val total = value[3].toInt() and 0xff
    if (total == 0 || sequence >= total) return
    val key = "$deviceId:$messageId"
    val assembly = assemblies.computeIfAbsent(key) { MessageAssembly(total, arrayOfNulls(total)) }
    if (assembly.totalChunks != total) {
      assemblies.remove(key)
      return
    }
    assembly.chunks[sequence] = value.copyOfRange(4, value.size)
    if (assembly.chunks.all { it != null }) {
      val bytes = assembly.chunks.filterNotNull().fold(ByteArray(0)) { acc, chunk -> acc + chunk }
      assemblies.remove(key)
      sendEvent(
        "onMessageReceived",
        mapOf("id" to deviceId, "text" to bytes.toString(StandardCharsets.UTF_8))
      )
    }
  }

  private fun enqueueMessage(deviceId: String, text: String, promise: Promise) {
    val bytes = text.toByteArray(StandardCharsets.UTF_8)
    if (bytes.isEmpty() || bytes.size > MESSAGE_LIMIT_BYTES) {
      promise.reject("INVALID_MESSAGE", "Enter a message up to 4096 UTF-8 bytes.", null)
      return
    }
    val connection = remoteConnections[deviceId]
    if (connection?.messageCharacteristic == null) {
      promise.reject("PEER_NOT_CONNECTED", "This saved device is not connected.", null)
      return
    }
    val messageId = (System.nanoTime() and 0xffff).toInt()
    val mtuPayload = (connection.mtu - 3).coerceAtLeast(20)
    val chunkPayloadSize = mtuPayload - 4
    val total = (bytes.size + chunkPayloadSize - 1) / chunkPayloadSize
    if (total > 255) {
      promise.reject("MESSAGE_TOO_LARGE", "The message exceeds the Bluetooth transfer limit.", null)
      return
    }
    val chunks = (0 until total).map { sequence ->
      val from = sequence * chunkPayloadSize
      val to = min(bytes.size, from + chunkPayloadSize)
      ByteBuffer.allocate(4 + to - from)
        .put(((messageId shr 8) and 0xff).toByte())
        .put((messageId and 0xff).toByte())
        .put(sequence.toByte())
        .put(total.toByte())
        .put(bytes, from, to - from)
        .array()
    }
    connection.transfers.addLast(PendingTransfer(chunks, promise))
    writeNextChunk(deviceId, connection)
  }

  @SuppressLint("MissingPermission")
  private fun writeNextChunk(deviceId: String, connection: RemoteConnection) {
    val transfer = connection.transfers.firstOrNull() ?: return
    val characteristic = connection.messageCharacteristic ?: return
    val chunk = transfer.chunks[transfer.nextChunk]
    val accepted = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      connection.gatt.writeCharacteristic(
        characteristic,
        chunk,
        BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
      ) == BluetoothGatt.GATT_SUCCESS
    } else {
      @Suppress("DEPRECATION")
      characteristic.value = chunk
      @Suppress("DEPRECATION")
      characteristic.writeType = BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
      @Suppress("DEPRECATION")
      connection.gatt.writeCharacteristic(characteristic)
    }
    if (!accepted) {
      connection.transfers.removeFirst()
      transfer.promise.reject("BLE_WRITE_FAILED", "Bluetooth could not queue the message.", null)
      writeNextChunk(deviceId, connection)
    }
  }

  private fun emitConnection(deviceId: String, connected: Boolean) {
    sendEvent("onPeerConnection", mapOf("id" to deviceId, "connected" to connected))
  }

  @SuppressLint("MissingPermission")
  private fun stopBle() {
    stopBleScan()
    scanStopRunnable?.let(handler::removeCallbacks)
    scanStopRunnable = null
    advertiserCallback?.let { adapter.bluetoothLeAdvertiser?.stopAdvertising(it) }
    advertiserCallback = null
    advertiseAfterServiceAdded = false
    gattServiceReady = false
    remoteConnections.values.forEach {
      it.transfers.forEach { transfer ->
        transfer.promise.reject("BLE_STOPPED", "Bluetooth communication was stopped.", null)
      }
      it.gatt.disconnect()
      it.gatt.close()
    }
    remoteConnections.clear()
    gattServer?.close()
    gattServer = null
    assemblies.clear()
  }
}
