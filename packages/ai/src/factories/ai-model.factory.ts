import type { AnthropicProviderSettings } from '@ai-sdk/anthropic';
import { createAnthropic } from '@ai-sdk/anthropic';
import type { BlackForestLabsProviderSettings } from '@ai-sdk/black-forest-labs';
import { createBlackForestLabs } from '@ai-sdk/black-forest-labs';
import type { GoogleGenerativeAIProviderSettings } from '@ai-sdk/google';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { GoogleVertexProviderSettings } from '@ai-sdk/google-vertex';
import { createVertex } from '@ai-sdk/google-vertex';
import type { OpenAIProviderSettings } from '@ai-sdk/openai';
import { createOpenAI } from '@ai-sdk/openai';
import { config } from '@repo/config';
import type { ImageModel, LanguageModel } from 'ai';

type VideoModel = ReturnType<ReturnType<typeof createVertex>['videoModel']>;

const bflAuthOptions: BlackForestLabsProviderSettings = {
  baseURL: config.bflApiBaseUrl,
  apiKey: config.getSecret('BFL_API_KEY'),
};

const vertexAuthOptions: GoogleVertexProviderSettings = {
  baseURL: config.googleVertexApiBaseUrl,
  project: config.googleVertexProject,
  location: config.googleVertexLocation,
  googleAuthOptions: undefined,
};

const openAiAuthOptions: OpenAIProviderSettings = {
  baseURL: config.openAiApiBaseUrl,
  apiKey: config.getSecret('OPENAI_API_KEY'),
};

const anthropicAuthOptions: AnthropicProviderSettings = {
  baseURL: config.anthropicApiBaseUrl,
  apiKey: config.getSecret('ANTHROPIC_API_KEY'),
};

const googleGenAiAuthOptions: GoogleGenerativeAIProviderSettings = {
  baseURL: config.googleGenAiApiBaseUrl,
  apiKey: config.getSecret('GOOGLE_GENAI_API_KEY'),
};

export function getLanguageModel(payload: {
  provider: string;
  model: string;
  credentials?: any;
}): LanguageModel {
  const { provider = 'anthropic', model = 'claude-sonnet-4-6' } = payload;

  switch (provider) {
    case 'anthropic': {
      const anthropic = createAnthropic(anthropicAuthOptions);
      return anthropic(model);
    }
    case 'google-genai': {
      const googleGenAi = createGoogleGenerativeAI(googleGenAiAuthOptions);
      return googleGenAi(model);
    }
    case 'google-vertex': {
      const vertex = createVertex(vertexAuthOptions);
      return vertex.languageModel(model);
    }
    case 'openai': {
      const openai = createOpenAI(openAiAuthOptions);
      return openai(model);
    }
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

export function getImageModel(payload: {
  provider: string;
  model: string;
  credentials?: any;
}): ImageModel {
  const { provider = 'bfl', model = 'flux-2-pro' } = payload;

  switch (provider) {
    case 'bfl': {
      const bfl = createBlackForestLabs(bflAuthOptions);
      return bfl.image(model);
    }
    case 'google-vertex': {
      const vertex = createVertex(vertexAuthOptions);
      return vertex.imageModel(model);
    }
    case 'openai': {
      const openai = createOpenAI(openAiAuthOptions);
      return openai.image(model);
    }
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

export function getVideoModel(payload: {
  provider: string;
  model: string;
  credentials?: any;
}): VideoModel {
  const { provider = 'google-vertex', model = 'veo-3.1-generate-001' } = payload;

  switch (provider) {
    case 'google-vertex': {
      const vertex = createVertex(vertexAuthOptions);
      return vertex.videoModel(model);
    }
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}
