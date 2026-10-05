"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { AccountControl } from "@/components/account-control";

type MicCapture = {
  stream: MediaStream;
  context: AudioContext;
  source: MediaStreamAudioSourceNode;
  processor: ScriptProcessorNode;
  mute: GainNode;
  chunks: Float32Array[];
};

function encodePcmAudio(chunks: Float32Array[], inputRate: number, outputRate = 16_000) {
  const inputLength = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const input = new Float32Array(inputLength);
  let inputOffset = 0;
  for (const chunk of chunks) {
    input.set(chunk, inputOffset);
    inputOffset += chunk.length;
  }

  const ratio = inputRate / outputRate;
  const outputLength = Math.floor(inputLength / ratio);
  const pcm = new ArrayBuffer(outputLength * 2);
  const view = new DataView(pcm);
  for (let outputIndex = 0; outputIndex < outputLength; outputIndex += 1) {
    const start = Math.floor(outputIndex * ratio);
    const end = Math.min(Math.floor((outputIndex + 1) * ratio), inputLength);
    let sum = 0;
    for (let inputIndex = start; inputIndex < end; inputIndex += 1) sum += input[inputIndex];
    const sample = Math.max(-1, Math.min(1, sum / Math.max(end - start, 1)));
    view.setInt16(outputIndex * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return new Blob([pcm], { type: "application/octet-stream" });
}

const classOptions = [
  "Class 6",
  "Class 7",
  "Class 8",
  "Class 9",
  "Class 10",
  "Class 11",
  "Class 12",
] as const;

const learningLevels = ["Build my basics", "Help me improve", "Challenge me"] as const;

const learningStyles = [
  { name: "Read", detail: "Text explanations", icon: "Aa" },
  { name: "Diagrams", detail: "Branching mind maps", icon: "◈" },
  { name: "Watch", detail: "3-frame storyboards", icon: "▷" },
  { name: "Explore", detail: "Hands-on activities", icon: "▧" },
  { name: "Listen", detail: "Audio playback", icon: "♫" },
  { name: "Practice", detail: "Revealable quizzes", icon: "✓" },
] as const;

const languages = ["English", "Hindi", "Hinglish"] as const;
const hindiSpeechVoices = ["Achird", "Aoede", "Kore", "Puck", "Zephyr"] as const;
const hindiSpeechVoiceLabels: Record<(typeof hindiSpeechVoices)[number], string> = {
  Achird: "Friendly",
  Aoede: "Breezy",
  Kore: "Clear",
  Puck: "Upbeat",
  Zephyr: "Bright",
};
const preferenceStorageKey = "aura-learning-preferences";
type LearningStyle = (typeof learningStyles)[number]["name"];
type LearningPreferences = {
  studentClass: (typeof classOptions)[number];
  difficulty: (typeof learningLevels)[number];
  language: (typeof languages)[number];
  selectedStyles: LearningStyle[];
};

const sectionNames: Record<LearningStyle, string> = {
  Read: "Read",
  Diagrams: "Mind map",
  Watch: "Watch",
  Explore: "Explore",
  Listen: "Listen",
  Practice: "Practice",
};
const markerStyles: Record<string, LearningStyle> = {
  READ: "Read",
  DIAGRAMS: "Diagrams",
  WATCH: "Watch",
  EXPLORE: "Explore",
  LISTEN: "Listen",
  PRACTICE: "Practice",
};

function parseExplanationSections(text: string) {
  const marker = /\[(READ|DIAGRAMS|WATCH|EXPLORE|LISTEN|PRACTICE)\]/g;
  const matches = [...text.matchAll(marker)];
  if (matches.length === 0) return [];

  return matches.map((match, index) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[index + 1]?.index ?? text.length;
    return {
      style: markerStyles[match[1]],
      content: text.slice(start, end).trim(),
    };
  });
}

function parseMindMap(content: string) {
  const normalized = content.replace(/```[^\r\n]*\r?\n?|```|\*\*/g, "").trim();
  const center = normalized.match(/(?:^|\n)\s*(?:[-*•]\s*)?CENTER:\s*([^\r\n]+)/i)?.[1]?.trim();
  const branches = [...normalized.matchAll(/(?:^|\n)\s*(?:[-*•]\s*)?BRANCH:\s*([^|\r\n]+)(?:\|\s*([^\r\n]+))?/gi)]
    .map((match) => ({ title: match[1].trim(), detail: match[2]?.trim() || "" }))
    .filter((branch) => branch.title);

  if (center && branches.length > 0) return { center, branches };

  const legacyNodes = content
    .split(/\s*(?:→|->|⟶)\s*|\r?\n/)
    .map((node) => node.trim().replace(/^[-*•]\s*/, ""))
    .filter(Boolean);
  if (legacyNodes.length > 1) {
    return {
      center: legacyNodes[0],
      branches: legacyNodes.slice(1).map((title) => ({ title, detail: "" })),
    };
  }
  return null;
}

function ListenButton({ text, language }: { text: string; language: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [audioError, setAudioError] = useState("");
  const [voice, setVoice] = useState(language === "English" ? "Aria" : "Achird");
  const [speed, setSpeed] = useState("1");

  useEffect(() => {
    setVoice(language === "English" ? "Aria" : "Achird");
    audioRef.current?.pause();
    audioRef.current = null;
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    audioUrlRef.current = null;
    setSpeaking(false);
  }, [language]);

  useEffect(() => () => {
    audioRef.current?.pause();
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
  }, []);

  const toggleAudio = async () => {
    if (speaking) {
      audioRef.current?.pause();
      setSpeaking(false);
      return;
    }

    setGenerating(true);
    setAudioError("");
    try {
      let audio = audioRef.current;
      if (!audio) {
        const response = await fetch("/api/speech", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text, language, voice }),
        });
        if (!response.ok) {
          const result = (await response.json()) as { error?: string };
          throw new Error(result.error || "AURA could not create the audio. Please try again.");
        }
        const audioUrl = URL.createObjectURL(await response.blob());
        audioUrlRef.current = audioUrl;
        audio = new Audio(audioUrl);
        audioRef.current = audio;
        audio.onended = () => setSpeaking(false);
        audio.onerror = () => {
          setSpeaking(false);
          setAudioError("Audio playback failed. Please try again.");
        };
      }
      audio.currentTime = 0;
      audio.playbackRate = Number(speed);
      await audio.play();
      setSpeaking(true);
    } catch (error) {
      setAudioError(error instanceof Error ? error.message : "Audio playback failed. Please try again.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-2 text-xs font-semibold text-slate-500">
        Voice
        <select
          aria-label="Audio voice"
          value={voice}
          disabled={generating || speaking}
          onChange={(event) => {
            setVoice(event.target.value);
            audioRef.current?.pause();
            audioRef.current = null;
            if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
            audioUrlRef.current = null;
            setSpeaking(false);
          }}
          className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-slate-800"
        >
          {language === "English"
            ? <option value="Aria">Aria · English</option>
            : hindiSpeechVoices.map((speaker) => (
              <option key={speaker} value={speaker}>{speaker} · {hindiSpeechVoiceLabels[speaker]}</option>
            ))}
        </select>
      </label>
      <label className="flex items-center gap-2 text-xs font-semibold text-slate-500">
        Speed
        <select
          aria-label="Audio playback speed"
          value={speed}
          disabled={generating}
          onChange={(event) => {
            setSpeed(event.target.value);
            if (audioRef.current) audioRef.current.playbackRate = Number(event.target.value);
          }}
          className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-slate-800"
        >
          <option value="0.8">0.8×</option>
          <option value="0.9">0.9×</option>
          <option value="1">1×</option>
          <option value="1.1">1.1×</option>
        </select>
      </label>
      <button
        type="button"
        onClick={toggleAudio}
        disabled={generating}
        className="rounded-full bg-violet-600 px-4 py-2 text-sm font-bold text-white"
      >
        {generating ? "Preparing audio…" : speaking ? "Stop audio" : "▶ Listen to this section"}
      </button>
      {audioError && <p role="alert" className="mt-2 text-sm text-red-500">{audioError}</p>}
    </div>
  );
}

function WatchPlayer({ frames }: { frames: string[] }) {
  const [playing, setPlaying] = useState(false);
  const [activeFrame, setActiveFrame] = useState(0);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setActiveFrame((current) => (current + 1) % frames.length);
    }, 2_200);
    return () => window.clearInterval(timer);
  }, [playing, frames.length]);

  return (
    <div className="mt-3">
      <div className="relative aspect-video overflow-hidden rounded-2xl border border-violet-200/70 bg-gradient-to-br from-indigo-950 via-violet-900 to-sky-800">
        <svg viewBox="0 0 600 300" className="absolute inset-0 h-full w-full" role="img" aria-label={`Animated lesson scene ${activeFrame + 1} of ${frames.length}`}>
          <path d="M55 220 C 180 70, 410 70, 545 220" fill="none" stroke="rgba(255,255,255,.45)" strokeDasharray="8 10" strokeWidth="4" />
          <circle cx={80 + activeFrame * (440 / Math.max(frames.length - 1, 1))} cy={220 - Math.sin((activeFrame / Math.max(frames.length - 1, 1)) * Math.PI) * 120} r="25" fill="#fde68a" className="drop-shadow-[0_0_18px_rgba(253,230,138,.9)] transition-all duration-700" />
          <circle cx="300" cy="72" r="3" fill="white" />
          <circle cx="500" cy="62" r="4" fill="white" />
          <circle cx="102" cy="66" r="3" fill="white" />
        </svg>
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/90 via-slate-950/60 to-transparent p-4 pt-14 text-white">
          <p className="text-xs font-bold uppercase tracking-wider text-violet-200">Scene {activeFrame + 1} of {frames.length}</p>
          <p className="mt-1 text-sm leading-6">{frames[activeFrame]?.replace(/^Frame \d+:\s*/i, "")}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setPlaying((current) => !current)}
          className="rounded-full bg-violet-600 px-4 py-2 text-sm font-bold text-white"
        >
          {playing ? "Pause animation" : "▶ Play animation"}
        </button>
        <span className="text-xs text-slate-500">Tap a scene to jump to it.</span>
      </div>
      <ol className="mt-3 grid gap-2 sm:grid-cols-3">
        {frames.map((frame, index) => (
          <li key={index}>
            <button
              type="button"
              aria-current={activeFrame === index ? "step" : undefined}
              onClick={() => {
                setActiveFrame(index);
                setPlaying(false);
              }}
              className={`h-full w-full rounded-xl border p-3 text-left text-sm leading-6 transition ${activeFrame === index ? "border-violet-500 bg-violet-500/10" : "border-slate-200/70 bg-white/5"}`}
            >
              <span className="block text-xs font-bold uppercase tracking-wide text-violet-500">Frame {index + 1}</span>
              <span className="mt-1 block">{frame.replace(/^Frame \d+:\s*/i, "")}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

function ExplanationContent({
  text,
  language,
  textColor,
}: {
  text: string;
  language: string;
  textColor: string;
}) {
  const sections = parseExplanationSections(text);

  if (sections.length === 0) {
    return <p className={`whitespace-pre-wrap leading-7 ${textColor}`}>{text}</p>;
  }

  return (
    <div className="mt-4 grid gap-4">
      {sections.map(({ style, content }, index) => {
        const answerKeyIndex = style === "Practice" ? content.search(/\n?ANSWER KEY:\s*/i) : -1;
        const questions = answerKeyIndex >= 0 ? content.slice(0, answerKeyIndex).trim() : content;
        const answerKey = answerKeyIndex >= 0 ? content.slice(answerKeyIndex).replace(/^\n?ANSWER KEY:\s*/i, "").trim() : "";
        const mindMap = style === "Diagrams" ? parseMindMap(content) : null;
        const darkDiagram = textColor.includes("slate-100");
        const frames = style === "Watch"
          ? content.split(/(?=Frame \d+:)/i).map((frame) => frame.trim()).filter(Boolean)
          : [];

        return (
          <section key={`${style}-${index}`} className="rounded-2xl border border-slate-200/70 bg-slate-500/[0.04] p-4">
            <h4 className="font-bold text-violet-500">{sectionNames[style]}</h4>
            {style === "Diagrams" && mindMap ? (
              <div className="relative mx-auto mt-5 max-w-3xl pb-1" role="img" aria-label={`Mind map about ${mindMap.center}: ${mindMap.branches.map((branch) => branch.title).join(", ")}`}>
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 hidden h-full w-full text-violet-400/80 sm:block" aria-hidden="true">
                  <path d="M50 16 C50 25 25 27 25 39 M50 16 C50 25 75 27 75 39 M25 39 V83 M75 39 V83" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.1" vectorEffect="non-scaling-stroke" />
                </svg>
                <div className="relative grid gap-3 sm:grid-cols-2">
                  <div className="mx-auto w-full max-w-sm rounded-2xl border-2 border-violet-400 bg-gradient-to-br from-violet-600 to-indigo-700 px-5 py-4 text-center text-white shadow-lg shadow-violet-950/20 sm:col-span-2">
                    <span className="block text-[10px] font-extrabold uppercase tracking-[0.2em] text-violet-100">Main idea</span>
                    <span className="mt-1 block text-base font-black">{mindMap.center}</span>
                  </div>
                  {mindMap.branches.map((branch, branchIndex) => (
                    <div key={`${branchIndex}-${branch.title}`} className={`relative rounded-2xl border p-4 pl-5 shadow-md shadow-violet-950/5 ${darkDiagram ? "border-violet-300/20 bg-slate-900/95" : "border-violet-200 bg-white/95"}`}>
                      <span className={`absolute -left-1.5 top-5 h-3 w-3 rounded-full ring-4 ${darkDiagram ? "ring-slate-900" : "ring-white"} ${["bg-sky-500", "bg-amber-500", "bg-emerald-500", "bg-fuchsia-500"][branchIndex % 4]}`} />
                      <p className={`font-extrabold ${darkDiagram ? "text-violet-300" : "text-violet-700"}`}>{branch.title}</p>
                      {branch.detail && <p className={`mt-1 text-sm leading-6 ${darkDiagram ? "text-slate-300" : "text-slate-600"}`}>{branch.detail}</p>}
                    </div>
                  ))}
                </div>
              </div>
            ) : style === "Diagrams" ? (
              <p className={`mt-3 whitespace-pre-wrap leading-7 ${textColor}`}>{content}</p>
            ) : style === "Watch" && frames.length > 0 ? (
              <WatchPlayer frames={frames} />
            ) : style === "Practice" ? (
              <div className={`mt-3 whitespace-pre-wrap leading-7 ${textColor}`}>
                <p>{questions}</p>
                {answerKey && (
                  <details className="mt-3 rounded-xl bg-emerald-500/10 p-3">
                    <summary className="cursor-pointer font-bold text-emerald-700">Reveal answers</summary>
                    <p className="mt-2 whitespace-pre-wrap">{answerKey}</p>
                  </details>
                )}
              </div>
            ) : (
              <p className={`mt-3 whitespace-pre-wrap leading-7 ${textColor}`}>{content}</p>
            )}
            {style === "Listen" && <ListenButton text={content} language={language} />}
          </section>
        );
      })}
    </div>
  );
}

export default function Home() {
  const [darkMode, setDarkMode] = useState(false);
  const [studentClass, setStudentClass] = useState<LearningPreferences["studentClass"]>("Class 8");
  const [difficulty, setDifficulty] = useState<LearningPreferences["difficulty"]>("Build my basics");
  const [language, setLanguage] = useState<LearningPreferences["language"]>("English");
  const [selectedStyles, setSelectedStyles] = useState<LearningStyle[]>(["Diagrams"]);
  const [setupSaved, setSetupSaved] = useState(false);
  const [preferenceError, setPreferenceError] = useState("");
  const [subject, setSubject] = useState("Science");
  const [chapter, setChapter] = useState("Motion");
  const [explainDifficulty, setExplainDifficulty] = useState("Easy");
  const [isExplaining, setIsExplaining] = useState(false);
  const [explanation, setExplanation] = useState("");
  const [explainError, setExplainError] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [voiceInputError, setVoiceInputError] = useState("");
  const micCaptureRef = useRef<MicCapture | null>(null);

  useEffect(() => {
    return () => {
      const capture = micCaptureRef.current;
      capture?.processor.disconnect();
      capture?.source.disconnect();
      capture?.mute.disconnect();
      capture?.stream.getTracks().forEach((track) => track.stop());
      if (capture && capture.context.state !== "closed") void capture.context.close();
    };
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(preferenceStorageKey);
      if (saved) {
        const preferences = JSON.parse(saved) as Partial<LearningPreferences>;
        if (preferences.studentClass && classOptions.includes(preferences.studentClass)) setStudentClass(preferences.studentClass);
        if (preferences.difficulty && learningLevels.includes(preferences.difficulty)) setDifficulty(preferences.difficulty);
        if (preferences.language && languages.includes(preferences.language)) setLanguage(preferences.language);
        if (Array.isArray(preferences.selectedStyles)) {
          const styles = preferences.selectedStyles.filter((style): style is LearningStyle => learningStyles.some((option) => option.name === style));
          if (styles.length > 0) setSelectedStyles(styles);
        }
        setSetupSaved(true);
      }
    } catch {
      // Keep the defaults if saved preferences are unavailable or malformed.
    }
  }, []);

  const markPreferencesChanged = () => {
    setSetupSaved(false);
    setPreferenceError("");
    setExplanation("");
  };

  const toggleLearningStyle = (style: LearningStyle) => {
    if (selectedStyles.includes(style)) {
      if (selectedStyles.length === 1) {
        setPreferenceError("Choose at least one way you like to learn.");
        return;
      }
      setSelectedStyles((current) => current.filter((item) => item !== style));
    } else {
      setSelectedStyles((current) => [...current, style]);
    }
    markPreferencesChanged();
  };

  const handleSavePreferences = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (selectedStyles.length === 0) {
      setPreferenceError("Choose at least one way you like to learn.");
      return;
    }

    const preferences: LearningPreferences = {
      studentClass,
      difficulty,
      language,
      selectedStyles,
    };
    let savedToBrowser = true;
    try {
      localStorage.setItem(preferenceStorageKey, JSON.stringify(preferences));
    } catch {
      savedToBrowser = false;
      setPreferenceError("Your choices are active, but this browser could not save them for next time.");
    }
    setSetupSaved(true);
    if (savedToBrowser) setPreferenceError("");
    document.getElementById("explain-heading")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleExplain = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (selectedStyles.length === 0) {
      setExplainError("Choose at least one way you like to learn in Getting Started.");
      return;
    }
    setIsExplaining(true);
    setExplanation("");
    setExplainError("");

    try {
      const response = await fetch("/api/explain", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subject,
          chapter,
          difficulty: explainDifficulty,
          studentClass,
          learningLevel: difficulty,
          language,
          learningStyles: selectedStyles,
        }),
      });
      if (!response.ok) {
        const result = (await response.json()) as { error?: string };
        throw new Error(result.error || "AURA could not create an explanation. Please try again.");
      }

      if (!response.body) {
        throw new Error("AURA could not start a live response. Please try again.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffered = "";
      let receivedText = false;

      const readEvent = (event: string) => {
        const data = event
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        if (!data || data === "[DONE]") return;

        const chunk = JSON.parse(data) as {
          error?: { message?: string };
          choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }>;
        };
        if (chunk.error?.message) throw new Error(chunk.error.message);

        if (chunk.choices?.[0]?.finish_reason === "length") {
          setExplainError("AURA’s response was cut short. Shorten your question or request fewer learning formats, then try again.");
        }

        const text = chunk.choices?.[0]?.delta?.content;
        if (typeof text === "string" && text) {
          receivedText = true;
          setExplanation((current) => current + text);
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffered += decoder.decode(value, { stream: true });
        const events = buffered.split(/\r?\n\r?\n/);
        buffered = events.pop() || "";
        events.forEach(readEvent);
      }
      buffered += decoder.decode();
      if (buffered.trim()) readEvent(buffered);
      if (!receivedText) {
        throw new Error("The AI provider returned an empty explanation. Please try again.");
      }
    } catch (error) {
      setExplainError(
        error instanceof Error
          ? error.message
          : "AURA could not reach the backend. Please try again.",
      );
    } finally {
      setIsExplaining(false);
    }
  };

  const sendRecordingForTranscription = async (capture: MicCapture) => {
    const sampleRate = capture.context.sampleRate;
    const pcmAudio = encodePcmAudio(capture.chunks, sampleRate);
    capture.processor.onaudioprocess = null;
    capture.processor.disconnect();
    capture.source.disconnect();
    capture.mute.disconnect();
    capture.stream.getTracks().forEach((track) => track.stop());
    setIsListening(false);
    if (capture.context.state !== "closed") {
      try {
        await capture.context.close();
      } catch {
        // The microphone is already stopped; a closed audio context needs no recovery.
      }
    }

    if (pcmAudio.size < 4_000) {
      setVoiceInputError("I didn’t hear enough speech. Tap Speak your question and try again.");
      return;
    }
    if (pcmAudio.size > 1_500_000) {
      setVoiceInputError("Please keep voice questions under about 45 seconds, then try again.");
      return;
    }

    setIsTranscribing(true);
    setVoiceInputError("");
    try {
      const response = await fetch("/api/transcribe", {
        method: "POST",
        headers: {
          "content-type": "application/octet-stream",
          "x-audio-language": language === "English" ? "en-US" : "hi-IN",
        },
        body: pcmAudio,
      });
      const result = (await response.json()) as { text?: string; error?: string };
      if (!response.ok) throw new Error(result.error || "AURA could not transcribe your question. Please try again.");
      if (!result.text?.trim()) throw new Error("I couldn’t hear the words clearly. Please try speaking a little closer to the microphone.");
      setChapter(result.text.trim());
    } catch (error) {
      setVoiceInputError(error instanceof Error ? error.message : "AURA could not transcribe your question. Please try again.");
    } finally {
      setIsTranscribing(false);
    }
  };

  const toggleVoiceInput = async () => {
    if (isListening) {
      const capture = micCaptureRef.current;
      micCaptureRef.current = null;
      if (capture) await sendRecordingForTranscription(capture);
      return;
    }
    setVoiceInputError("");
    if (!navigator.mediaDevices?.getUserMedia || !window.AudioContext) {
      setVoiceInputError("This browser cannot record from a microphone. Open AURA in a current version of Chrome or Edge.");
      return;
    }
    let pendingStream: MediaStream | null = null;
    let pendingContext: AudioContext | null = null;
    try {
      pendingStream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      pendingContext = new AudioContext({ latencyHint: "interactive" });
      await pendingContext.resume();
      const source = pendingContext.createMediaStreamSource(pendingStream);
      const processor = pendingContext.createScriptProcessor(4096, 1, 1);
      const mute = pendingContext.createGain();
      const chunks: Float32Array[] = [];
      mute.gain.value = 0;
      processor.onaudioprocess = (event) => chunks.push(event.inputBuffer.getChannelData(0).slice());
      source.connect(processor);
      processor.connect(mute);
      mute.connect(pendingContext.destination);
      micCaptureRef.current = { stream: pendingStream, context: pendingContext, source, processor, mute, chunks };
      pendingStream = null;
      pendingContext = null;
      setIsListening(true);
    } catch (error) {
      const capture = micCaptureRef.current;
      capture?.stream.getTracks().forEach((track) => track.stop());
      if (capture && capture.context.state !== "closed") void capture.context.close();
      pendingStream?.getTracks().forEach((track) => track.stop());
      if (pendingContext && pendingContext.state !== "closed") void pendingContext.close();
      setIsListening(false);
      const name = error instanceof DOMException ? error.name : "";
      setVoiceInputError(name === "NotAllowedError" || name === "SecurityError"
        ? "Microphone access is blocked. Allow it for localhost in your browser’s address-bar settings, then tap Speak your question again."
        : name === "NotFoundError" || name === "DevicesNotFoundError"
          ? "No microphone was found. Connect or enable a microphone, then try again."
          : "Could not start microphone recording. Check that your microphone is connected and not in use, then try again.");
    }
  };

  const pageColors = darkMode
    ? "bg-[#101426] text-white"
    : "bg-[#f6f7ff] text-slate-900";

  const cardColors = darkMode
    ? "border-white/10 bg-white/5"
    : "border-slate-200 bg-white shadow-xl shadow-blue-950/5";

  return (
    <main
      className={`min-h-screen px-5 py-6 transition-colors sm:px-8 lg:px-14 ${pageColors}`}
    >
      <header className="mx-auto flex max-w-7xl items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600 font-bold text-white">
            A
          </div>
          <div>
            <p className="text-lg font-bold tracking-tight">AURA</p>
            <p className="text-xs text-slate-500">Learn it your way</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <AccountControl darkMode={darkMode} />
          <button
            type="button"
            onClick={() => setDarkMode(!darkMode)}
            className={`rounded-full border px-4 py-2 text-sm font-semibold ${cardColors}`}
          >
            {darkMode ? "☀ Light mode" : "☾ Dark mode"}
          </button>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl gap-10 py-12 lg:grid-cols-2 lg:items-center lg:py-20">
        <div>
          <p className="mb-5 text-sm font-bold tracking-[0.18em] text-blue-500">
            AURA 2.0 · PERSONALIZED LEARNING
          </p>

          <h1 className="max-w-2xl text-5xl font-black leading-tight tracking-tight sm:text-6xl">
            Learn in the way{" "}
            <span className="bg-gradient-to-r from-blue-500 to-violet-600 bg-clip-text text-transparent">
              your mind enjoys.
            </span>
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-8 text-slate-500">
            Choose how you like to learn. AURA can explain topics, show ideas,
            help you practise, and support your exam preparation.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {[
              ["01", "Learn", "Understand each topic"],
              ["02", "Practice", "Build your confidence"],
              ["03", "Grow", "See your progress"],
            ].map(([number, title, detail]) => (
              <div
                key={number}
                className={`rounded-2xl border p-4 ${cardColors}`}
              >
                <p className="text-sm font-bold text-blue-500">{number}</p>
                <h2 className="mt-2 font-bold">{title}</h2>
                <p className="mt-1 text-sm text-slate-500">{detail}</p>
              </div>
            ))}
          </div>
        </div>

        <form
          onSubmit={handleSavePreferences}
          className={`rounded-3xl border p-6 sm:p-8 ${cardColors}`}
        >
          <p className="text-sm font-bold text-blue-500">GETTING STARTED</p>
          <h2 className="mt-2 text-3xl font-black">Make AURA yours</h2>
          <p className="mt-2 text-sm text-slate-500">
            AURA will use these choices to shape each lesson. You can change them later.
          </p>

          <div className="mt-7 grid gap-5">
            <label className="grid gap-2 text-sm font-bold">
              Your class
              <select
                value={studentClass}
                onChange={(event) => {
                  setStudentClass(event.target.value as LearningPreferences["studentClass"]);
                  markPreferencesChanged();
                }}
                className={`rounded-xl border p-3 outline-none ${cardColors}`}
              >
                {classOptions.map((item) => (
                  <option key={item} className="bg-white text-slate-900">
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 text-sm font-bold">
              Learning level
              <select
                value={difficulty}
                onChange={(event) => {
                  setDifficulty(event.target.value as LearningPreferences["difficulty"]);
                  markPreferencesChanged();
                }}
                className={`rounded-xl border p-3 outline-none ${cardColors}`}
              >
                {learningLevels.map((item) => (
                  <option key={item} className="bg-white text-slate-900">{item}</option>
                ))}
              </select>
            </label>

            <div>
              <p className="mb-2 text-sm font-bold">Preferred language</p>
              <div className="grid grid-cols-3 gap-2">
                {languages.map((item) => (
                  <button
                    key={item}
                    type="button"
                    aria-pressed={language === item}
                    onClick={() => {
                      setLanguage(item);
                      markPreferencesChanged();
                    }}
                    className={`rounded-xl border px-2 py-3 text-sm font-semibold ${
                      language === item
                        ? "border-blue-500 bg-blue-500 text-white"
                        : cardColors
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm font-bold">Choose all the ways you like to learn</p>
              <p className="mb-2 mt-1 text-xs text-slate-500">
                You can select one, several, or all of them.
              </p>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {learningStyles.map((item) => {
                  const isSelected = selectedStyles.includes(item.name);

                  return (
                    <button
                      key={item.name}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => toggleLearningStyle(item.name)}
                      className={`rounded-2xl border p-3 text-left transition ${
                        isSelected
                          ? "border-violet-500 bg-violet-500/10"
                          : cardColors
                      }`}
                    >
                      <span className="text-xl text-violet-500">
                        {item.icon}
                      </span>
                      <span className="mt-2 block text-sm font-bold">
                        {item.name}
                        {isSelected ? " ✓" : ""}
                      </span>
                      <span className="mt-1 block text-xs text-slate-500">
                        {item.detail}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="submit"
              className="rounded-xl bg-gradient-to-r from-blue-500 to-violet-600 px-5 py-3 font-bold text-white"
            >
              {setupSaved ? "Update my learning setup →" : "Save and start learning →"}
            </button>

            {preferenceError && (
              <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-center text-sm font-semibold text-red-600">
                {preferenceError}
              </p>
            )}
            {setupSaved && (
              <p
                aria-live="polite"
                className="rounded-xl bg-emerald-500/10 p-3 text-center text-sm font-semibold text-emerald-600"
              >
                Your setup is ready for {studentClass}, {difficulty.toLowerCase()}, in{" "}
                {language}. Learning methods:{" "}
                {selectedStyles.length > 0
                  ? selectedStyles.join(", ")
                  : "none selected"}
                .
              </p>
            )}
          </div>
        </form>
      </section>

      <section className="mx-auto max-w-7xl pb-16" aria-labelledby="explain-heading">
        <div className={`rounded-3xl border p-6 sm:p-8 ${cardColors}`}>
          <p className="text-sm font-bold text-blue-500">LEARN WITH AURA</p>
          <h2 id="explain-heading" className="mt-2 text-3xl font-black">
            Get a topic explained
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            AURA will explain this topic for {studentClass}, at your {difficulty.toLowerCase()} level, in {language}, using {selectedStyles.join(", ")}.
          </p>

          <form onSubmit={handleExplain} className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="grid gap-2 text-sm font-bold">
              Subject
              <input
                required
                maxLength={200}
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder="Science"
                className={`rounded-xl border p-3 font-normal outline-none focus:border-blue-500 ${cardColors}`}
              />
            </label>
            <label className="grid gap-2 text-sm font-bold">
              Chapter or topic
              <input
                required
                maxLength={1000}
                value={chapter}
                onChange={(event) => setChapter(event.target.value)}
                placeholder="Motion, or ask a full question"
                className={`rounded-xl border p-3 font-normal outline-none focus:border-blue-500 ${cardColors}`}
              />
              <button
                type="button"
                onClick={() => void toggleVoiceInput()}
                disabled={isTranscribing}
                aria-pressed={isListening}
                className={`justify-self-start rounded-xl border-2 px-4 py-2.5 text-sm font-extrabold shadow-md transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-300 disabled:cursor-wait disabled:opacity-80 ${isListening ? "border-red-800 bg-red-700 text-white hover:bg-red-800" : "border-violet-900 bg-violet-800 text-white hover:bg-violet-900"}`}
              >
                {isTranscribing ? "Transcribing your question…" : isListening ? "■ Stop & transcribe" : "🎙 Speak your question"}
              </button>
              {isListening && <span aria-live="polite" className="rounded-lg border border-violet-300 bg-violet-100 px-3 py-2 text-xs font-bold text-violet-950">Recording… speak clearly, then tap Stop & transcribe. Your words will appear above.</span>}
              {voiceInputError && <span role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs font-bold text-red-900">{voiceInputError}</span>}
            </label>
            <label className="grid gap-2 text-sm font-bold">
              Difficulty
              <select
                value={explainDifficulty}
                onChange={(event) => setExplainDifficulty(event.target.value)}
                className={`rounded-xl border p-3 outline-none focus:border-blue-500 ${cardColors}`}
              >
                <option className="bg-white text-slate-900">Easy</option>
                <option className="bg-white text-slate-900">Medium</option>
                <option className="bg-white text-slate-900">Hard</option>
              </select>
            </label>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={isExplaining}
                className="w-full rounded-xl bg-gradient-to-r from-blue-500 to-violet-600 px-5 py-3 font-bold text-white disabled:cursor-wait disabled:opacity-60"
              >
                {isExplaining ? "AURA is thinking…" : "Explain with AURA"}
              </button>
            </div>
          </form>

          {explainError && (
            <p role="alert" className="mt-5 rounded-xl bg-red-500/10 p-4 text-sm font-semibold text-red-600">
              {explainError}
            </p>
          )}
          {isExplaining && (
            <p aria-live="polite" className="mt-5 text-sm text-slate-500">
              Sending your question to AURA…
            </p>
          )}
          {explanation && (
            <article className={`mt-5 rounded-2xl border p-5 ${cardColors}`} aria-live="polite">
              <h3 className="font-bold">AURA’s personalized lesson</h3>
              <ExplanationContent
                text={explanation}
                language={language}
                textColor={darkMode ? "text-slate-100" : "text-slate-700"}
              />
            </article>
          )}
        </div>
      </section>
    </main>
  );
}
