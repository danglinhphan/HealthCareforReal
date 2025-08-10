'use client';

import { useState, useRef, useEffect, useMemo, useLayoutEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { Send, Bot, User, Trash2, MessageSquare } from 'lucide-react';
import { useChatStore } from '@/lib/chat-store';
import MessageContent from '@/components/message-content';

interface ChatInterfaceProps {
  user: { user_id: number; username: string; emailaddress: string } | null;
  conversationId: number | null;
  onConversationCreated: (conversationId: number) => void;
}

export default function ChatInterface({ user, conversationId, onConversationCreated }: ChatInterfaceProps) {
  const [input, setInput] = useState('');
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [lastMessageCount, setLastMessageCount] = useState(0);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const prevConversationIdRef = useRef<number | null>(null);

  // Zustand store
  const {
    messages,
    isLoading,
    isStreaming,
    streamingMessage,
    currentConversationId,
    setCurrentConversation,
    loadConversation,
    sendMessage,
    clearChat
  } = useChatStore();

  // Load conversation when conversationId changes
  useEffect(() => {
    console.log('Effect triggered - conversationId:', conversationId);
    
    // Only run if conversationId actually changed
    if (prevConversationIdRef.current !== conversationId) {
      prevConversationIdRef.current = conversationId;
      
      if (conversationId) {
        console.log('Loading conversation:', conversationId);
        setIsTransitioning(true);
        setShouldAutoScroll(false); // Disable auto-scroll during load
        loadConversation(conversationId).finally(() => {
          // Add delay to prevent flicker, then enable auto-scroll
          setTimeout(() => {
            setIsTransitioning(false);
            setShouldAutoScroll(true);
            // Scroll to bottom after everything is settled
            setTimeout(() => scrollToBottom(), 50);
          }, 150);
        });
      } else {
        console.log('Clearing conversation');
        setCurrentConversation(null);
        clearChat();
        setIsTransitioning(false);
        setShouldAutoScroll(true);
        setLastMessageCount(0);
      }
    }
  }, [conversationId]); // Only depend on conversationId

  // Debug messages changes
  useEffect(() => {
    console.log('ChatInterface messages updated:', messages.length, messages);
  }, [messages]);

  // Function to scroll to bottom
  const scrollToBottom = () => {
    if (scrollAreaRef.current) {
      const scrollElement = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollElement) {
        scrollElement.scrollTo({
          top: scrollElement.scrollHeight,
          behavior: 'auto'
        });
      }
    }
  };

  // Smart auto-scroll: only when new messages are added or streaming
  useEffect(() => {
    if (!shouldAutoScroll || isTransitioning) return;
    
    // Check if messages count increased (new message added)
    if (messages.length > lastMessageCount) {
      setLastMessageCount(messages.length);
      // Small delay to ensure DOM is updated
      setTimeout(scrollToBottom, 10);
    }
  }, [messages.length, lastMessageCount, shouldAutoScroll, isTransitioning]);

  // Scroll during streaming
  useEffect(() => {
    if (isStreaming && shouldAutoScroll && !isTransitioning) {
      scrollToBottom();
    }
  }, [isStreaming, shouldAutoScroll, isTransitioning, streamingMessage]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || isStreaming) return;

    const messageContent = input.trim();
    setInput('');

    // Enable auto-scroll for new message
    setShouldAutoScroll(true);

    try {
      await sendMessage(messageContent, (newConversationId) => {
        onConversationCreated(newConversationId);
      });
    } catch (error) {
      console.error('Error sending message:', error);
      // Re-enable input on error
      setInput(messageContent);
    }
  };

  const formatTime = (timestamp: string) => {
    const messageDate = new Date(timestamp);
    const now = new Date();
    const diffInMs = now.getTime() - messageDate.getTime();
    const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
    const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

    // If message is from today
    if (diffInDays === 0) {
      if (diffInMinutes < 1) {
        return 'Just now';
      } else if (diffInMinutes < 60) {
        return `${diffInMinutes}m ago`;
      } else {
        return messageDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
    }
    // If message is from yesterday
    else if (diffInDays === 1) {
      return `Yesterday ${messageDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    // If message is older
    else {
      return messageDate.toLocaleDateString([], { 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit', 
        minute: '2-digit' 
      });
    }
  };

  // Memoize messages rendering to prevent unnecessary re-renders
  const memoizedMessages = useMemo(() => {
    return messages.map((message, index) => (
      <div
        key={`${message.role}-${index}-${message.created_at}`}
        className={`flex items-start space-x-4 transition-all duration-200 ${
          message.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''
        }`}
      >
        {/* Avatar */}
        <Avatar className={`w-10 h-10 flex-shrink-0 ${
          message.role === 'user' ? 'bg-blue-600' : 'bg-gray-600'
        }`}>
          <AvatarFallback>
            {message.role === 'user' ? (
              <User className="w-5 h-5 text-white" />
            ) : (
              <Bot className="w-5 h-5 text-white" />
            )}
          </AvatarFallback>
        </Avatar>
        
        {/* Message Content */}
        <div className={`flex-1 min-w-0 ${
          message.role === 'user' ? 'text-right' : ''
        }`}>
          <div className={`inline-block max-w-[85%] ${
            message.role === 'user' ? 'ml-auto' : 'mr-auto'
          }`}>
            <Card
              className={`p-4 ${
                message.role === 'user'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-gray-50 border-gray-200'
              }`}
            >
              <MessageContent 
                content={message.content} 
                isUser={message.role === 'user'} 
              />
              <p
                className={`text-xs mt-3 ${
                  message.role === 'user'
                    ? 'text-blue-100'
                    : 'text-gray-500'
                }`}
              >
                {formatTime(message.created_at)}
              </p>
            </Card>
          </div>
        </div>
      </div>
    ));
  }, [messages, isTransitioning]); // Re-memoize when messages or transition state changes

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] max-h-[900px] w-full max-w-5xl mx-auto bg-white border rounded-lg shadow-lg">
      {/* Chat Header */}
      <div className="flex items-center justify-between p-4 border-b bg-gray-50 rounded-t-lg">
        <div className="flex items-center space-x-3">
        </div>
        {messages.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={clearChat}
            className="flex items-center space-x-2 text-red-600 hover:text-red-700 hover:bg-red-50"
          >
            <Trash2 className="w-4 h-4" />
            <span>Clear Chat</span>
          </Button>
        )}
      </div>

      {/* Messages Area - Fixed Height with Scroll */}
      <ScrollArea className="flex-1 p-6 h-0 min-h-[500px]" ref={scrollAreaRef} key={currentConversationId}>
        {isLoading && messages.length === 0 && conversationId ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center space-y-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="text-gray-500">Loading conversation...</p>
            </div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center mb-6 shadow-lg">
              <Bot className="w-10 h-10 text-white" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-3">
              Welcome to AI Assistant!
            </h3>
            <p className="text-gray-600 max-w-md mb-6">
              Start a conversation with our AI assistant. Ask questions, get help with coding, learning, or just chat!
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-md w-full">
              <button 
                onClick={() => setInput("Hello! How can you help me today?")}
                className="p-3 bg-blue-50 hover:bg-blue-100 rounded-lg text-blue-700 text-sm transition-colors"
              >
                👋 Say hello
              </button>
              <button 
                onClick={() => setInput("Can you help me learn programming?")}
                className="p-3 bg-green-50 hover:bg-green-100 rounded-lg text-green-700 text-sm transition-colors"
              >
                💻 Learn coding
              </button>
              <button 
                onClick={() => setInput("Explain a complex topic to me")}
                className="p-3 bg-purple-50 hover:bg-purple-100 rounded-lg text-purple-700 text-sm transition-colors"
              >
                🧠 Get explanations
              </button>
              <button 
                onClick={() => setInput("Help me solve a problem")}
                className="p-3 bg-orange-50 hover:bg-orange-100 rounded-lg text-orange-700 text-sm transition-colors"
              >
                🔧 Problem solving
              </button>
            </div>
          </div>
        ) : (
          <div className={`space-y-6 transition-opacity duration-200 ${isTransitioning ? 'opacity-50' : 'opacity-100'}`}>
            {memoizedMessages}
            
            {(isLoading || isStreaming) && (
              <div className="flex items-start space-x-4">
                <Avatar className="w-10 h-10 bg-gray-600 flex-shrink-0">
                  <AvatarFallback>
                    <Bot className="w-5 h-5 text-white" />
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="inline-block max-w-[85%]">
                    <Card className="p-4 bg-gray-50 border-gray-200">
                      {streamingMessage ? (
                        <>
                          <MessageContent 
                            content={streamingMessage} 
                            isUser={false} 
                          />
                          <p className="text-xs mt-3 text-gray-500">
                            {formatTime(new Date().toISOString())} • typing...
                          </p>
                        </>
                      ) : (
                        <div className="flex space-x-2 items-center">
                          <div className="flex space-x-1">
                            <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></div>
                            <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                            <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                          </div>
                          <span className="text-sm text-gray-600">AI is thinking...</span>
                        </div>
                      )}
                    </Card>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </ScrollArea>

      {/* Input Area */}
      <div className="p-4 border-t bg-gray-50 rounded-b-lg">
        <form onSubmit={handleSubmit} className="flex space-x-3">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isStreaming ? "You can continue typing..." : "Type your message here..."}
            disabled={isLoading}
            className="flex-1 bg-white border-gray-300 focus:border-blue-500 focus:ring-blue-500"
            maxLength={1000}
          />
          <Button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="px-6 bg-blue-600 hover:bg-blue-700 focus:ring-blue-500"
          >
            {isLoading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </form>
        <div className="flex justify-between items-center mt-2">
          <p className="text-xs text-gray-500">
            {isStreaming ? (
              <span className="text-blue-600 flex items-center">
                <span className="w-2 h-2 bg-blue-600 rounded-full animate-pulse mr-2 block"></span>
                AI is responding... You can continue the conversation
              </span>
            ) : (
              <>Press Enter to send</>
            )}
          </p>
          <p className="text-xs text-gray-400">
            {input.length}/1000
          </p>
        </div>
      </div>
    </div>
  );
}
