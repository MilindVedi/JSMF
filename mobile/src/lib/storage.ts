import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import type { KeyValueStore } from "@jsmf/core/config";

/**
 * Durable key/value storage. Native: the OS keychain / keystore through
 * expo-secure-store — the refresh token is a credential. Web (only used to
 * test the app in a browser): localStorage, guarded like web/'s.
 *
 * SecureStore keys may only hold letters, digits, ".", "-" and "_".
 */
function webStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export const appStorage: KeyValueStore = {
  getItem: (key) => (Platform.OS === "web" ? (webStorage()?.getItem(key) ?? null) : SecureStore.getItemAsync(key)),
  setItem: (key, value) => {
    if (Platform.OS === "web") webStorage()?.setItem(key, value);
    else return SecureStore.setItemAsync(key, value);
  },
  removeItem: (key) => {
    if (Platform.OS === "web") webStorage()?.removeItem(key);
    else return SecureStore.deleteItemAsync(key);
  },
};

/** Best-effort read for non-critical state (a throw means "nothing stored"). */
export async function readStored(key: string): Promise<string | null> {
  try {
    return (await appStorage.getItem(key)) ?? null;
  } catch {
    return null;
  }
}

export async function writeStored(key: string, value: string): Promise<void> {
  try {
    await appStorage.setItem(key, value);
  } catch {
    // Storage unavailable: the in-memory value still covers this run.
  }
}
