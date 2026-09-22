import { useState, useRef, useEffect } from "react";
import { Bot, Send, X, Sparkles, User, RefreshCw } from "lucide-react";

type Message = {
  id: string;
  sender: "user" | "assistant";
  text: string;
  timestamp: string;
  suggestedActions?: string[];
  sources?: string[];
};

const API_BASE = (import.meta.env["VITE_API_URL"] as string | undefined) || "http://127.0.0.1:8000";

const OFFLINE_KNOWLEDGE: Record<string, string> = {
  mrz: "Passport MRZ (Machine Readable Zone) uses a 7-3-1 weight algorithm (modulo 10) for check digits across Passport Number, DOB, and Expiration Date. An MRZ check failure suggests potential document optical tampering or OCR read error.",
  verhoeff:
    "Aadhaar 12-digit numbers end with a Verhoeff check digit calculated using D5 dihedral group operations. This validates transmission errors. Note: VeriShield masks the first 8 digits (XXXX-XXXX-1234) for UIDAI privacy compliance.",
  ela: "Error Level Analysis (ELA) analyzes JPEG compression grid uniformity. Scores below 25% indicate original unedited media, while scores >60% highlight potential font overlay or photo manipulation.",
  face: "Face match thresholds: Match >=75% is CLEAR confidence. Scores 50-74% require officer review for aging or lighting. Scores <50% trigger an ESCALATE verdict.",
  risk: "Risk Bands: CLEAR (All checksums pass, face match >=75%, low tamper score), REVIEW (minor OCR drop or borderline face match), ESCALATE (checksum fail, high tamper score >60%, or face mismatch <50%).",
  admin:
    "🛡️ **HQ Admin Access Security Notice:** Administrative credentials are protected and cannot be disclosed. Use the authorized HQ authentication method.",
};

function generateOfflineReply(query: string): { reply: string; suggestions: string[] } {
  const q = query.toLowerCase();
  if (q.includes("mrz") || q.includes("passport")) {
    return {
      reply: OFFLINE_KNOWLEDGE["mrz"] || "",
      suggestions: ["Aadhaar Verhoeff rules", "Explain ELA tamper score", "Risk band protocols"],
    };
  }
  if (q.includes("aadhaar") || q.includes("verhoeff") || q.includes("uid")) {
    return {
      reply: OFFLINE_KNOWLEDGE["verhoeff"] || "",
      suggestions: ["Explain MRZ rules", "Biometric face match rules", "Risk band protocols"],
    };
  }
  if (q.includes("ela") || q.includes("tamper") || q.includes("forgery") || q.includes("fake")) {
    return {
      reply: OFFLINE_KNOWLEDGE["ela"] || "",
      suggestions: ["Biometric face match rules", "Risk band protocols", "MRZ check rules"],
    };
  }
  if (q.includes("face") || q.includes("match") || q.includes("photo")) {
    return {
      reply: OFFLINE_KNOWLEDGE["face"] || "",
      suggestions: ["ELA tamper score explanation", "Risk band protocols", "MRZ check rules"],
    };
  }
  if (q.includes("risk") || q.includes("band") || q.includes("escalate") || q.includes("review")) {
    return {
      reply: OFFLINE_KNOWLEDGE["risk"] || "",
      suggestions: ["Explain MRZ rules", "Aadhaar Verhoeff rules", "ELA tamper score"],
    };
  }
  if (
    q.includes("admin") ||
    q.includes("password") ||
    q.includes("passcode") ||
    q.includes("secret") ||
    q.includes("login")
  ) {
    return {
      reply: OFFLINE_KNOWLEDGE["admin"] || "",
      suggestions: ["Explain Risk Band rules", "How to spot ELA forgery?"],
    };
  }
  return {
    reply:
      "VeriShield AI Assistant is active. I can help with document checksum rules (MRZ, Verhoeff), ELA tamper detection analysis, face match criteria, and risk band protocols.",
    suggestions: [
      "Explain MRZ Checksum rules",
      "How to spot ELA forgery?",
      "What triggers Escalate status?",
      "Aadhaar Verhoeff rules",
    ],
  };
}

export function Chatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      sender: "assistant",
      text: "👋 **Welcome to VeriShield AI Assistant**\n\nI provide instant officer decision support on document checksums, forgery detection (ELA), face match thresholds, and screening guidelines.",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      suggestedActions: [
        "Explain MRZ Checksum rules",
        "How to spot ELA forgery?",
        "What triggers Escalate status?",
        "Aadhaar Verhoeff rules",
      ],
    },
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend || input).trim();
    if (!text || loading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      sender: "user",
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInput("");
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: messages.map((m) => ({ sender: m.sender, text: m.text })),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const botMsg: Message = {
          id: (Date.now() + 1).toString(),
          sender: "assistant",
          text: data.reply,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          suggestedActions: data.suggested_actions,
          sources: data.sources,
        };
        setMessages((prev) => [...prev, botMsg]);
      } else {
        throw new Error("API returned non-OK");
      }
    } catch {
      // Fallback offline response engine
      const offline = generateOfflineReply(text);
      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        sender: "assistant",
        text: offline.reply,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        suggestedActions: offline.suggestions,
        sources: ["VeriShield Offline Security Engine"],
      };
      setMessages((prev) => [...prev, botMsg]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed bottom-5 right-5 z-50 font-sans">
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="group relative flex items-center gap-2 rounded-full bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 p-3.5 text-white shadow-xl transition-all duration-300 hover:scale-105 hover:shadow-2xl focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2"
          aria-label="Open VeriShield AI Assistant"
        >
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-75"></span>
            <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-400"></span>
          </span>
          <Bot className="h-6 w-6 text-white transition-transform group-hover:rotate-12" />
          <span className="pr-1 text-xs font-bold uppercase tracking-wider hidden sm:inline-block">
            AI Assistant
          </span>
        </button>
      )}

      {isOpen && (
        <div className="flex h-[520px] w-[360px] sm:w-[400px] flex-col rounded-2xl border border-emerald-500/30 bg-slate-950/95 backdrop-blur-xl shadow-2xl transition-all duration-300">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-800 bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 px-4 py-3.5 rounded-t-2xl">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 text-white shadow-md">
                <Sparkles className="h-5 w-5 animate-pulse" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
                  VeriShield AI Assistant
                  <span className="rounded bg-emerald-950/80 px-1.5 py-0.5 text-[9px] font-mono font-semibold text-emerald-400 border border-emerald-500/30">
                    ONLINE
                  </span>
                </h3>
                <p className="text-[10px] text-slate-400">Officer Field Decision Support</p>
              </div>
            </div>

            <button
              onClick={() => setIsOpen(false)}
              aria-label="Close VeriShield AI Assistant"
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Messages */}
          <div aria-live="polite" className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex flex-col ${m.sender === "user" ? "items-end" : "items-start"}`}
              >
                <div
                  className={`flex gap-2.5 max-w-[88%] ${
                    m.sender === "user" ? "flex-row-reverse" : "flex-row"
                  }`}
                >
                  <div
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs ${
                      m.sender === "user"
                        ? "bg-cyan-600 text-white"
                        : "bg-emerald-800 text-emerald-200"
                    }`}
                  >
                    {m.sender === "user" ? (
                      <User className="h-4 w-4" />
                    ) : (
                      <Bot className="h-4 w-4" />
                    )}
                  </div>

                  <div
                    className={`rounded-2xl px-3.5 py-2.5 leading-relaxed ${
                      m.sender === "user"
                        ? "bg-cyan-600 text-white rounded-tr-none shadow-md"
                        : "bg-slate-900 border border-slate-800 text-slate-200 rounded-tl-none shadow-sm"
                    }`}
                  >
                    <div className="whitespace-pre-wrap">{m.text}</div>

                    {m.sources && m.sources.length > 0 && (
                      <div className="mt-2 pt-1.5 border-t border-slate-800 text-[10px] text-emerald-400 font-mono flex items-center gap-1">
                        <span>Source:</span>
                        <span>{m.sources.join(", ")}</span>
                      </div>
                    )}
                  </div>
                </div>

                <span className="text-[9px] text-slate-500 mt-1 px-1">{m.timestamp}</span>

                {/* Suggested actions */}
                {m.suggestedActions && m.suggestedActions.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5 pl-9">
                    {m.suggestedActions.map((action, idx) => (
                      <button
                        key={idx}
                        onClick={() => void handleSend(action)}
                        aria-label={`Ask AI assistant: ${action}`}
                        className="rounded-full bg-slate-900 border border-emerald-500/30 px-3 py-1 text-[11px] font-medium text-emerald-300 hover:bg-emerald-950 hover:border-emerald-400 transition-all duration-200 text-left"
                      >
                        {action}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div role="status" aria-live="polite" className="flex items-center gap-2 text-slate-400 pl-9">
                <RefreshCw className="h-4 w-4 animate-spin text-emerald-400" />
                <span className="text-[11px] font-mono">Analyzing security knowledge base...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Footer Input */}
          <div className="border-t border-slate-800 bg-slate-950 p-3 rounded-b-2xl">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleSend();
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask AI assistant about MRZ, ELA, or risk rules..."
                aria-label="Ask AI assistant about MRZ, ELA, or risk rules"
                className="flex-1 rounded-xl bg-slate-900 border border-slate-800 px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
              <button
                type="submit"
                disabled={!input.trim() || loading}
                aria-label="Send message to AI assistant"
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600 transition-colors shadow-md"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
