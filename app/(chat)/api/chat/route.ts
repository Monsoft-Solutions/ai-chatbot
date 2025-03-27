import {
  type UIMessage,
  appendResponseMessages,
  createDataStreamResponse
} from 'ai';
import { auth } from '@/app/(auth)/auth';
import { deleteChatById, getChatById, saveChat, saveMessages } from '@/lib/db/queries';
import { generateUUID, getMostRecentUserMessage, getTrailingMessageId } from '@/lib/utils';
import { generateTitleFromUserMessage } from '../../actions';
import { AgentService } from '@/lib/ai/agent/agent-service';

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const {
      id,
      messages,
      selectedChatModel,
      selectedAgentId
    }: {
      id: string;
      messages: Array<UIMessage>;
      selectedChatModel: string;
      selectedAgentId?: string;
    } = await request.json();

    const session = await auth();

    if (!session || !session.user || !session.user.id) {
      return new Response('Unauthorized', { status: 401 });
    }

    const userMessage = getMostRecentUserMessage(messages);

    if (!userMessage) {
      return new Response('No user message found', { status: 400 });
    }

    const chat = await getChatById({ id });

    if (!chat) {
      const title = await generateTitleFromUserMessage({
        message: userMessage
      });

      await saveChat({ id, userId: session.user.id, title });
    } else {
      if (chat.userId !== session.user.id) {
        return new Response('Unauthorized', { status: 401 });
      }
    }

    await saveMessages({
      messages: [
        {
          chatId: id,
          id: userMessage.id,
          role: 'user',
          parts: userMessage.parts,
          attachments: userMessage.experimental_attachments ?? [],
          createdAt: new Date()
        }
      ]
    });

    // Create a proxy DataStreamWriter to capture assistant messages
    let assistantMessage: UIMessage | null = null;
    
    return createDataStreamResponse({
      execute: async (dataStream) => {
        console.log(`Executing chat with model: ${selectedChatModel}`);
        
        // Create a proxy for the dataStream that captures relevant messages
        const proxyDataStream = {
          ...dataStream,
          writeData: (data: any) => {
            // Capture assistant message if it exists
            if (data && data.type === 'assistant_message' && data.message) {
              assistantMessage = data.message as UIMessage;
              console.log('Captured assistant message:', assistantMessage.id);
            }
            
            // Forward to the original dataStream
            return dataStream.writeData(data);
          }
        };
        
        // Initialize the agent service with the proxy dataStream
        const agentService = new AgentService({
          session,
          dataStream: proxyDataStream,
          selectedAgentId
        });
        
        // Process the messages with the appropriate agent
        await agentService.processMessages(messages);
        
        // Save the assistant message if we captured one
        if (session.user?.id && assistantMessage) {
          try {
            await saveMessages({
              messages: [
                {
                  id: assistantMessage.id || generateUUID(),
                  chatId: id,
                  role: 'assistant',
                  parts: assistantMessage.parts,
                  attachments: assistantMessage.experimental_attachments ?? [],
                  createdAt: new Date()
                }
              ]
            });
          } catch (error) {
            console.error('Failed to save assistant message', error);
          }
        }
      },
      onError: (error) => {
        console.error('Error in chat processing', error);
        return 'Oops, an error occurred!';
      }
    });
  } catch (error) {
    console.error(`Error while processing the request`, error);
    return new Response('An error occurred while processing your request!', {
      status: 500
    });
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return new Response('Not Found', { status: 404 });
  }

  const session = await auth();

  if (!session || !session.user) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const chat = await getChatById({ id });

    if (chat.userId !== session.user.id) {
      return new Response('Unauthorized', { status: 401 });
    }

    await deleteChatById({ id });

    return new Response('Chat deleted', { status: 200 });
  } catch (error) {
    return new Response('An error occurred while processing your request!', {
      status: 500
    });
  }
}
