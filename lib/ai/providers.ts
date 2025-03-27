import { customProvider, extractReasoningMiddleware, wrapLanguageModel } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { isTestEnvironment } from '../constants';
import { artifactModel, chatModel, reasoningModel, titleModel } from './models.test';

export const myProvider = isTestEnvironment
  ? customProvider({
      languageModels: {
        'chat-model': chatModel,
        'chat-model-reasoning': reasoningModel,
        'title-model': titleModel,
        'artifact-model': artifactModel
      }
    })
  : customProvider({
      languageModels: {
        'chat-model': anthropic('claude-3-7-sonnet-latest'),
        'chat-model-reasoning': wrapLanguageModel({
          model: openai('o1-mini'),
          middleware: extractReasoningMiddleware({ tagName: 'think' })
        }),
        'fast-model': openai('gpt-4o-mini'),
        'artifact-model': openai('gpt-4o')
      },
      imageModels: {
        'small-model': openai.image('dall-e-3')
      }
    });
