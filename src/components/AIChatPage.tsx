import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Bot, Send, Sparkles, Trash2, ArrowDown, Shield, Check, X, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface ActionProposal {
  id: string;
  type: "insert" | "update" | "delete";
  table: string;
  payload?: Record<string, any>;
  where?: Record<string, any>;
  summary?: string;
  status: "pending" | "approved" | "rejected" | "executing" | "done" | "error";
  resultMessage?: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  actions?: ActionProposal[];
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stock-ai`;

const QUICK_PROMPTS = [
  { emoji: "📊", text: "Ringkasan stok hari ini" },
  { emoji: "🏆", text: "Model paling laku minggu ini" },
  { emoji: "📦", text: "Rekomendasi restock" },
  { emoji: "🐌", text: "Stok yang lambat terjual" },
  { emoji: "➕", text: "Tambah lokasi baru 'Cabang Solo'" },
  { emoji: "🎨", text: "Tambah warna baru 'Phantom Black'" },
];

const TABLE_LABELS: Record<string, string> = {
  phone_models: "Model HP",
  stock_locations: "Lokasi Stok",
  phone_colors: "Warna",
  labels: "Label",
  stock_entries: "Entri Stok",
};

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  insert: { label: "Tambah", color: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" },
  update: { label: "Ubah", color: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30" },
  delete: { label: "Hapus", color: "bg-destructive/15 text-destructive border-destructive/30" },
};

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-muted-foreground/60 animate-[bounce_1.4s_ease-in-out_infinite]" />
        <span className="w-2 h-2 rounded-full bg-muted-foreground/60 animate-[bounce_1.4s_ease-in-out_0.2s_infinite]" />
        <span className="w-2 h-2 rounded-full bg-muted-foreground/60 animate-[bounce_1.4s_ease-in-out_0.4s_infinite]" />
      </div>
    </div>
  );
}

// Extract ```action ... ``` blocks and return cleaned text + parsed actions
function parseActions(content: string): { cleaned: string; actions: ActionProposal[] } {
  const regex = /```action\s*([\s\S]*?)```/g;
  const actions: ActionProposal[] = [];
  let match;
  let idx = 0;
  while ((match = regex.exec(content)) !== null) {
    const raw = match[1].trim();
    try {
      const parsed = JSON.parse(raw);
      actions.push({
        id: `${Date.now()}-${idx++}`,
        type: parsed.type,
        table: parsed.table,
        payload: parsed.payload,
        where: parsed.where,
        summary: parsed.summary,
        status: "pending",
      });
    } catch {
      // ignore malformed
    }
  }
  const cleaned = content.replace(regex, "").trim();
  return { cleaned, actions };
}

function ActionCard({
  action,
  onApprove,
  onReject,
}: {
  action: ActionProposal;
  onApprove: () => void;
  onReject: () => void;
}) {
  const t = TYPE_LABELS[action.type] || TYPE_LABELS.insert;
  const tableLabel = TABLE_LABELS[action.table] || action.table;
  const isDestructive = action.type === "delete";

  return (
    <div
      className={`mt-2 rounded-xl border p-3 space-y-2.5 ${
        action.status === "done"
          ? "bg-emerald-500/5 border-emerald-500/30"
          : action.status === "rejected"
            ? "bg-muted/40 border-border opacity-70"
            : action.status === "error"
              ? "bg-destructive/5 border-destructive/30"
              : isDestructive
                ? "bg-destructive/5 border-destructive/30"
                : "bg-primary/5 border-primary/20"
      }`}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <Shield className="h-3.5 w-3.5 text-muted-foreground" />
        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-5 ${t.color}`}>
          {t.label}
        </Badge>
        <span className="text-xs font-medium">{tableLabel}</span>
        {action.status === "done" && <Badge className="text-[10px] h-5 bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-0">✓ Selesai</Badge>}
        {action.status === "rejected" && <Badge variant="secondary" className="text-[10px] h-5">Ditolak</Badge>}
        {action.status === "error" && <Badge variant="destructive" className="text-[10px] h-5">Gagal</Badge>}
      </div>

      {action.summary && <p className="text-xs text-foreground/90">{action.summary}</p>}

      <details className="text-[11px]">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Lihat detail data</summary>
        <pre className="mt-1.5 p-2 rounded-md bg-background/60 overflow-x-auto text-[10px] leading-relaxed">
{JSON.stringify({ payload: action.payload, where: action.where }, null, 2)}
        </pre>
      </details>

      {action.resultMessage && (
        <p className={`text-[11px] ${action.status === "error" ? "text-destructive" : "text-muted-foreground"}`}>
          {action.resultMessage}
        </p>
      )}

      {action.status === "pending" && (
        <div className="flex gap-2 pt-1">
          <Button size="sm" variant={isDestructive ? "destructive" : "default"} className="h-7 text-xs flex-1" onClick={onApprove}>
            <Check className="h-3.5 w-3.5 mr-1" />
            Setujui
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onReject}>
            <X className="h-3.5 w-3.5 mr-1" />
            Tolak
          </Button>
        </div>
      )}

      {action.status === "executing" && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Mengeksekusi...
        </div>
      )}
    </div>
  );
}

export function AIChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => bottomRef.current?.scrollIntoView({ behavior: "smooth" });

  useEffect(() => { scrollToBottom(); }, [messages]);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    setShowScrollDown(scrollHeight - scrollTop - clientHeight > 100);
  };

  const updateAction = (msgIdx: number, actionId: string, patch: Partial<ActionProposal>) => {
    setMessages((prev) =>
      prev.map((m, i) =>
        i === msgIdx
          ? { ...m, actions: m.actions?.map((a) => (a.id === actionId ? { ...a, ...patch } : a)) }
          : m,
      ),
    );
  };

  const executeAction = async (msgIdx: number, action: ActionProposal) => {
    updateAction(msgIdx, action.id, { status: "executing" });
    try {
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          mode: "execute",
          action: { type: action.type, table: action.table, payload: action.payload, where: action.where },
        }),
      });
      const json = await resp.json();
      if (!resp.ok || !json.ok) {
        const msg = json?.error || "Gagal mengeksekusi aksi";
        updateAction(msgIdx, action.id, { status: "error", resultMessage: msg });
        toast.error(msg);
        return;
      }
      const count = Array.isArray(json.data) ? json.data.length : 1;
      updateAction(msgIdx, action.id, {
        status: "done",
        resultMessage: `Berhasil — ${count} baris terdampak.`,
      });
      toast.success("Aksi berhasil dijalankan");
    } catch (e: any) {
      updateAction(msgIdx, action.id, { status: "error", resultMessage: e.message || "Error tidak diketahui" });
      toast.error(e.message || "Gagal mengeksekusi aksi");
    }
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMsg: Message = { role: "user", content: text.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);

    let assistantSoFar = "";
    const upsertAssistant = (chunk: string) => {
      assistantSoFar += chunk;
      const { cleaned, actions } = parseActions(assistantSoFar);
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.map((m, i) =>
            i === prev.length - 1 ? { ...m, content: cleaned, actions } : m,
          );
        }
        return [...prev, { role: "assistant", content: cleaned, actions }];
      });
    };

    try {
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: newMessages.map(({ role, content }) => ({ role, content })),
        }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Gagal menghubungi AI" }));
        upsertAssistant(`❌ ${err.error || "Terjadi kesalahan"}`);
        setIsLoading(false);
        return;
      }
      if (!resp.body) throw new Error("No response body");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      let streamDone = false;

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") { streamDone = true; break; }

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) upsertAssistant(content);
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }

      if (textBuffer.trim()) {
        for (let raw of textBuffer.split("\n")) {
          if (!raw) continue;
          if (raw.endsWith("\r")) raw = raw.slice(0, -1);
          if (raw.startsWith(":") || raw.trim() === "") continue;
          if (!raw.startsWith("data: ")) continue;
          const jsonStr = raw.slice(6).trim();
          if (jsonStr === "[DONE]") continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) upsertAssistant(content);
          } catch { /* ignore */ }
        }
      }
    } catch (e) {
      console.error("AI chat error:", e);
      upsertAssistant("❌ Gagal menghubungi AI. Coba lagi nanti.");
    }

    setIsLoading(false);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)] md:h-[calc(100vh-10rem)] pb-16 md:pb-0">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 md:px-8 py-4 space-y-4 relative"
      >
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-6 animate-fade-in">
            <div className="relative">
              <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center rotate-3 transition-transform hover:rotate-0">
                <Bot className="h-10 w-10 text-primary" />
              </div>
              <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                <Sparkles className="h-3 w-3 text-primary-foreground" />
              </div>
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold">Hai, aku Shania ✨</h2>
              <p className="text-sm text-muted-foreground max-w-md">
                Asisten AI cerdas buat stok HP — sekaligus temen ngobrol kalau kamu mau curhat. Diciptakan oleh <span className="font-medium text-foreground">Ihsan</span> 💙
              </p>
              <div className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground bg-muted/50 px-2.5 py-1 rounded-full">
                <Shield className="h-3 w-3" /> Mode Admin aktif — semua aksi minta konfirmasi
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 w-full max-w-lg">
              {QUICK_PROMPTS.map((prompt) => (
                <Button
                  key={prompt.text}
                  variant="outline"
                  className="text-xs h-auto py-3 px-3 whitespace-normal text-left rounded-xl border-border/50 hover:bg-primary/5 hover:border-primary/30 transition-all"
                  onClick={() => sendMessage(`${prompt.emoji} ${prompt.text}`)}
                >
                  <span className="text-base mr-1.5">{prompt.emoji}</span>
                  {prompt.text}
                </Button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} animate-fade-in`}
          >
            {msg.role === "assistant" && (
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center mr-2 mt-1 shrink-0">
                <Bot className="h-4 w-4 text-primary" />
              </div>
            )}
            <div
              className={`max-w-[85%] md:max-w-[70%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-primary text-primary-foreground rounded-br-md"
                  : "bg-muted rounded-bl-md"
              }`}
            >
              {msg.role === "assistant" ? (
                <>
                  {msg.content && (
                    <div className="prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:leading-relaxed [&_li]:leading-relaxed [&_table]:text-xs [&_th]:px-2 [&_td]:px-2">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  )}
                  {msg.actions?.map((a) => (
                    <ActionCard
                      key={a.id}
                      action={a}
                      onApprove={() => executeAction(i, a)}
                      onReject={() => updateAction(i, a.id, { status: "rejected", resultMessage: "Aksi dibatalkan." })}
                    />
                  ))}
                </>
              ) : (
                <p>{msg.content}</p>
              )}
            </div>
          </div>
        ))}

        {isLoading && messages[messages.length - 1]?.role === "user" && (
          <div className="flex items-start gap-2 animate-fade-in">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Bot className="h-4 w-4 text-primary" />
            </div>
            <TypingIndicator />
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {showScrollDown && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-10">
          <Button
            size="icon"
            variant="secondary"
            className="rounded-full shadow-lg h-8 w-8"
            onClick={scrollToBottom}
          >
            <ArrowDown className="h-4 w-4" />
          </Button>
        </div>
      )}

      <div className="border-t border-border bg-background px-4 md:px-8 py-3">
        <div className="flex gap-2 items-center max-w-3xl mx-auto">
          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 rounded-xl text-muted-foreground hover:text-destructive"
              onClick={() => setMessages([])}
              title="Hapus chat"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
          <div className="flex-1 relative">
            <Input
              ref={inputRef}
              placeholder="Tanya atau suruh AI lakukan sesuatu..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage(input)}
              disabled={isLoading}
              className="pr-12 rounded-xl border-border/50 bg-muted/30 focus:bg-background transition-colors"
            />
            <Button
              size="icon"
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || isLoading}
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 rounded-lg"
            >
              <Send className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
