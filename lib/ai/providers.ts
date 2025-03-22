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
          model: anthropic('claude-3-7-sonnet-latest'),
          middleware: extractReasoningMiddleware({ tagName: 'think' })
        }),
        'title-model': anthropic('claude-3-haiku-20240307'),
        'artifact-model': anthropic('claude-3-7-sonnet-latest')
      },
      imageModels: {
        'small-model': openai.image('dall-e-3')
      }
    });
