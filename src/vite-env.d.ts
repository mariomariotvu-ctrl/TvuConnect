/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  readonly VITE_FIREBASE_DATABASE_ID?: string;
  readonly VITE_FIREBASE_VAPID_KEY?: string;
  readonly VITE_FIREBASE_FUNCTIONS_REGION?: string;
  readonly VITE_GOOGLE_DRIVE_API_KEY?: string;
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  readonly VITE_GOOGLE_DRIVE_APP_ID?: string;
  readonly VITE_GOOGLE_DRIVE_FOLDER_ID?: string;
  // TURN credentials are intentionally optional. Do not use permanent credentials
  // here in production because VITE_ values are visible to the browser.
  readonly VITE_TURN_URL?: string;
  readonly VITE_TURN_USERNAME?: string;
  readonly VITE_TURN_CREDENTIAL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
