const defaultProjectId = "foodhub-6ba1c";
const defaultCollection = "deepSeek";
const defaultDocument = "ooz80WHRgmUV3WseQDnF";
const defaultField = "api-key";

type FirestoreValue = {
  stringValue?: string;
  integerValue?: string;
  doubleValue?: number;
  booleanValue?: boolean;
};

type FirestoreDocument = {
  fields?: Record<string, FirestoreValue>;
};

export async function readDeepSeekApiKeyFromFirestore(): Promise<string | undefined> {
  const projectId = process.env.FOODHUB_FIRESTORE_PROJECT_ID ?? process.env.FIREBASE_PROJECT_ID ?? defaultProjectId;
  const collection = process.env.FOODHUB_DEEPSEEK_KEY_COLLECTION ?? defaultCollection;
  const document = process.env.FOODHUB_DEEPSEEK_KEY_DOCUMENT ?? defaultDocument;
  const field = process.env.FOODHUB_DEEPSEEK_KEY_FIELD ?? defaultField;

  const response = await fetch(firestoreDocumentUrl(projectId, collection, document));
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Firestore key lookup failed with ${response.status}: ${text}`);
  }

  const payload = await response.json() as FirestoreDocument;
  const value = payload.fields?.[field];
  if (!value) {
    return undefined;
  }

  if (typeof value.stringValue === "string") {
    return value.stringValue;
  }

  if (typeof value.integerValue === "string") {
    return value.integerValue;
  }

  if (typeof value.doubleValue === "number") {
    return String(value.doubleValue);
  }

  if (typeof value.booleanValue === "boolean") {
    return String(value.booleanValue);
  }

  return undefined;
}

export function deepSeekApiKeySourceLabel() {
  const projectId = process.env.FOODHUB_FIRESTORE_PROJECT_ID ?? process.env.FIREBASE_PROJECT_ID ?? defaultProjectId;
  const collection = process.env.FOODHUB_DEEPSEEK_KEY_COLLECTION ?? defaultCollection;
  const document = process.env.FOODHUB_DEEPSEEK_KEY_DOCUMENT ?? defaultDocument;
  const field = process.env.FOODHUB_DEEPSEEK_KEY_FIELD ?? defaultField;

  return `Firestore ${projectId}/${collection}/${document}/${field}`;
}

function firestoreDocumentUrl(projectId: string, collection: string, document: string) {
  const encodedCollection = encodeURIComponent(collection);
  const encodedDocument = document.split("/").map(encodeURIComponent).join("/");
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/${encodedCollection}/${encodedDocument}`;
}
