import { NextResponse } from 'next/server';
import { isAiConfigured } from '@/lib/ai/gemini';
import { ALLOWED_MODELS, getDefaultModel } from '@/lib/config/models';
import { type HealthResponse } from '@/lib/ai/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse<HealthResponse>> {
  return NextResponse.json({
    status: 'ok',
    aiConfigured: isAiConfigured(),
    defaultModel: getDefaultModel(),
    allowedModels: [...ALLOWED_MODELS],
  });
}
