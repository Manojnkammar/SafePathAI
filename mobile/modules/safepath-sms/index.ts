import { requireNativeModule } from 'expo-modules-core';

type SafePathSmsNativeModule = {
  sendSms(recipient: string, message: string): Promise<void>;
};

export const SafePathSms = {
  sendSms(recipient: string, message: string) {
    return requireNativeModule<SafePathSmsNativeModule>('SafePathSms').sendSms(recipient, message);
  },
};
