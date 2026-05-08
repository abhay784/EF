import "server-only";

import { randomUUID } from "crypto";

import { createServerSupabaseClient } from "@/lib/supabase/server";

const DEFAULT_BUCKET = "llm-outputs";

type LlmOutputKind = "weekly_brief" | "script_generation";

type UploadPayload = {
  type: LlmOutputKind;
  created_at: string;
  model: string;
  output: unknown;
  metadata?: Record<string, unknown>;
};

function getBucketName() {
  return process.env.SUPABASE_LLM_OUTPUTS_BUCKET || DEFAULT_BUCKET;
}

function hasSupabaseStorageConfig() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY,
  );
}

function buildStoragePath(kind: LlmOutputKind) {
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  return `${kind}/${day}/${now.toISOString()}-${randomUUID()}.json`;
}

async function ensureBucket(bucketName: string) {
  const supabase = createServerSupabaseClient();
  const { error: getError } = await supabase.storage.getBucket(bucketName);

  if (!getError) {
    return supabase;
  }

  const { error: createError } = await supabase.storage.createBucket(
    bucketName,
    {
      public: false,
    },
  );

  if (createError) {
    throw createError;
  }

  return supabase;
}

export async function uploadLlmOutput(payload: UploadPayload) {
  if (!hasSupabaseStorageConfig()) {
    console.warn(
      "Skipping Supabase LLM output upload: missing Supabase server environment variables.",
    );
    return null;
  }

  const bucketName = getBucketName();
  const path = buildStoragePath(payload.type);

  try {
    const supabase = await ensureBucket(bucketName);
    const { error } = await supabase.storage.from(bucketName).upload(
      path,
      JSON.stringify(payload, null, 2),
      {
        contentType: "application/json",
      },
    );

    if (error) {
      throw error;
    }

    return { bucket: bucketName, path };
  } catch (error) {
    console.warn("Failed to upload LLM output to Supabase Storage:", error);
    return null;
  }
}
