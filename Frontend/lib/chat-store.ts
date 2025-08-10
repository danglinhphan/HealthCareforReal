import { create } from 'zustand';
import { 
  sendMessage as apiSendMessage, 
  createConversation, 
  getConversation,
  streamChat,
  type Message as ApiMessage,
  type Conversation as ApiConversation
} from '@/lib/api';

export interface Message {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export interface ChatState {
  messages: Message[];
  isLoading: boolean;
  isStreaming: boolean;
  currentMessage: string;
  streamingMessage: string;
  currentConversationId: number | null;
  setMessages: (messages: Message[]) => void;
  addMessage: (message: Message) => void;
  setLoading: (loading: boolean) => void;
  setStreaming: (streaming: boolean) => void;
  setCurrentMessage: (message: string) => void;
  setStreamingMessage: (message: string) => void;
  appendToStreamingMessage: (chunk: string) => void;
  clearStreamingMessage: () => void;
  clearMessages: () => void;
  clearChat: () => void;
  setCurrentConversation: (conversationId: number | null) => void;
  loadConversation: (conversationId: number) => Promise<void>;
  sendMessage: (message: string, onConversationCreated?: (conversationId: number) => void) => Promise<void>;
}

export const useChatStore = create<ChatState>()((set, get) => ({
  messages: [],
  isLoading: false,
  isStreaming: false,
  currentMessage: '',
  streamingMessage: '',
  currentConversationId: null,
  
  setMessages: (messages) => set({ messages }),
  
  addMessage: (message) => set((state) => ({
    messages: [...state.messages, message]
  })),
  
  setLoading: (loading) => set({ isLoading: loading }),
  
  setStreaming: (streaming) => set({ isStreaming: streaming }),
  
  setCurrentMessage: (message) => set({ currentMessage: message }),
  
  setStreamingMessage: (message) => set({ streamingMessage: message }),
  
  appendToStreamingMessage: (chunk) => set((state) => ({
    streamingMessage: state.streamingMessage + chunk
  })),
  
  clearStreamingMessage: () => set({ streamingMessage: '' }),
  
  clearMessages: () => set({ messages: [], streamingMessage: '', currentMessage: '' }),
  
  clearChat: () => set({ messages: [], streamingMessage: '', currentMessage: '', currentConversationId: null }),
  
  setCurrentConversation: (conversationId) => set({ currentConversationId: conversationId }),

  loadConversation: async (conversationId: number) => {
    set({ isLoading: true });
    try {
      const userData = typeof window !== 'undefined' ? localStorage.getItem('user') : null;
      if (!userData) {
        throw new Error('User not authenticated');
      }
      
      const conversation = await getConversation(conversationId);
      
      // Convert API messages to store message format
      const messages: Message[] = conversation.messages.map((msg, index) => ({
        id: Date.now() + index, // Generate unique IDs
        role: msg.role,
        content: msg.content,
        created_at: msg.timestamp,
      }));
      
      set({ 
        messages,
        currentConversationId: conversationId,
        isLoading: false 
      });
    } catch (error) {
      console.error('Error loading conversation:', error);
      set({ isLoading: false });
    }
  },

  sendMessage: async (message: string, onConversationCreated?: (conversationId: number) => void) => {
    const { currentConversationId } = get();
    set({ isLoading: true, isStreaming: true });

    try {
      const userData = typeof window !== 'undefined' ? localStorage.getItem('user') : null;
      if (!userData) {
        throw new Error('User not authenticated');
      }

      const user = JSON.parse(userData);
      let conversationId = currentConversationId;

      // Create new conversation if none exists
      if (!conversationId) {
        const newConversation = await createConversation(message);
        conversationId = newConversation.conversation_id;
        set({ currentConversationId: conversationId });
        onConversationCreated?.(conversationId);
      }

      // Add user message immediately
      const userMessage: Message = {
        id: Date.now(),
        role: 'user',
        content: message,
        created_at: new Date().toISOString(),
      };
      
      set((state) => ({
        messages: [...state.messages, userMessage]
      }));

      // Start streaming response
      set({ streamingMessage: '' });
      
      await streamChat(
        conversationId,
        message,
        // onChunk
        (chunk: string) => {
          set((state) => ({
            streamingMessage: state.streamingMessage + chunk
          }));
        },
        // onComplete
        (fullMessage: string) => {
          const finalAssistantMessage: Message = {
            id: Date.now() + 1,
            role: 'assistant',
            content: fullMessage,
            created_at: new Date().toISOString(),
          };

          set((state) => ({
            messages: [...state.messages, finalAssistantMessage],
            streamingMessage: '',
            isStreaming: false,
            isLoading: false
          }));
        },
        // onError
        (error: string) => {
          console.error('Streaming error:', error);
          set({ isLoading: false, isStreaming: false });
          throw new Error(error);
        }
      );
    } catch (error) {
      console.error('Error sending message:', error);
      set({ isLoading: false, isStreaming: false });
      throw error;
    }
  },
}));
