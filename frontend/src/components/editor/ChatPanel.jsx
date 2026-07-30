import React, { useEffect, useRef } from 'react';
import { Send, Mic, Paperclip, Zap, Plus } from 'lucide-react';

export default function ChatPanel({
  messages,
  input,
  setInput,
  onSend,
  isTyping,
  onNewChat,
}) {
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`;
    }
  }, [input]);

  function handleSubmit(e) {
    e.preventDefault();
    onSend();
  }

  return (
    <section className="w-full lg:w-[400px] xl:w-[420px] shrink-0 h-full border-r border-zinc-800 bg-zinc-900 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-200">GoCreate Assistant</h2>
        <button
          type="button"
          onClick={onNewChat}
          className="p-1.5 text-zinc-500 hover:text-zinc-200 rounded-md hover:bg-zinc-800 transition-all"
          title="Novo chat"
        >
          <Plus size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] p-3.5 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-2xl rounded-tr-sm shadow-md shadow-blue-900/20'
                  : 'bg-zinc-950 border border-zinc-800 text-zinc-200 rounded-2xl rounded-tl-sm'
              }`}
            >
              {msg.role === 'ai' && (
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-5 h-5 rounded bg-blue-500/20 flex items-center justify-center">
                    <Zap size={12} className="text-blue-400" />
                  </div>
                  <span className="text-xs font-medium text-zinc-500">GoCreate AI</span>
                </div>
              )}
              <p className="whitespace-pre-wrap">{msg.text}</p>
            </div>
          </div>
        ))}

        {isTyping && (
          <div className="flex w-full justify-start animate-in">
            <div className="bg-zinc-950 border border-zinc-800 rounded-2xl rounded-tl-sm p-4 flex items-center gap-3">
              <div className="flex gap-1">
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
              <span className="text-zinc-500 text-xs font-medium">A gerar...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 border-t border-zinc-800 bg-zinc-950">
        <form
          onSubmit={handleSubmit}
          className="relative flex items-end bg-zinc-900 border border-zinc-700 focus-within:border-blue-600 focus-within:ring-1 focus-within:ring-blue-600/40 rounded-xl overflow-hidden transition-all"
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isTyping}
            placeholder="Pede alterações, novos ecrãs, estilos..."
            className="w-full bg-transparent border-none py-3.5 pl-4 pr-28 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none resize-none max-h-[150px] custom-scrollbar"
            rows={1}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
          />
          <div className="absolute right-2 bottom-2 flex items-center gap-0.5">
            <button
              type="button"
              className="p-1.5 text-zinc-500 hover:text-zinc-300 rounded-md hover:bg-zinc-800 transition-all"
              title="Anexar"
            >
              <Paperclip size={16} />
            </button>
            <button
              type="button"
              className="p-1.5 text-zinc-500 hover:text-zinc-300 rounded-md hover:bg-zinc-800 transition-all"
              title="Falar"
            >
              <Mic size={16} />
            </button>
            <button
              type="submit"
              disabled={!input.trim() || isTyping}
              className={`p-1.5 rounded-md transition-all ${
                input.trim() && !isTyping
                  ? 'bg-blue-600 text-white hover:bg-blue-500'
                  : 'bg-zinc-800 text-zinc-600'
              }`}
            >
              <Send size={16} />
            </button>
          </div>
        </form>
        <p className="mt-2 text-[10px] text-zinc-600 text-right">
          Shift + Enter para quebra de linha
        </p>
      </div>
    </section>
  );
}
