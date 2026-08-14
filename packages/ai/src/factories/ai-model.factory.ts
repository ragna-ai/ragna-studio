import type { AnthropicProviderSettings } from '@ai-sdk/anthropic';
import { createAnthropic } from '@ai-sdk/anthropic';
import type { BlackForestLabsProviderSettings } from '@ai-sdk/black-forest-labs';
import { createBlackForestLabs } from '@ai-sdk/black-forest-labs';
import type { GoogleGenerativeAIProviderSettings } from '@ai-sdk/google';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { GoogleVertexProviderSettings } from '@ai-sdk/google-vertex';
import { createVertex } from '@ai-sdk/google-vertex';
import { createMistral, type MistralProviderSettings } from '@ai-sdk/mistral';
import type { OpenAIProviderSettings } from '@ai-sdk/openai';
import { createOpenAI } from '@ai-sdk/openai';
import {
  createOpenAICompatible,
  type OpenAICompatibleProviderSettings,
} from '@ai-sdk/openai-compatible';
import type { Experimental_VideoModelV4 } from '@ai-sdk/provider';
import { config } from '@repo/config';
import type { EmbeddingModel, ImageModel, LanguageModel } from 'ai';

// Both vertex.videoModel() and bfl.video() return this, so the factory
// return type no longer has to be derived from one provider's ReturnType.
type VideoModel = Experimental_VideoModelV4;

interface GetLanguageModelPayload {
  provider: string;
  model: string;
  credentials?: any;
}

interface GetImageModelPayload {
  provider: string;
  model: string;
  credentials?: any;
}

interface GetVideoModelPayload {
  provider: string;
  model: string;
  credentials?: any;
}

interface GetEmbeddingModelPayload {
  provider: string;
  model: string;
  credentials?: any;
}

const bflAuthOptions: BlackForestLabsProviderSettings = {
  baseURL: config.bflApiBaseUrl,
  apiKey: config.getSecret('BFL_API_KEY'),
};

const vertexAuthOptions: GoogleVertexProviderSettings = {
  baseURL: config.googleVertexApiBaseUrl,
  project: config.googleVertexProjectId,
  location: config.googleVertexLocation,
  googleAuthOptions: {
    credentials: {
      client_email: config.getSecret('GOOGLE_VERTEX_CLIENT_EMAIL'),
      private_key: config.getSecret('GOOGLE_VERTEX_PRIVATE_KEY'),
    },
  },
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

const mistralAuthOptions: MistralProviderSettings = {
  baseURL: config.mistralApiBaseUrl,
  apiKey: config.getSecret('MISTRAL_API_KEY'),
};

const lmStudioAuthOptions: OpenAICompatibleProviderSettings = {
  name: 'lmstudio',
  baseURL: config.lmStudioApiBaseUrl,
  apiKey: config.getSecret('LMSTUDIO_API_KEY') || undefined,
};

export function getLanguageModel(payload: GetLanguageModelPayload): LanguageModel {
  const { provider = 'anthropic', model = 'claude-sonnet-5' } = payload;

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
    case 'mistral': {
      const mistral = createMistral(mistralAuthOptions);
      return mistral(model);
    }
    case 'lm-studio': {
      const lmStudio = createOpenAICompatible(lmStudioAuthOptions);
      return lmStudio(model);
    }
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

export function getImageModel(payload: GetImageModelPayload): ImageModel {
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

export function getEmbeddingModel(payload: GetEmbeddingModelPayload): EmbeddingModel {
  const { provider = 'openai', model = 'text-embedding-3-small' } = payload;

  switch (provider) {
    case 'openai': {
      const openai = createOpenAI(openAiAuthOptions);
      return openai.embedding(model);
    }
    case 'mistral': {
      const mistral = createMistral(mistralAuthOptions);
      return mistral.embedding(model);
    }
    case 'lm-studio': {
      const lmStudio = createOpenAICompatible(lmStudioAuthOptions);
      return lmStudio.embeddingModel(model);
    }
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

export function getVideoModel(payload: GetVideoModelPayload): VideoModel {
  const { provider = 'google-vertex', model = 'veo-3.1-generate-001' } = payload;

  switch (provider) {
    case 'google-vertex': {
      const vertex = createVertex(vertexAuthOptions);
      return vertex.videoModel(model);
    }
    case 'bfl': {
      const bfl = createBlackForestLabs(bflAuthOptions);
      return bfl.video(model);
    }
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}
