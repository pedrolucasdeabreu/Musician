import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.musician.app",
  appName: "Musician",
  webDir: "dist",
  ios: {
    contentInset: "automatic",
  },
};

export default config;
