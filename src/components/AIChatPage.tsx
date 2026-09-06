import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Bot,
  Send,
  Sparkles,
  Trash2,
  ArrowDown,
  Shield,
  Check,
  X,
  Loader2,
  Plus,
  Pencil,
  Trash,
  Copy,
  CheckCheck,
  ChevronDown,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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
  timestamp?: number;
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stock-ai`;
const STORAGE_KEY = "shania-chat-history-v2";

const QUICK_PROMPTS = [
  { emoji: "📊", text: "Ringkasan stok hari ini", desc: "Lihat performa harian" },
  { emoji: "🏆", text: "Model paling laku minggu ini", desc: "Top sellers" },
  { emoji: "📦", text: "Rekomendasi restock", desc: "Apa yang harus dibeli" },
  { emoji: "🐌", text: "Stok yang lambat terjual", desc: "Slow movers" },
  { emoji: "➕", text: "Tambah lokasi baru 'Cabang Solo'", desc: "Contoh aksi admin" },
  { emoji: "💬", text: "Hai Shania, apa kabar?", desc: "Sekedar ngobrol" },
];

const TABLE_LABELS: Record<string, string> = {
  phone_models: "Model HP",
  stock_locations: "Lokasi Stok",
  phone_colors: "Warna",
  labels: "Label",
  stock_entries: "Entri Stok",
};

const TYPE_META: Record<
  string,
  { label: string; cls: string; Icon: typeof Plus }
> = {
  insert: {
    label: "Tambah",
    cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
    Icon: Plus,
  },
  update: {
    label: "Ubah",
    cls: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30",
    Icon: Pencil,
  },
  delete: {
    label: "Hapus",
    cls: "bg-destructive/10 text-destructive border-destructive/30",
    Icon: Trash,
  },
};

function TypingIndicator({ status }: { status?: string }) {
  return (
    <div className="bg-card border border-border/50 rounded-2xl rounded-bl-sm px-4 py-3 flex flex-col gap-1.5 shadow-sm min-w-[180px]">
      {status && (
        <span key={status} className="text-xs text-muted-foreground animate-fade-in">
          {status}
        </span>
      )}
      <div className="flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-primary/70 animate-[bounce_1.4s_ease-in-out_infinite]" />
        <span className="w-1.5 h-1.5 rounded-full bg-primary/70 animate-[bounce_1.4s_ease-in-out_0.15s_infinite]" />
        <span className="w-1.5 h-1.5 rounded-full bg-primary/70 animate-[bounce_1.4s_ease-in-out_0.3s_infinite]" />
      </div>
    </div>
  );
}

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
      /* ignore malformed */
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
  const meta = TYPE_META[action.type] || TYPE_META.insert;
  const tableLabel = TABLE_LABELS[action.table] || action.table;
  const isDestructive = action.type === "delete";
  const Icon = meta.Icon;

  return (
    <div
      className={cn(
        "mt-2.5 rounded-xl border p-3 space-y-2.5 transition-all",
        action.status === "done" && "bg-emerald-500/[0.04] border-emerald-500/30",
        action.status === "rejected" && "bg-muted/30 border-border opacity-60",
        action.status === "error" && "bg-destructive/[0.04] border-destructive/30",
        action.status === "pending" && (isDestructive ? "bg-destructive/[0.04] border-destructive/25" : "bg-primary/[0.04] border-primary/20"),
        action.status === "executing" && "bg-primary/[0.06] border-primary/30",
      )}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium border", meta.cls)}>
          <Icon className="h-3 w-3" />
          {meta.label}
        </span>
        <span className="text-xs font-semibold text-foreground/90">{tableLabel}</span>
        {action.status === "done" && (
          <Badge className="text-[10px] h-5 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-0 gap-1">
            <CheckCheck className="h-3 w-3" /> Selesai
          </Badge>
        )}
        {action.status === "rejected" && <Badge variant="secondary" className="text-[10px] h-5">Ditolak</Badge>}
        {action.status === "error" && <Badge variant="destructive" className="text-[10px] h-5">Gagal</Badge>}
      </div>

      {action.summary && <p className="text-xs text-foreground/80 leading-relaxed">{action.summary}</p>}

      <details className="text-[11px] group">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground inline-flex items-center gap-1 select-none">
          <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" />
          Lihat detail data
        </summary>
        <pre className="mt-1.5 p-2 rounded-md bg-background/70 border border-border/40 overflow-x-auto text-[10px] leading-relaxed font-mono">
{JSON.stringify({ payload: action.payload, where: action.where }, null, 2)}
        </pre>
      </details>

      {action.resultMessage && (
        <p className={cn("text-[11px]", action.status === "error" ? "text-destructive" : "text-muted-foreground")}>
          {action.resultMessage}
        </p>
      )}

      {action.status === "pending" && (
        <div className="flex gap-2 pt-0.5">
          <Button
            size="sm"
            variant={isDestructive ? "destructive" : "default"}
            className="h-8 text-xs flex-1 rounded-lg shadow-sm"
            onClick={onApprove}
          >
            <Check className="h-3.5 w-3.5 mr-1" />
            Setujui
          </Button>
          <Button size="sm" variant="outline" className="h-8 text-xs rounded-lg" onClick={onReject}>
            <X className="h-3.5 w-3.5 mr-1" />
            Tolak
          </Button>
        </div>
      )}

      {action.status === "executing" && (
        <div className="flex items-center gap-2 text-xs text-primary">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Mengeksekusi...
        </div>
      )}
    </div>
  );
}

function MessageBubble({
  msg,
  msgIdx,
  onCopy,
  onApprove,
  onReject,
  onApproveAll,
  onRejectAll,
  copiedIdx,
}: {
  msg: Message;
  msgIdx: number;
  onCopy: (text: string, idx: number) => void;
  onApprove: (i: number, a: ActionProposal) => void;
  onReject: (i: number, a: ActionProposal) => void;
  onApproveAll: (i: number, actions: ActionProposal[]) => void;
  onRejectAll: (i: number, actions: ActionProposal[]) => void;
  copiedIdx: number | null;
}) {
  const pending = msg.actions?.filter((a) => a.status === "pending") ?? [];
  const hasMultiple = pending.length > 1;
  const isUser = msg.role === "user";

  return (
    <div className={cn("flex gap-2.5 group animate-fade-in", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shrink-0 shadow-md shadow-primary/20 mt-0.5">
          <Sparkles className="h-4 w-4 text-primary-foreground" />
        </div>
      )}
      <div className={cn("flex flex-col gap-1 max-w-[85%] md:max-w-[75%]", isUser && "items-end")}>
        <div
          className={cn(
            "rounded-2xl px-4 py-2.5 text-sm leading-relaxed break-words shadow-sm border",
            isUser
              ? "bg-primary text-primary-foreground border-primary/20 rounded-br-sm"
              : "bg-card border-border/50 rounded-bl-sm",
          )}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{msg.content}</p>
          ) : (
            <>
              {msg.content && (
                <div className="prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:leading-relaxed [&_p]:my-2 [&_li]:my-0.5 [&_ul]:my-2 [&_ol]:my-2 [&_table]:text-xs [&_table]:my-2 [&_th]:px-2 [&_th]:py-1 [&_td]:px-2 [&_td]:py-1 [&_code]:text-xs [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:bg-muted [&_pre]:overflow-x-auto [&_pre]:max-w-full [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-border/50 [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&_strong]:text-foreground">
                  <ReactMarkdown
                    components={{
                      a: ({ href, children }) => {
                        const url = href || "";
                        const isWa = /wa\.me|whatsapp/i.test(url);
                        const label = isWa ? "Click here" : (children as any);
                        return (
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-0.5 font-medium text-primary underline underline-offset-2 hover:text-primary/80 transition-colors"
                          >
                            {label}
                            {isWa && <span aria-hidden>↗</span>}
                          </a>
                        );
                      },
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                </div>
              )}

              {hasMultiple && (
                <div className="mt-3 flex items-center justify-between gap-2 p-2 rounded-xl bg-primary/[0.06] border border-primary/20">
                  <div className="flex items-center gap-1.5 text-xs">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                    <span className="font-medium">{pending.length} aksi menunggu</span>
                  </div>
                  <div className="flex gap-1.5">
                    <Button size="sm" className="h-7 text-xs rounded-lg" onClick={() => onApproveAll(msgIdx, msg.actions!)}>
                      <Check className="h-3.5 w-3.5 mr-1" /> Setujui Semua
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs rounded-lg" onClick={() => onRejectAll(msgIdx, msg.actions!)}>
                      <X className="h-3.5 w-3.5 mr-1" /> Tolak
                    </Button>
                  </div>
                </div>
              )}

              {msg.actions?.map((a) => (
                <ActionCard
                  key={a.id}
                  action={a}
                  onApprove={() => onApprove(msgIdx, a)}
                  onReject={() => onReject(msgIdx, a)}
                />
              ))}
            </>
          )}
        </div>

        {!isUser && msg.content && (
          <div className="flex items-center gap-1 px-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => onCopy(msg.content, msgIdx)}
              className="text-[10px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-muted/60 transition-colors"
            >
              {copiedIdx === msgIdx ? (
                <>
                  <CheckCheck className="h-3 w-3" /> Disalin
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" /> Salin
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function AIChatPage() {
  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return [];
  });
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Persist
  useEffect(() => {
    try {
      // strip transient action statuses for cleaner persistence
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-50)));
    } catch {}
  }, [messages]);

  const scrollToBottom = useCallback((smooth = true) => {
    bottomRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "end" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setShowScrollDown(el.scrollHeight - el.scrollTop - el.clientHeight > 120);
  };

  const autoResize = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }, []);

  useEffect(() => {
    autoResize();
  }, [input, autoResize]);

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
        return false;
      }
      const count = Array.isArray(json.data) ? json.data.length : 1;
      updateAction(msgIdx, action.id, {
        status: "done",
        resultMessage: `Berhasil — ${count} baris terdampak.`,
      });
      return true;
    } catch (e: any) {
      updateAction(msgIdx, action.id, { status: "error", resultMessage: e.message || "Error tidak diketahui" });
      toast.error(e.message || "Gagal mengeksekusi aksi");
      return false;
    }
  };

  const approveAll = async (msgIdx: number, actions: ActionProposal[]) => {
    const pending = actions.filter((a) => a.status === "pending");
    if (pending.length === 0) return;
    const tId = toast.loading(`Menjalankan ${pending.length} aksi...`);
    let ok = 0;
    for (const a of pending) {
      const success = await executeAction(msgIdx, a);
      if (success) ok++;
    }
    toast.dismiss(tId);
    if (ok === pending.length) toast.success(`${ok} aksi berhasil dijalankan`);
    else if (ok > 0) toast.warning(`${ok}/${pending.length} aksi berhasil`);
    else toast.error(`Semua aksi gagal`);
  };

  const rejectAll = (msgIdx: number, actions: ActionProposal[]) => {
    actions.forEach((a) => {
      if (a.status === "pending") {
        updateAction(msgIdx, a.id, { status: "rejected", resultMessage: "Aksi dibatalkan." });
      }
    });
    toast.info("Semua aksi dibatalkan");
  };

  const handleCopy = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 1500);
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMsg: Message = { role: "user", content: text.trim(), timestamp: Date.now() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);
    // keep the caret in the box so the user can keep typing right away
    requestAnimationFrame(() => inputRef.current?.focus());

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
        return [...prev, { role: "assistant", content: cleaned, actions, timestamp: Date.now() }];
      });
    };

    try {
      abortRef.current = new AbortController();
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: newMessages.map(({ role, content }) => ({ role, content })),
        }),
        signal: abortRef.current.signal,
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
          if (jsonStr === "[DONE]") {
            streamDone = true;
            break;
          }
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
          } catch {
            /* ignore */
          }
        }
      }
    } catch (e: any) {
      if (e.name !== "AbortError") {
        console.error("AI chat error:", e);
        upsertAssistant("❌ Gagal menghubungi AI. Coba lagi nanti.");
      }
    }

    setIsLoading(false);
    abortRef.current = null;
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const stopGenerating = () => {
    abortRef.current?.abort();
    setIsLoading(false);
  };

  const clearChat = () => {
    if (messages.length === 0) return;
    setMessages([]);
    localStorage.removeItem(STORAGE_KEY);
    toast.success("Chat dibersihkan");
  };

  const messageCount = useMemo(() => messages.filter((m) => m.role === "user").length, [messages]);

  return (
    <div className="relative flex flex-col h-[calc(100vh-9rem)] md:h-[calc(100vh-7rem)] pb-16 md:pb-0 overflow-hidden bg-gradient-to-b from-background via-background to-muted/10">
      {/* Header */}
      <div className="shrink-0 border-b border-border/60 bg-background/70 backdrop-blur-xl px-4 md:px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary via-primary to-primary/60 flex items-center justify-center shadow-lg shadow-primary/30">
              <Sparkles className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-background" />
          </div>
          <div className="leading-tight">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold">Shania</h1>
              <Badge variant="secondary" className="text-[9px] h-4 px-1.5 gap-0.5">
                <Shield className="h-2.5 w-2.5" /> Admin
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {isLoading ? "Sedang mengetik..." : "Asisten AI · by Ihsan"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-muted-foreground hover:text-destructive rounded-lg"
              onClick={clearChat}
            >
              <Trash2 className="h-3.5 w-3.5 md:mr-1.5" />
              <span className="hidden md:inline">Bersihkan</span>
            </Button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain px-3 md:px-6 py-5 space-y-4 scroll-smooth [scrollbar-gutter:stable]"
      >
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center min-h-full text-center space-y-7 animate-fade-in py-8">
            <div className="relative">
              <div className="absolute inset-0 bg-primary/30 blur-3xl rounded-full animate-pulse" />
              <div className="relative w-24 h-24 rounded-3xl bg-gradient-to-br from-primary via-primary to-primary/50 flex items-center justify-center shadow-2xl shadow-primary/40 rotate-3 hover:rotate-0 transition-transform duration-500">
                <Sparkles className="h-12 w-12 text-primary-foreground" />
              </div>
            </div>
            <div className="space-y-2 max-w-md">
              <h2 className="text-2xl font-bold tracking-tight">
                Hai, aku <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">Shania</span> ✨
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Asisten AI cerdas buat manajemen stok HP — sekaligus temen ngobrol kalau kamu mau curhat.
                <br />
                Diciptakan oleh <span className="font-semibold text-foreground">Ihsan</span> 💙
              </p>
              <div className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground bg-muted/60 px-3 py-1.5 rounded-full border border-border/50">
                <Shield className="h-3 w-3 text-primary" /> Mode Admin · semua aksi minta konfirmasi
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-2xl">
              {QUICK_PROMPTS.map((p) => (
                <button
                  key={p.text}
                  onClick={() => sendMessage(p.text)}
                  className="group text-left p-3 rounded-xl border border-border/50 bg-card/50 hover:bg-card hover:border-primary/40 hover:shadow-md hover:shadow-primary/5 transition-all"
                >
                  <div className="flex items-start gap-2.5">
                    <span className="text-xl shrink-0 group-hover:scale-110 transition-transform">{p.emoji}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium leading-tight">{p.text}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{p.desc}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <MessageBubble
            key={i}
            msg={msg}
            msgIdx={i}
            onCopy={handleCopy}
            onApprove={async (idx, a) => {
              const ok = await executeAction(idx, a);
              if (ok) toast.success("Aksi berhasil dijalankan");
            }}
            onReject={(idx, a) => updateAction(idx, a.id, { status: "rejected", resultMessage: "Aksi dibatalkan." })}
            onApproveAll={approveAll}
            onRejectAll={rejectAll}
            copiedIdx={copiedIdx}
          />
        ))}

        {isLoading && messages[messages.length - 1]?.role === "user" && (
          <div className="flex items-start gap-2.5 animate-fade-in">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shrink-0 shadow-md shadow-primary/20">
              <Sparkles className="h-4 w-4 text-primary-foreground" />
            </div>
            <TypingIndicator />
          </div>
        )}

        <div ref={bottomRef} className="h-1" />
      </div>

      {/* Scroll-down button */}
      {showScrollDown && (
        <Button
          size="icon"
          variant="secondary"
          className="absolute bottom-28 md:bottom-24 right-4 md:right-6 z-10 rounded-full shadow-lg h-9 w-9 border border-border/50 animate-fade-in"
          onClick={() => scrollToBottom()}
        >
          <ArrowDown className="h-4 w-4" />
        </Button>
      )}

      {/* Input */}
      <div className="shrink-0 border-t border-border/60 bg-background/80 backdrop-blur-xl px-3 md:px-6 py-3">
        <div className="max-w-3xl mx-auto">
          <div className="relative flex items-end gap-2 rounded-2xl border border-border/60 bg-muted/30 focus-within:bg-background focus-within:border-primary/40 focus-within:shadow-lg focus-within:shadow-primary/5 transition-all p-1.5">
            <Textarea
              ref={inputRef}
              placeholder="Tanya atau suruh Shania lakukan sesuatu..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (!isLoading) sendMessage(input);
                }
              }}
              rows={1}
              className="flex-1 resize-none border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 text-sm py-2 px-2.5 min-h-[36px] max-h-[160px] shadow-none"
            />
            {isLoading ? (
              <Button
                size="icon"
                variant="destructive"
                onClick={stopGenerating}
                className="h-9 w-9 rounded-xl shrink-0 shadow-sm"
                title="Hentikan"
              >
                <X className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                size="icon"
                onClick={() => sendMessage(input)}
                disabled={!input.trim()}
                className="h-9 w-9 rounded-xl shrink-0 shadow-sm bg-gradient-to-br from-primary to-primary/80 hover:from-primary hover:to-primary disabled:opacity-40"
              >
                <Send className="h-4 w-4" />
              </Button>
            )}
          </div>
          <div className="flex items-center justify-between px-2 mt-1.5">
            <p className="text-[10px] text-muted-foreground">
              <kbd className="px-1 py-0.5 rounded border border-border/50 bg-muted/50 text-[9px]">Enter</kbd> kirim ·{" "}
              <kbd className="px-1 py-0.5 rounded border border-border/50 bg-muted/50 text-[9px]">Shift+Enter</kbd> baris baru
            </p>
            {messageCount > 0 && (
              <p className="text-[10px] text-muted-foreground">{messageCount} pesan</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
