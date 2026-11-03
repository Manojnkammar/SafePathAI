package expo.modules.safepathsms

import android.telephony.SmsManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class SafePathSmsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("SafePathSms")

    AsyncFunction("sendSms") { recipient: String, message: String ->
      SmsManager.getDefault().sendTextMessage(recipient, null, message, null, null)
    }
  }
}
